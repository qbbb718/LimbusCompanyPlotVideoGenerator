import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CharacterVisual,
  DialogueAlign,
  Emotion,
  Record as PlotRecord,
  TempImageVisual,
} from "@types";
import ApiService from "@services/ApiService";
import CharactersProperties from "./CharactersProperties";

/**
 * "剧情编辑 → 立绘"页签：
 * - 立绘的缩放 / 复原 / X / Y 坐标控件行为不变；
 * - 临时图片（路人 / 道具）已拆成同级的「临时图片」页签，
 *   这里不应再出现它的标题、缩略图或"添加临时图片"入口。
 */

const getCharacters = jest.spyOn(ApiService, "getCharacters");

const makeRecord = (
  chars: CharacterVisual[] = [],
  tempImages: TempImageVisual[] = [],
): PlotRecord => ({
  uuid: "r1",
  durationFrames: 30,
  dialogue: {
    text: "",
    location: "default",
    speakerC: [],
    speakerName: "",
    faction: "",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
  },
  bg: [],
  chars,
  tempImages,
  effects: [],
  audioCommands: [],
});

beforeEach(() => {
  // CRA 的 jest 配置开了 resetMocks，实现要在每个用例前往回填
  getCharacters.mockResolvedValue([]);
});

const renderPanel = (record: PlotRecord, updateRecord = jest.fn()) => {
  render(
    <CharactersProperties
      selectedRecord={record}
      selectedRecordIndex={0}
      updateRecord={updateRecord}
    />,
  );
  return updateRecord;
};

const makeCharacter = (
  overrides: Partial<CharacterVisual> = {},
): CharacterVisual => ({
  chara: {
    characterID: "c1",
    characterName: "测试角色",
    height: 171,
    faction: "未设定",
    colorBg: "#FFFFFF",
    colorText: "#000000",
  },
  portrait: {
    portraitID: "p1",
    characterID: "c1",
    imagePath: "",
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
  adjX: 0,
  adjY: 0,
  scale: 1,
  dim: false,
  ...overrides,
});

describe("CharactersProperties 立绘缩放与复原", () => {
  it("每条立绘都渲染缩放数值框 / 滑块与复原按钮", () => {
    renderPanel(makeRecord([makeCharacter()]));

    expect(screen.getByLabelText("立绘 1 缩放")).toBeTruthy();
    expect(screen.getByLabelText("立绘 1 缩放滑块")).toBeTruthy();
    expect(screen.getByTitle(/复原/)).toBeTruthy();
    // 既有的 X / Y 坐标控件仍在
    expect(screen.getByLabelText("立绘 1 X 坐标")).toBeTruthy();
    expect(screen.getByLabelText("立绘 1 Y 坐标")).toBeTruthy();
  });

  it("拖动缩放滑块把 scale 写回记录", async () => {
    const updateRecord = renderPanel(makeRecord([makeCharacter()]));

    fireEvent.change(screen.getByLabelText("立绘 1 缩放滑块"), {
      target: { value: "1.5" },
    });

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [index, updatedRecord] = updateRecord.mock.calls[0];
    expect(index).toBe(0);
    expect(updatedRecord.chars[0].scale).toBe(1.5);
  });

  it("缩放数值框支持小数（不会因为输入中间态被改成整数）", () => {
    const updateRecord = renderPanel(makeRecord([makeCharacter()]));

    fireEvent.change(screen.getByLabelText("立绘 1 缩放"), {
      target: { value: "2.5" },
    });

    expect(updateRecord.mock.calls[0][1].chars[0].scale).toBe(2.5);
  });

  it("复原只把缩放恢复为 1.0，保留用户调好的 X/Y 偏移", async () => {
    const updateRecord = renderPanel(
      makeRecord([makeCharacter({ scale: 2, adjX: 40, adjY: -30 })]),
    );

    fireEvent.click(screen.getByTitle(/复原/));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.chars[0].scale).toBe(1);
    expect(updatedRecord.chars[0].adjX).toBe(40);
    expect(updatedRecord.chars[0].adjY).toBe(-30);
  });

  it("立绘 X 坐标支持直接输入负数", () => {
    const updateRecord = renderPanel(makeRecord([makeCharacter()]));

    fireEvent.change(screen.getByLabelText("立绘 1 X 坐标"), {
      target: { value: "-300" },
    });

    // 默认坐标系与设计画布相同，写回值就是 -300
    expect(updateRecord.mock.calls[0][1].chars[0].adjX).toBe(-300);
  });
});

describe("CharactersProperties 不再包含临时图片", () => {
  it("记录里有临时图片时，立绘页签也不渲染任何相关入口", () => {
    // 有立绘、也有临时图片：立绘页签只应管立绘
    renderPanel(
      makeRecord([makeCharacter()], [
        {
          uuid: "t1",
          imagePath: "./projects/temp/images/a.png",
          posX: 0,
          posY: 0,
          scale: 1,
          dim: false,
        },
      ]),
    );

    expect(screen.queryByText("临时图片（路人/道具）")).toBeNull();
    expect(screen.queryByText("临时图片 1")).toBeNull();
    expect(screen.queryByAltText("临时图片 1")).toBeNull();
    expect(screen.queryByText("添加临时图片")).toBeNull();
    expect(screen.queryByText("压暗")).toBeNull();
  });
});
