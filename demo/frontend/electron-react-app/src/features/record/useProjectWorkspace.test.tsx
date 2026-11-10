/**
 * 工程工作区 → 新建工程（先问是否保存当前工程，然后清空剧情列表）。
 *
 * <p>这条流程是**破坏性**的，所以用例钉住的是"什么时候绝不能清空"：
 * 点取消、保存失败、在保存对话框里取消，工程都必须原样留着。
 * 另外清空后要断开与上一个工程文件的关联，否则下一次 Ctrl+S 会把旧工程覆盖掉。
 */
import React, { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DialogueAlign, Emotion, Record as PlotRecord } from "@types";
import ApiService from "@services/ApiService";
import { ConfirmDialogHost } from "@features/common/components/ConfirmDialog";
import * as projectFile from "./projectFile";
import { useProjectWorkspace } from "./useProjectWorkspace";
import type { ProjectWorkspace } from "./useProjectWorkspace";

const makeRecord = (uuid: string, text: string): PlotRecord => ({
  uuid,
  durationFrames: 30,
  dialogue: {
    text,
    location: "default",
    speakerC: [],
    speakerName: "",
    faction: "",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
  },
  bg: [],
  chars: [],
  tempImages: [],
  effects: [],
  audioCommands: [],
  isDirty: true,
});

/** 两个记录 + 一个分组，足够看出"清空"是不是真的发生 */
const records = [makeRecord("r1", "第一句"), makeRecord("r2", "第二句")];

/** 每次渲染都会换一个 workspace 对象：用模块级变量捉最新那份 */
let workspace: ProjectWorkspace;
const captureWorkspace = (next: ProjectWorkspace) => {
  workspace = next;
};

const Probe: React.FC = () => {
  const next = useProjectWorkspace("测试工程", { stayFrames: 75 });
  useEffect(() => {
    captureWorkspace(next);
  }, [next]);
  return null;
};

/** 挂上确认框宿主 + 工作区（确认框走应用内 DOM，才能点得到按钮） */
const renderWorkspace = async () => {
  render(
    <>
      <ConfirmDialogHost />
      <Probe />
    </>,
  );
  // 等首次加载落定（records 从 undefined 变成数组）
  await waitFor(() => expect(workspace.records).not.toBeUndefined());
};

/**
 * 触发新建工程并返回它自己那条 Promise。
 * 先 act 一次让确认框渲染出来，再由调用方点按钮。
 */
const startNewProject = (): Promise<void> => {
  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = workspace.newProject();
  });
  return pending;
};

/** 等确认框 / 保存流程收尾，并把状态更新一起冲掉 */
const settle = async (pending: Promise<void>) => {
  await act(async () => {
    await pending;
  });
};

beforeEach(() => {
  jest.spyOn(ApiService, "getRecords").mockResolvedValue(records as any);
  // 后端同步（新建工程后把 data/records.json 换成空工程）：单测里不需要真的发请求
  jest.spyOn(ApiService, "importRecords").mockResolvedValue([] as any);
  // 浏览器环境没有文件系统权限，保存降级为"下载工程文件"：默认当作成功
  jest.spyOn(projectFile, "downloadProjectFile").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("工程工作区 → 新建工程", () => {
  test("选「不保存」：清空记录与分组、断开文件关联、代次 +1", async () => {
    await renderWorkspace();
    expect(workspace.records).toHaveLength(2);

    const pending = startNewProject();
    // 确认框先问一句，三个选项都在
    const dialog = await screen.findByRole("dialog", { name: "新建工程" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("是否保存当前工程？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存并新建" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "不保存" }));
    await settle(pending);

    expect(workspace.records).toEqual([]);
    expect(workspace.groups).toEqual([]);
    expect(workspace.selectedRecordIndex).toBe(0);
    expect(workspace.filePath).toBeNull();
    expect(workspace.projectGeneration).toBe(1);
    // 没保存：不该写任何工程文件
    expect(projectFile.downloadProjectFile).not.toHaveBeenCalled();
    // 后端那份初始数据也要换掉，否则重启软件旧记录又回来了
    expect(ApiService.importRecords).toHaveBeenCalledTimes(1);
    expect((ApiService.importRecords as jest.Mock).mock.calls[0][0].name).toBe(
      "测试工程.json",
    );
  });

  test("选「取消」：什么都不动，也不问后端同步", async () => {
    await renderWorkspace();

    const pending = startNewProject();
    fireEvent.click(await screen.findByRole("button", { name: "取消" }));
    await settle(pending);

    expect(workspace.records).toHaveLength(2);
    expect(workspace.projectGeneration).toBe(0);
    expect(workspace.toast?.text).toBe("已取消新建工程");
    expect(ApiService.importRecords).not.toHaveBeenCalled();
  });

  test("选「保存并新建」：先把当前工程存下来，再清空", async () => {
    await renderWorkspace();

    const pending = startNewProject();
    fireEvent.click(await screen.findByRole("button", { name: "保存并新建" }));
    await settle(pending);

    const download = projectFile.downloadProjectFile as jest.Mock;
    expect(download).toHaveBeenCalledTimes(1);
    const savedText = download.mock.calls[0][0] as string;
    expect(savedText).toContain("第一句");
    expect(savedText).toContain("第二句");

    expect(workspace.records).toEqual([]);
    expect(workspace.projectGeneration).toBe(1);
    expect(workspace.toast?.text).toBe("已保存并新建工程");
  });

  test("保存失败（或用户在保存对话框里取消）→ 绝不清空当前工程", async () => {
    await renderWorkspace();
    // 模拟保存这一步失败：写盘报错 / 用户在系统保存框里点了取消
    (projectFile.downloadProjectFile as jest.Mock).mockImplementation(() => {
      throw new Error("磁盘写入失败");
    });

    const pending = startNewProject();
    fireEvent.click(await screen.findByRole("button", { name: "保存并新建" }));
    await settle(pending);

    expect(workspace.records).toHaveLength(2);
    expect(workspace.projectGeneration).toBe(0);
    expect(workspace.toast?.kind).toBe("error");
    expect(ApiService.importRecords).not.toHaveBeenCalled();
  });

  test("空工程不弹确认框，直接新建", async () => {
    (ApiService.getRecords as jest.Mock).mockResolvedValue([]);
    await renderWorkspace();
    expect(workspace.records).toEqual([]);

    const pending = startNewProject();
    expect(screen.queryByRole("dialog")).toBeNull();
    await settle(pending);

    expect(workspace.records).toEqual([]);
    expect(workspace.projectGeneration).toBe(1);
    expect(workspace.toast?.text).toBe("已新建工程");
  });
});
