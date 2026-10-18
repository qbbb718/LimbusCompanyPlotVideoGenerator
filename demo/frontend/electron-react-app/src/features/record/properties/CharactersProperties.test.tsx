import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { DialogueAlign, Emotion, Record as PlotRecord, TempImageVisual } from "@types";
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
