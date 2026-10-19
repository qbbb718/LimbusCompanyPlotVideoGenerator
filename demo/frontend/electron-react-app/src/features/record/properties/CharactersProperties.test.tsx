import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CharacterVisual,
  DialogueAlign,
  Emotion,
  Record as PlotRecord,
  TempImageVisual,
} from "@types";
import ApiService, { BASE_URL } from "@services/ApiService";
import CharactersProperties from "./CharactersProperties";

/**
 * "剧情编辑 → 立绘 → 临时图片（路人/道具）"列表项：
 * - 每个 item 都要带缩略图；
 * - 后端存的 imagePath 是绝对路径（C:/Users/.../projects/temp/images/xxx.png），
 *   缩略图地址必须收敛到 /projects/temp/images/xxx.png，否则图片一直 404；
 * - 图片加载失败时把 <img> 藏起来，露出底下的 "?" 占位，不留破图。
 */

const getCharacters = jest.spyOn(ApiService, "getCharacters");

const ABSOLUTE_IMAGE_PATH =
  "C:/Users/26899/AppData/Roaming/limbus-company-plot-video-generator/projects/temp/images/825a397f-d9c8-4f33-87dc-d5b27d108a6f.png";

const makeTempImage = (overrides: Partial<TempImageVisual>): TempImageVisual => ({
  uuid: "t1",
  imagePath: ABSOLUTE_IMAGE_PATH,
  posX: 0,
  posY: 0,
  scale: 1,
  dim: false,
  ...overrides,
});

const makeRecord = (tempImages: TempImageVisual[]): PlotRecord => ({
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
  chars: [],
  tempImages,
  effects: [],
  audioCommands: [],
});

beforeEach(() => {
  // CRA 的 jest 配置开了 resetMocks，实现要在每个用例前往回填
  getCharacters.mockResolvedValue([]);
});

const renderPanel = (record: PlotRecord) =>
  render(
    <CharactersProperties
      selectedRecord={record}
      selectedRecordIndex={0}
      updateRecord={jest.fn()}
    />,
  );

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

/** 带立绘的记录（makeRecord 只负责临时图片，这里补上 chars） */
const makeRecordWithChars = (chars: CharacterVisual[]): PlotRecord => ({
  ...makeRecord([]),
  chars,
});

const renderPanelWithUpdate = (
  record: PlotRecord,
  updateRecord = jest.fn(),
) => {
  render(
    <CharactersProperties
      selectedRecord={record}
      selectedRecordIndex={0}
      updateRecord={updateRecord}
    />,
  );
  return updateRecord;
};

describe("CharactersProperties 临时图片缩略图", () => {
  it("绝对路径的 imagePath 也能解析成 /projects/... 缩略图地址", () => {
    renderPanel(makeRecord([makeTempImage({})]));

    const thumbnail = screen.getByAltText("临时图片 1");
    expect(thumbnail.getAttribute("src")).toBe(
      `${BASE_URL}/projects/temp/images/825a397f-d9c8-4f33-87dc-d5b27d108a6f.png`,
    );
  });

  it("每条临时图片各用各的缩略图", () => {
    renderPanel(
      makeRecord([
        makeTempImage({ uuid: "t1" }),
        makeTempImage({
          uuid: "t2",
          imagePath: "./projects/temp/images/第二张.png",
        }),
      ]),
    );

    expect(screen.getByAltText("临时图片 1").getAttribute("src")).toBe(
      `${BASE_URL}/projects/temp/images/825a397f-d9c8-4f33-87dc-d5b27d108a6f.png`,
    );
    expect(screen.getByAltText("临时图片 2").getAttribute("src")).toBe(
      `${BASE_URL}/projects/temp/images/${encodeURIComponent("第二张.png")}`,
    );
  });

  it("缩略图加载失败时隐藏图片（露出占位符）", () => {
    renderPanel(makeRecord([makeTempImage({})]));

    const thumbnail = screen.getByAltText("临时图片 1") as HTMLImageElement;
    fireEvent.error(thumbnail);

    expect(thumbnail.style.display).toBe("none");
  });

  it("没有 imagePath 时不渲染 <img>", () => {
    renderPanel(makeRecord([makeTempImage({ imagePath: "" })]));

    expect(screen.queryByAltText("临时图片 1")).toBeNull();
    expect(screen.getByText("临时图片 1")).toBeTruthy();
  });
});

describe("CharactersProperties 立绘缩放与复原", () => {
  it("每条立绘都渲染缩放数值框 / 滑块与复原按钮", () => {
    renderPanel(makeRecordWithChars([makeCharacter()]));

    expect(screen.getByLabelText("立绘 1 缩放")).toBeTruthy();
    expect(screen.getByLabelText("立绘 1 缩放滑块")).toBeTruthy();
    expect(screen.getByText("复原")).toBeTruthy();
    // 既有的 X / Y 坐标控件仍在
    expect(screen.getByLabelText("立绘 1 X 坐标")).toBeTruthy();
    expect(screen.getByLabelText("立绘 1 Y 坐标")).toBeTruthy();
  });

  it("拖动缩放滑块把 scale 写回记录", async () => {
    const updateRecord = renderPanelWithUpdate(
      makeRecordWithChars([makeCharacter()]),
    );

    fireEvent.change(screen.getByLabelText("立绘 1 缩放滑块"), {
      target: { value: "1.5" },
    });

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [index, updatedRecord] = updateRecord.mock.calls[0];
    expect(index).toBe(0);
    expect(updatedRecord.chars[0].scale).toBe(1.5);
  });

  it("缩放数值框支持小数（不会因为输入中间态被改成整数）", () => {
    const updateRecord = renderPanelWithUpdate(
      makeRecordWithChars([makeCharacter()]),
    );

    fireEvent.change(screen.getByLabelText("立绘 1 缩放"), {
      target: { value: "2.5" },
    });

    expect(updateRecord.mock.calls[0][1].chars[0].scale).toBe(2.5);
  });

  it("复原只把缩放恢复为 1.0，保留用户调好的 X/Y 偏移", async () => {
    const updateRecord = renderPanelWithUpdate(
      makeRecordWithChars([
        makeCharacter({ scale: 2, adjX: 40, adjY: -30 }),
      ]),
    );

    fireEvent.click(screen.getByText("复原"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.chars[0].scale).toBe(1);
    expect(updatedRecord.chars[0].adjX).toBe(40);
    expect(updatedRecord.chars[0].adjY).toBe(-30);
  });

  it("立绘 X 坐标支持直接输入负数", () => {
    const updateRecord = renderPanelWithUpdate(
      makeRecordWithChars([makeCharacter()]),
    );

    fireEvent.change(screen.getByLabelText("立绘 1 X 坐标"), {
      target: { value: "-300" },
    });

    // 默认坐标系与设计画布相同，写回值就是 -300
    expect(updateRecord.mock.calls[0][1].chars[0].adjX).toBe(-300);
  });

  it("临时图片的缩放控件仍然写回 scale", () => {
    const updateRecord = renderPanelWithUpdate(
      makeRecord([makeTempImage({ scale: 1 })]),
    );

    fireEvent.change(screen.getByLabelText("临时图片 1 缩放滑块"), {
      target: { value: "2" },
    });

    expect(updateRecord.mock.calls[0][1].tempImages[0].scale).toBe(2);
  });
});
