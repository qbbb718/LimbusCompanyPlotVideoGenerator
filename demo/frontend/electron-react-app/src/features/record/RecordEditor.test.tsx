/**
 * 剧情编辑 → 「摄像机」页签的接线。
 *
 * 摄像机原先浮在预览画面上（「🖼 最终效果 / 🎥 摄像机」两个按钮），现在是右侧的独立页签。
 * 这组用例锁住**页签与预览的联动**：
 * - 「摄像机」页签下预览切到世界视图（没渲染 UI 的画布 + 取景框），右侧是镜头控件；
 * - 其它页签下预览回到后端渲的成片，世界视图不挂载；
 * - 点页签栏的「摄像机」会通知 workspace 切页签（真实状态由 App 层持有）。
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  DEFAULT_PROJECT_SETTINGS,
  DialogueAlign,
  Emotion,
  Record as PlotRecord,
} from "@types";
import RecordEditor from "./RecordEditor";
import ApiService from "@services/ApiService";
import type { ProjectWorkspace } from "./useProjectWorkspace";

const makeRecord = (overrides: Partial<PlotRecord> = {}): PlotRecord => ({
  uuid: "r1",
  durationFrames: 30,
  dialogue: {
    text: "台词",
    location: "default",
    speakerC: [],
    speakerName: "旁白",
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
  ...overrides,
});

const makeWorkspace = (
  overrides: Partial<ProjectWorkspace> = {},
): ProjectWorkspace => ({
  records: [makeRecord()],
  setRecords: jest.fn(),
  groups: [],
  setGroups: jest.fn(),
  selectedRecordIndex: 0,
  setSelectedRecordIndex: jest.fn(),
  activePropertyTab: "text",
  setActivePropertyTab: jest.fn(),
  filePath: null,
  fileName: null,
  projectGeneration: 0,
  isLoadingProject: false,
  toast: null,
  dismissToast: jest.fn(),
  showToast: jest.fn(),
  saveProject: jest.fn(),
  importProject: jest.fn(),
  newProject: jest.fn(),
  adoptParsedRecords: jest.fn(),
  ...overrides,
});

/** 渲染编辑器（右侧页签由 workspace.activePropertyTab 决定） */
const renderEditor = (tab: ProjectWorkspace["activePropertyTab"]) =>
  render(
    <RecordEditor
      projectSettings={DEFAULT_PROJECT_SETTINGS}
      setProjectSettings={jest.fn()}
      workspace={makeWorkspace({ activePropertyTab: tab })}
    />,
  );

beforeEach(() => {
  // 预览图 / 时长 / 资源列表都走后端：单测里给出固定返回，避免真的发请求
  jest.spyOn(ApiService, "getRecordPreview").mockResolvedValue("blob:preview");
  jest.spyOn(ApiService, "getRecordDuration").mockResolvedValue({
    frames: 105,
    audioFrames: 0,
    textFrames: 30,
    animationFrames: 0,
    stayFrames: 75,
    frameRate: 30,
  });
  jest.spyOn(ApiService, "getCharacters").mockResolvedValue([]);
  // jsdom 没有实现 object URL：预览图拿到的是 "blob:preview"，组件卸载时会 release 它。
  // 不补这两个函数的话，卸载（RTL cleanup）会抛 "URL.revokeObjectURL is not a function"，
  // 而且只在"预览图已经到达"的时序下才触发，看起来像随机失败。
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL =
    jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("剧情编辑 → 摄像机页签驱动预览", () => {
  test("默认「文本」页签：预览是成片，没有世界视图", async () => {
    renderEditor("text");

    // 等异步面板（说话人列表等）落定，避免 act 警告
    expect(await screen.findByText(/最终效果/)).toBeTruthy();
    // 取景框读数只出现在世界视图里 → 没挂载
    expect(screen.queryByText("🎥 1.00×")).toBeNull();
    // 摄像机控件不在这个页签里
    expect(screen.queryByLabelText("镜头缩放滑块")).toBeNull();
  });

  test("「摄像机」页签：预览切到世界视图，右侧是镜头控件", async () => {
    renderEditor("camera");

    // 世界视图（没渲染 UI 的画布 + 16:9 取景框）：状态标签 + 取景框读数
    expect(await screen.findByText(/世界视图/)).toBeTruthy();
    expect(screen.getByText("🎥 1.00×")).toBeTruthy();
    // 右侧面板 = 摄像机页签的内容
    expect(
      screen.getByText(/静止镜头/, { selector: ".camera-summary-state" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("镜头缩放滑块")).toBeTruthy();
  });

  test("点页签栏的「摄像机」→ 通知 workspace 切到 camera", async () => {
    const workspace = makeWorkspace({ activePropertyTab: "text" });
    render(
      <RecordEditor
        projectSettings={DEFAULT_PROJECT_SETTINGS}
        setProjectSettings={jest.fn()}
        workspace={workspace}
      />,
    );

    fireEvent.click(await screen.findByRole("tab", { name: /摄像机/ }));

    expect(workspace.setActivePropertyTab).toHaveBeenCalledWith("camera");
  });
});

describe("剧情编辑 → 新建工程", () => {
  test("新建工程（记录被清空、代次 +1）后自动补一条空白记录", async () => {
    // 真实状态在 App 层：清空与代次 +1 由 workspace.newProject 一起做，
    // 这里直接构造那个"已经清空"的入参，验证编辑器把空白记录补回来
    const workspace = makeWorkspace({ records: [makeRecord()] });
    const { rerender } = render(
      <RecordEditor
        projectSettings={DEFAULT_PROJECT_SETTINGS}
        setProjectSettings={jest.fn()}
        workspace={workspace}
      />,
    );
    await screen.findByText(/最终效果/);

    rerender(
      <RecordEditor
        projectSettings={DEFAULT_PROJECT_SETTINGS}
        setProjectSettings={jest.fn()}
        workspace={{ ...workspace, records: [], projectGeneration: 1 }}
      />,
    );

    // 补的是"一条空白记录"：没有继承上一条的台词 / 角色 / 背景
    await waitFor(() => expect(workspace.setRecords).toHaveBeenCalled());
    const added = (workspace.setRecords as jest.Mock).mock.calls[0][0] as PlotRecord[];
    expect(added).toHaveLength(1);
    expect(added[0].dialogue.text).toBe("");
    expect(added[0].chars).toEqual([]);
    expect(added[0].bg).toEqual([]);
    expect(added[0].uuid).toBeTruthy();
  });
});
