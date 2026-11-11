/**
 * 剧情编辑 → 「摄像机」页签里的「镜头自动跟随说话人」接线。
 *
 * 纯运算在 `preview/cameraFollow.test.ts` 里已经锁死了，这里只验四件事：
 * 1. 勾选框在**「摄像机」页签**里（`.camera-properties`），是工程级设置，
 *    点击后写进 projectSettings（与别的全局选项同一份状态）；
 * 2. 开关关着时，移动说话人的立绘**不动镜头**（保持旧行为）；
 * 3. 开关打开后，移动说话人的立绘会把镜头对到说话人身上，并按背景/画布边界夹取；
 * 4. 开关打开后，切换说话人同样会把镜头对到新说话人身上。
 *
 * 走的是真实链路：立绘页签的 X 坐标 / 文本页签的说话人下拉 → RecordEditor.updateRecord
 * → cameraFollow → setRecords。
 * jsdom 不会真的加载图片，所以把 useImageSizes 换成一个固定尺寸的替身。
 */
import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  DEFAULT_PROJECT_SETTINGS,
  DialogueAlign,
  Emotion,
  MyCharacter,
  ProjectSettings,
  Record as PlotRecord,
  CharacterVisual,
} from "@types";
import RecordEditor from "./RecordEditor";
import ApiService from "@services/ApiService";
import type { ProjectWorkspace } from "./useProjectWorkspace";

jest.mock("./preview/useImageSizes", () => ({
  useImageSizes: (urls: string[]) => ({
    // 立绘 400×600：立绘矩形中心 = 立绘左上角 + 200（水平）
    sizes: Object.fromEntries(
      urls.filter(Boolean).map((url) => [url, { width: 400, height: 600 }]),
    ),
    pending: 0,
  }),
}));

/** 说话人引用 */
const makeRef = (characterID: string, characterName: string) => ({
  characterID,
  characterName,
  height: 171,
  faction: "未设定",
  colorBg: "#FFFFFF",
  colorText: "#000000",
});

