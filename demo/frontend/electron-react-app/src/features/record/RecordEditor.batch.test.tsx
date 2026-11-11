/**
 * 剧情编辑 → 剧情列表多选 → 批量修改（端到端接线）。
 *
 * 这组用例锁的是**两个组件之间的接线**，批量面板本身的规则在
 * `properties/BatchTextEditor.test.tsx` / `properties/BatchEffectsEditor.test.tsx` 里：
 * - 列表里 Ctrl 选 2 条 → 「文本」「特效」页签自动换成批量面板；
 * - 批量写回只改选中的记录，且**整批只压一次撤销快照**（Ctrl+Z 一次全回去）；
 * - 「只编辑当前记录」回到单条面板。
 */
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  DEFAULT_PROJECT_SETTINGS,
  DialogueAlign,
  EFFECT_TYPE_T_CORP_FILTER,
  Emotion,
  Record as PlotRecord,
} from "@types";
import RecordEditor from "./RecordEditor";
import ApiService from "@services/ApiService";
import type { ProjectWorkspace } from "./useProjectWorkspace";

const makeRecord = (uuid: string, text: string): PlotRecord => ({
  uuid,
  durationFrames: 30,
  dialogue: {
    text,
    location: "default",
    speakerC: [],
    speakerName: "浮士德",
    faction: "N公司",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
  },
  bg: [],
  chars: [],
  tempImages: [],
  effects: [],
  audioCommands: [],
});

const records: PlotRecord[] = [
  makeRecord("r1", "第一句台词"),
  makeRecord("r2", "第二句台词"),
  makeRecord("r3", "第三句台词"),
];

