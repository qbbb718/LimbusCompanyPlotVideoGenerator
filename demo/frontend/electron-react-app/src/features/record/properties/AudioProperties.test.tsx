import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  Audio as AudioItem,
  AudioCommand,
  AudioType,
  DialogueAlign,
  Emotion,
  Record as PlotRecord,
} from "@types";
import ApiService from "@services/ApiService";
import AudioProperties from "./AudioProperties";

/**
 * "剧情编辑 → 音效" tab 的音频选择弹窗：
 * - 单击只是选中，不添加、不关弹窗；
 * - 双击直接"选中 + 添加 + 关弹窗"，不用再点「确认添加」；
 * - 「确认添加」仍然可用（别因为 addAudio 多了一个可选参数，就把点击事件当成音频传进去）。
 */

const mockAudios: AudioItem[] = [
  { uuid: "a1", name: "雨声", path: "sfx/rain.wav", type: AudioType.SFX, tags: [] },
  { uuid: "a2", name: "主题曲", path: "bgm/theme.mp3", type: AudioType.BGM, tags: [] },
];

jest.mock("@services/ApiService", () => ({
  __esModule: true,
  default: { getAudios: jest.fn() },
}));

const mockedApi = ApiService as unknown as { getAudios: jest.Mock };

beforeEach(() => {
  // CRA 的 jest 配置开了 resetMocks，实现要在每个用例前往回填
  mockedApi.getAudios.mockResolvedValue(mockAudios);
});

const makeRecord = (audioCommands: AudioCommand[] = []): PlotRecord => ({
  uuid: "r1",
  durationFrames: 120,
  dialogue: {
    text: "测试",
    location: "",
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
  audioCommands,
});

/** 打开「添加音频」弹窗，并等到列表渲染出音频卡片 */
const openSelector = async () => {
  fireEvent.click(screen.getByText("添加音频"));
  await waitFor(() => expect(screen.getByText("雨声")).toBeTruthy());
  return screen.getByText("雨声").closest(".audio-item") as HTMLElement;
};

describe("剧情编辑 → 音效 → 添加音频", () => {
  test("双击音频会选中并直接添加，同时关闭选择弹窗", async () => {
    const updateRecord = jest.fn();
    render(
      <AudioProperties
        selectedRecord={makeRecord()}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    const item = await openSelector();
    fireEvent.doubleClick(item);

    // 已经写进记录的 audioCommands（默认类型是背景音乐）
    expect(updateRecord).toHaveBeenCalledTimes(1);
    const [, updated] = updateRecord.mock.calls[0];
    expect(updated.audioCommands).toHaveLength(1);
    expect(updated.audioCommands[0]).toMatchObject({
      type: AudioType.BGM,
      path: "sfx/rain.wav",
      volume: 1,
      startTime: 0,
      duration: 5,
    });

    // 弹窗已关闭
    expect(screen.queryByText("选择音频")).toBeNull();
    expect(screen.queryByText("确认添加")).toBeNull();
  });

  test("双击时使用弹窗里选中的音频类型", async () => {
    const updateRecord = jest.fn();
    render(
      <AudioProperties
        selectedRecord={makeRecord()}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    const item = await openSelector();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: AudioType.SFX },
    });
    fireEvent.doubleClick(item);

    expect(updateRecord.mock.calls[0][1].audioCommands[0].type).toBe(
      AudioType.SFX,
    );
    expect(screen.queryByText("选择音频")).toBeNull();
  });

  test("单击只选中，不添加也不关弹窗；确认添加仍能正常写入", async () => {
    const updateRecord = jest.fn();
    render(
      <AudioProperties
        selectedRecord={makeRecord()}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    const item = await openSelector();
    fireEvent.click(item);

    expect(updateRecord).not.toHaveBeenCalled();
    expect(item.className).toContain("selected");
    expect(screen.getByText("选择音频")).toBeTruthy();

    fireEvent.click(screen.getByText("确认添加"));

    const [, updated] = updateRecord.mock.calls[0];
    expect(updated.audioCommands[0].path).toBe("sfx/rain.wav");
    expect(screen.queryByText("选择音频")).toBeNull();
  });

  test("弹窗里提示双击可以直接添加", async () => {
    render(
      <AudioProperties
        selectedRecord={makeRecord()}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
      />,
    );

    await openSelector();

    expect(screen.getByText(/双击列表项可直接添加/)).toBeTruthy();
  });
});

/* ===================== 批量删除 ===================== */

const makeCommands = (): AudioCommand[] => [
  {
    type: AudioType.BGM,
    path: "bgm/theme.mp3",
    volume: 1,
    startTime: 0,
    duration: 5,
  },
  {
    type: AudioType.SFX,
    path: "sfx/rain.wav",
    volume: 0.8,
    startTime: 1,
    duration: 2,
  },
  {
    type: AudioType.VOICE,
    path: "voice/line.wav",
    volume: 1,
    startTime: 0,
    duration: 3,
  },
];

describe("剧情编辑 → 音效 → 批量删除", () => {
  test("勾选两条：确认后一次写回记录并清空勾选", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const updateRecord = jest.fn();
    render(
      <AudioProperties
        selectedRecord={makeRecord(makeCommands())}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    // 未勾选时没有批量删除入口
    expect(screen.queryByRole("button", { name: /批量删除/ })).toBeNull();

    fireEvent.click(screen.getByLabelText("选择音效 1"));
    fireEvent.click(screen.getByLabelText("选择音效 3"));
    expect(screen.getByText("已选 2 / 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /批量删除/ }));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const [recordIndex, updatedRecord] = updateRecord.mock.calls[0];
    expect(recordIndex).toBe(0);
    expect(
      updatedRecord.audioCommands.map((audio: AudioCommand) => audio.path),
    ).toEqual(["sfx/rain.wav"]);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /批量删除/ })).toBeNull(),
    );
    expect(screen.getByText("已选 0 / 3")).toBeTruthy();
  });

  test("确认框里点取消 → 不写回记录", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const updateRecord = jest.fn();
    render(
      <AudioProperties
        selectedRecord={makeRecord(makeCommands())}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    fireEvent.click(screen.getByLabelText("选择音效 2"));
    fireEvent.click(screen.getByRole("button", { name: /批量删除/ }));

    await waitFor(() => expect(screen.getByText("已选 1 / 3")).toBeTruthy());
    expect(updateRecord).not.toHaveBeenCalled();
  });

  test("全选 / 取消全选；单条删除仍然只删自己那一条", () => {
    const updateRecord = jest.fn();
    render(
      <AudioProperties
        selectedRecord={makeRecord(makeCommands())}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    fireEvent.click(screen.getByLabelText("全选"));
    expect(screen.getByText("已选 3 / 3")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("取消全选"));
    expect(screen.getByText("已选 0 / 3")).toBeTruthy();

    fireEvent.click(screen.getAllByText("删除")[1]);
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(
      updatedRecord.audioCommands.map((audio: AudioCommand) => audio.path),
    ).toEqual(["bgm/theme.mp3", "voice/line.wav"]);
  });

  test("音效页签不与预览联动：卡片上没有预览选中态", () => {
    const { container } = render(
      <AudioProperties
        selectedRecord={makeRecord(makeCommands())}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
      />,
    );

    // 卡片只有勾选态，没有"预览选中"描边
    expect(container.querySelector(".visual-card-preview-selected")).toBeNull();
    expect(container.querySelectorAll(".audio-item")).toHaveLength(3);
  });
});