/** 一张立绘（裁剪框 183 → 缩放 1，脸框中心 = 左上角 + (91.5, 91.5)） */
const makeCharacterVisual = (
  characterID: string,
  characterName: string,
  adjX: number,
): CharacterVisual => ({
  chara: makeRef(characterID, characterName),
  portrait: {
    portraitID: `p-${characterID}`,
    characterID,
    imagePath: `characters/${characterID}/p1.png`,
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
});

/** 素材库里的角色（说话人下拉框的选项来源） */
const makeMyCharacter = (
  characterID: string,
  characterName: string,
): MyCharacter => ({ ...makeRef(characterID, characterName), tags: [], portraits: [] });

const makeRecord = (): PlotRecord => ({
  uuid: "r1",
  durationFrames: 30,
  dialogue: {
    text: "台词",
    location: "default",
    speakerC: [makeRef("c1", "罗佳")],
    speakerName: "罗佳",
    faction: "未设定",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
  },
  bg: [],
  chars: [
    makeCharacterVisual("c1", "罗佳", 0),
    // 切到辛克莱时他已经站在画面右侧（zoom = 2 的取景框装不下）
    makeCharacterVisual("c2", "辛克莱", 700),
  ],
  tempImages: [],
  effects: [],
  audioCommands: [],
  // 镜头已经推进到 2 倍：此时说话人略微偏右就会出画（取景框只剩中间 960×540）
  camera: { centerX: 960, centerY: 540, zoom: 2 },
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
  // 默认停在「立绘」页签，用例里要动那张立绘的 X 坐标
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

/** 带真实设置状态的包装：勾选框点击后能真的改变 projectSettings */
const Harness: React.FC<{
  workspace: ProjectWorkspace;
  initial?: Partial<ProjectSettings>;
}> = ({ workspace, initial }) => {
  const [settings, setSettings] = useState<ProjectSettings>({
    ...DEFAULT_PROJECT_SETTINGS,
    ...initial,
  });
  return (
    <RecordEditor
      projectSettings={settings}
      setProjectSettings={setSettings}
      workspace={workspace}
    />
  );
};

/**
 * 把说话人的立绘挪到 X = `uiX`（设计画布像素，当前输出也是 1920 宽所以 1:1），
 * 返回这一次写回记录时算出来的镜头。
 */
const movePortraitTo = async (
  workspace: ProjectWorkspace,
  uiX: number,
): Promise<PlotRecord["camera"]> => {
  const field = await screen.findByLabelText("立绘 1 X 坐标");
  fireEvent.change(field, { target: { value: String(uiX) } });

  const calls = (workspace.setRecords as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  // setRecords 收到的是 (prev) => next 的更新函数：拿旧记录跑一遍就是写回的内容
  const updater = calls[calls.length - 1][0] as (prev: PlotRecord[]) => PlotRecord[];
  return updater(workspace.records as PlotRecord[])[0].camera;
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

describe("剧情编辑 → 镜头自动跟随说话人（工程级选项）", () => {
  test("选项在「摄像机」页签里，可勾选 / 取消（写进工程设置）", async () => {
    render(
      <Harness
        workspace={makeWorkspace({ activePropertyTab: "camera" })}
      />,
    );
    await screen.findByText(/静止镜头/, { selector: ".camera-summary-state" });

    const checkbox = screen.getByLabelText(
      "镜头自动跟随说话人",
    ) as HTMLInputElement;
    expect(checkbox.type).toBe("checkbox");
    // 默认关：不改变任何既有行为
    expect(checkbox.checked).toBe(false);
    // 位置：在「摄像机」页签的面板里（与其它镜头控件同处一块）
    expect(checkbox.closest(".camera-properties")).not.toBeNull();

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  test("开关关着：移动说话人的立绘不动镜头（旧行为不变）", async () => {
    const workspace = makeWorkspace();
    render(<Harness workspace={workspace} initial={{ cameraFollowSpeaker: false }} />);

    const camera = await movePortraitTo(workspace, 700);

    expect(camera).toEqual({ centerX: 960, centerY: 540, zoom: 2 });
  });

  test("开关打开：移动说话人的立绘 → 镜头跟着对过去（并夹在背景/画布范围内）", async () => {
    const workspace = makeWorkspace();
    render(<Harness workspace={workspace} initial={{ cameraFollowSpeaker: true }} />);

    const camera = await movePortraitTo(workspace, 700);

    // 立绘中心 = 960 + 700 + 200 = 1860；zoom = 2 的取景框宽 960、画布宽 1920
    // → 取景中心最多 1440（镜头贴住画布右边缘，不会为了居中跑到画面外）
    expect(camera).toEqual({ centerX: 1440, centerY: 540, zoom: 2 });
  });

  test("开关打开：切换说话人 → 镜头对到新说话人身上", async () => {
    // 素材库里有两位角色，说话人下拉框才能切到辛克莱
    jest
      .spyOn(ApiService, "getCharacters")
      .mockResolvedValue([
        makeMyCharacter("c1", "罗佳"),
        makeMyCharacter("c2", "辛克莱"),
      ]);

    const workspace = makeWorkspace({ activePropertyTab: "text" });
    render(<Harness workspace={workspace} initial={{ cameraFollowSpeaker: true }} />);

    // 「文本」页签 → 说话人下拉框 → 选辛克莱（他的立绘在画面右侧，已经出画）
    fireEvent.click(await screen.findByLabelText("说话人"));
    fireEvent.click(await screen.findByRole("option", { name: /辛克莱/ }));

    const calls = (workspace.setRecords as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const updater = calls[calls.length - 1][0] as (prev: PlotRecord[]) => PlotRecord[];
    const written = updater(workspace.records as PlotRecord[])[0];

    expect(written.dialogue.speakerC[0].characterID).toBe("c2");
    // 辛克莱立绘中心 = 960 + 700 + 200 = 1860 → 同样被夹到画布右边缘 1440
    expect(written.camera).toEqual({ centerX: 1440, centerY: 540, zoom: 2 });
  });
});