const makeWorkspace = (
  overrides: Partial<ProjectWorkspace> = {},
): ProjectWorkspace => ({
  records,
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

/** 渲染编辑器并等异步面板（预览图 / 时长 / 角色列表）落定 */
const renderEditor = async (tab: ProjectWorkspace["activePropertyTab"]) => {
  const workspace = makeWorkspace({ activePropertyTab: tab });
  render(
    <RecordEditor
      projectSettings={DEFAULT_PROJECT_SETTINGS}
      setProjectSettings={jest.fn()}
      workspace={workspace}
    />,
  );
  // 等预览图那一行出现，确保首屏的异步请求都落地了
  await screen.findByText(/最终效果/);
  // 属性面板挂载后还会去拉角色列表（说话人下拉），用 act 把这次 setState 收干净
  await act(async () => {});
  return workspace;
};

/**
 * 在剧情列表里点某一行的「对话内容」单元格。
 *
 * <p>必须限定在列表区域内：同一条台词也会出现在「文本」页签的 textarea 里
 * （testing-library 的 getByText 会匹配 textarea 的值）。
 */
const clickRow = (text: string, modifiers: { ctrlKey?: boolean } = {}) => {
  const list = document.querySelector(".record-list-body") as HTMLElement;
  fireEvent.click(within(list).getByText(text), modifiers);
};

/** 在剧情列表里 Ctrl 点两行 → 选中两条记录 */
const multiSelectFirstTwo = () => {
  clickRow("第一句台词", { ctrlKey: true });
  clickRow("第二句台词", { ctrlKey: true });
};

beforeEach(() => {
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
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL =
    jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("剧情编辑 → 多选后批量修改文本", () => {
  test("只选中一条时「文本」页签仍是单条表单（不显示批量面板）", async () => {
    await renderEditor("text");

    expect(screen.queryByText("批量编辑")).toBeNull();
    expect(screen.getByLabelText("对话内容", { selector: "textarea" })).toBeTruthy();
  });

  test("Ctrl 选中两条后「文本」页签换成批量面板", async () => {
    await renderEditor("text");

    multiSelectFirstTwo();

    expect(screen.getByText("批量编辑")).toBeTruthy();
    expect(screen.getByText("已选中 2 条记录")).toBeTruthy();
    // 单条表单的字段不再显示（批量面板用的是另一套带"应用到 N 条"的输入框）
    expect(
      screen.getByRole("button", { name: "说话人名称：应用到 2 条" }),
    ).toBeTruthy();
  });

  test("批量改说话人：只改选中的两条，第三条原样保留", async () => {
    const workspace = await renderEditor("text");
    multiSelectFirstTwo();

    fireEvent.change(screen.getByLabelText("说话人名称"), {
      target: { value: "辛克莱" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "说话人名称：应用到 2 条" }),
    );

    await waitFor(() => expect(workspace.setRecords).toHaveBeenCalled());
    const next = (workspace.setRecords as jest.Mock).mock.calls[0][0] as PlotRecord[];

    expect(next.map((record) => record.dialogue.speakerName)).toEqual([
      "辛克莱",
      "辛克莱",
      "浮士德",
    ]);
    // 写回的那两条要标脏
    expect(next[0].isDirty).toBe(true);
    expect(next[1].isDirty).toBe(true);
  });

  test("整批只算一步撤销：一次 Ctrl+Z 就把两条都还原", async () => {
    const workspace = await renderEditor("text");
    multiSelectFirstTwo();

    fireEvent.change(screen.getByLabelText("说话人名称"), {
      target: { value: "辛克莱" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "说话人名称：应用到 2 条" }),
    );
    await waitFor(() => expect(workspace.setRecords).toHaveBeenCalledTimes(1));

    // Ctrl+Z：撤销栈里只有"批量改之前"的那一份快照
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    await waitFor(() => expect(workspace.setRecords).toHaveBeenCalledTimes(2));
    const restored = (workspace.setRecords as jest.Mock).mock.calls[1][0] as PlotRecord[];
    expect(restored.map((record) => record.dialogue.speakerName)).toEqual([
      "浮士德",
      "浮士德",
      "浮士德",
    ]);
    expect(workspace.showToast).toHaveBeenCalledWith("info", expect.stringContaining("已撤销"));
  });

  test("「只编辑当前记录」退出批量，回到单条表单", async () => {
    await renderEditor("text");
    multiSelectFirstTwo();

    fireEvent.click(screen.getByRole("button", { name: "只编辑当前记录" }));
    // 单条表单一挂载就会去拉角色列表：把这次异步 setState 收干净，避免 act 告警
    await act(async () => {});

    // 选中集合收成当前记录（1 条）→ 批量面板消失
    expect(screen.queryByText("批量编辑")).toBeNull();
    expect(screen.getByLabelText("对话内容", { selector: "textarea" })).toBeTruthy();
  });
});

describe("剧情编辑 → 多选后批量改特效", () => {
  test("Ctrl 选中两条后「特效」页签换成批量面板", async () => {
    await renderEditor("effects");

    multiSelectFirstTwo();

    expect(screen.getByText("批量编辑")).toBeTruthy();
    expect(screen.getByText("已选中 2 条记录")).toBeTruthy();
    // 批量面板的复选框带三态读数（4 个特效各一行）
    expect(screen.getAllByText(/全部未勾选/)).toHaveLength(4);
  });

  test("批量勾 T 巢滤镜：只改选中的两条，第三条原样保留", async () => {
    const workspace = await renderEditor("effects");
    multiSelectFirstTwo();

    fireEvent.click(screen.getByRole("checkbox", { name: "T巢滤镜" }));

    await waitFor(() => expect(workspace.setRecords).toHaveBeenCalled());
    const next = (workspace.setRecords as jest.Mock).mock.calls[0][0] as PlotRecord[];

    expect(next[0].effects).toEqual([
      { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
    ]);
    expect(next[1].effects).toEqual([
      { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
    ]);
    // 没选中的第三条不动
    expect(next[2].effects).toEqual([]);
    expect(next[2]).toBe(records[2]);
  });

  test("单条选中时仍是原来的单条特效面板（4 个复选框）", async () => {
    await renderEditor("effects");

    expect(screen.queryByText("批量编辑")).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });
});
