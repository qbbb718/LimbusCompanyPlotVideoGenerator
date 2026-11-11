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

/**
 * 剧情编辑 → 素材页签（立绘 / 临时图片 / 背景）与预览的联动接线：
 *
 * - **点卡片** = 在预览里选中这个素材；素材在取景之外时预览自动切世界视图把它显示出来；
 * - **勾复选框** = 批量选择，不碰预览选中；两者互不影响；
 * - **删除素材**后预览选中同步清掉（否则选中框会指到"下一张"上）。
 *
 * 这里走的是真实链路：页签组件 → RecordEditor 持有的 previewSelection / previewReveal
 * → RecordPreview（世界视图）。几何计算要原图尺寸，jsdom 不会真的加载图片，所以把
 * useImageSizes 换成一个固定尺寸的替身。
 */

jest.mock("./preview/useImageSizes", () => ({
  useImageSizes: (urls: string[]) => ({
    sizes: Object.fromEntries(
      urls.filter(Boolean).map((url) => [url, { width: 400, height: 600 }]),
    ),
    pending: 0,
  }),
}));

/** 画面之外：成片里完全看不到这张立绘 */
const OFFSCREEN_ADJ_X = -6000;

const makeRecord = (adjX: number): PlotRecord => ({
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
  chars: [
    {
      chara: {
        characterID: "c1",
        characterName: "罗佳",
        height: 171,
        faction: "未设定",
        colorBg: "#FFFFFF",
        colorText: "#000000",
      },
      portrait: {
        portraitID: "p1",
        characterID: "c1",
        imagePath: "characters/c1/p1.png",
        portName: "默认立绘",
        emotion: Emotion.NORMAL,
        faceX: 0,
        faceY: 0,
        length: 183,
        adjX: 0,
        adjY: 0,
        thumbnailPath: "",
      },
      posX: 960,
      posY: 0,
      adjX,
      adjY: 0,
      scale: 1,
      dim: false,
    },
  ],
  tempImages: [],
  effects: [],
  audioCommands: [],
});

const makeWorkspace = (
  overrides: Partial<ProjectWorkspace> = {},
): ProjectWorkspace => ({
  records: [makeRecord(0)],
  setRecords: jest.fn(),
  groups: [],
  setGroups: jest.fn(),
  selectedRecordIndex: 0,
  setSelectedRecordIndex: jest.fn(),
  activePropertyTab: "characters",
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

const renderEditor = (record: PlotRecord) =>
  render(
    <RecordEditor
      projectSettings={DEFAULT_PROJECT_SETTINGS}
      setProjectSettings={jest.fn()}
      workspace={makeWorkspace({ records: [record] })}
    />,
  );

/** 卡片是否处于"预览选中"态（由 RecordEditor 的 previewSelection 决定） */
const cardPreviewSelected = (): string | null | undefined =>
  document.querySelector(".character-item")?.getAttribute("data-preview-selected");

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

describe("素材页签点卡片 → 预览选中", () => {
  test("点立绘卡片：卡片进入预览选中态，预览仍留在成片", async () => {
    renderEditor(makeRecord(0));

    fireEvent.click(await screen.findByRole("heading", { name: "罗佳" }));

    await waitFor(() => expect(cardPreviewSelected()).toBe("true"));
    // 素材在画面里：不需要切世界视图
    expect(screen.queryByText(/世界视图/)).toBeNull();
    expect(screen.getByText(/最终效果/)).toBeTruthy();
  });

  test("素材在取景之外：预览自动切到世界视图，把这个素材显示出来", async () => {
    renderEditor(makeRecord(OFFSCREEN_ADJ_X));

    fireEvent.click(await screen.findByRole("heading", { name: "罗佳" }));

    expect(await screen.findByText(/世界视图/)).toBeTruthy();
    // 世界视图里的选中框：用户能一眼看到自己点的是哪张素材
    expect(screen.getByTestId("camera-selected-outline")).toBeTruthy();
  });

  test("点卡片里的控件不会当成「点卡片」：只拖滑杆不会选中预览", async () => {
    renderEditor(makeRecord(0));
    await screen.findByRole("heading", { name: "罗佳" });

    fireEvent.click(screen.getByLabelText("立绘 1 缩放滑块"));

    expect(cardPreviewSelected()).toBeNull();
    expect(screen.queryByText(/世界视图/)).toBeNull();
  });
});

describe("批量勾选与预览选中互不干扰", () => {
  test("只勾复选框：出现批量删除入口，但不会选中预览", async () => {
    renderEditor(makeRecord(0));
    await screen.findByRole("heading", { name: "罗佳" });

    fireEvent.click(screen.getByLabelText("选择立绘 1"));

    expect(screen.getByRole("button", { name: /批量删除/ })).toBeTruthy();
    expect(cardPreviewSelected()).toBeNull();
    expect(screen.queryByText(/世界视图/)).toBeNull();
  });

  test("先勾选再点卡片：两套状态同时存在，互不覆盖", async () => {
    renderEditor(makeRecord(OFFSCREEN_ADJ_X));

    const checkbox = await screen.findByLabelText("选择立绘 1");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("heading", { name: "罗佳" }));

    await waitFor(() => expect(cardPreviewSelected()).toBe("true"));
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/已选 1 \/ 1/)).toBeTruthy();
    expect(await screen.findByText(/世界视图/)).toBeTruthy();
  });
});

describe("删除素材后同步预览状态", () => {
  test("批量删除确认后：预览选中清空、临时世界视图退出、勾选清空", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor(makeRecord(OFFSCREEN_ADJ_X));

    fireEvent.click(await screen.findByRole("heading", { name: "罗佳" }));
    expect(await screen.findByText(/世界视图/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText("选择立绘 1"));
    fireEvent.click(screen.getByRole("button", { name: /批量删除/ }));

    // 选中态没了 → 世界视图退出、卡片不再是预览选中态
    await waitFor(() => expect(screen.queryByText(/世界视图/)).toBeNull());
    expect(cardPreviewSelected()).toBeNull();
    // 勾选也清空了：批量删除按钮消失
    expect(screen.queryByRole("button", { name: /批量删除/ })).toBeNull();
  });

  test("取消确认时什么都不删，预览选中保持", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor(makeRecord(0));

    fireEvent.click(await screen.findByRole("heading", { name: "罗佳" }));
    await waitFor(() => expect(cardPreviewSelected()).toBe("true"));

    fireEvent.click(screen.getByLabelText("选择立绘 1"));
    fireEvent.click(screen.getByRole("button", { name: /批量删除/ }));

    // 还在等确认结果：选中态与勾选都保留
    expect(screen.getByText(/已选 1 \/ 1/)).toBeTruthy();
    expect(cardPreviewSelected()).toBe("true");
  });
});
