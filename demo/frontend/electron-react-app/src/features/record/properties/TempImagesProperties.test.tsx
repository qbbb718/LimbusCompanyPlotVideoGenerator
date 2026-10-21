import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  DialogueAlign,
  Emotion,
  Record as PlotRecord,
  TempImageVisual,
} from "@types";
import ApiService, { BASE_URL } from "@services/ApiService";
import TempImagesProperties from "./TempImagesProperties";

/**
 * "剧情编辑 → 临时图片"（与「立绘」同级的独立页签）：
 * - 列表项、缩放 / 压暗 / X / Y 坐标、添加 / 删除全部沿用拆分前「立绘」页签里的行为；
 * - 后端存的 imagePath 是绝对路径（C:/Users/.../projects/temp/images/xxx.png），
 *   缩略图地址必须收敛到 /projects/temp/images/xxx.png，否则图片一直 404；
 * - 图片加载失败时把 <img> 藏起来，露出底下的 "?" 占位，不留破图。
 */

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

const renderPanel = (record: PlotRecord, updateRecord = jest.fn()) => {
  render(
    <TempImagesProperties
      selectedRecord={record}
      selectedRecordIndex={0}
      updateRecord={updateRecord}
    />,
  );
  return updateRecord;
};

describe("TempImagesProperties 列表与缩略图", () => {
  it("页签标题与「添加临时图片」入口都在", () => {
    renderPanel(makeRecord([]));

    expect(screen.getByText("临时图片（路人/道具）")).toBeTruthy();
    expect(screen.getByText("添加临时图片")).toBeTruthy();
  });

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

describe("TempImagesProperties 控件写回记录", () => {
  it("缩放滑块把 scale 写回 tempImages", () => {
    const updateRecord = renderPanel(
      makeRecord([makeTempImage({ scale: 1 })]),
    );

    fireEvent.change(screen.getByLabelText("临时图片 1 缩放滑块"), {
      target: { value: "2" },
    });

    expect(updateRecord.mock.calls[0][1].tempImages[0].scale).toBe(2);
  });

  it("X / Y 数值框把 posX / posY 写回 tempImages", () => {
    const updateRecord = renderPanel(makeRecord([makeTempImage({})]));

    fireEvent.change(screen.getByLabelText("临时图片 1 X 坐标"), {
      target: { value: "640" },
    });
    expect(updateRecord.mock.calls[0][1].tempImages[0].posX).toBe(640);

    fireEvent.change(screen.getByLabelText("临时图片 1 Y 坐标"), {
      target: { value: "-120" },
    });
    expect(updateRecord.mock.calls[1][1].tempImages[0].posY).toBe(-120);
  });

  it("压暗勾选框把 dim 写回 tempImages", () => {
    const updateRecord = renderPanel(makeRecord([makeTempImage({})]));

    const checkbox = screen
      .getByText("压暗")
      .parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);

    expect(updateRecord.mock.calls[0][1].tempImages[0].dim).toBe(true);
  });

  it("删除：同时删掉后端文件并从记录里移除", async () => {
    const deleteTempImage = jest
      .spyOn(ApiService, "deleteTempImage")
      .mockResolvedValue({ success: true });
    const updateRecord = renderPanel(
      makeRecord([makeTempImage({ uuid: "t1" }), makeTempImage({ uuid: "t2" })]),
    );

    fireEvent.click(screen.getAllByText("删除")[0]);

    await waitFor(() => expect(deleteTempImage).toHaveBeenCalledWith("t1"));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.tempImages).toHaveLength(1);
    expect(updatedRecord.tempImages[0].uuid).toBe("t2");
  });

  it("添加：选图 → 上传 → 以默认缩放 / 位置追加进记录", async () => {
    (window as any).electronAPI = {
      openImageFile: jest.fn().mockResolvedValue({
        canceled: false,
        filePaths: ["C:\\素材\\路人甲.png"],
      }),
      readFile: jest.fn().mockResolvedValue(new ArrayBuffer(3)),
    };
    const uploadTempImage = jest
      .spyOn(ApiService, "uploadTempImage")
      .mockResolvedValue({
        uuid: "t9",
        imagePath: "./projects/temp/images/t9.png",
        url: `${BASE_URL}/projects/temp/images/t9.png`,
      });
    const updateRecord = renderPanel(makeRecord([]));

    fireEvent.click(screen.getByText("添加临时图片"));

    await waitFor(() => expect(uploadTempImage).toHaveBeenCalledTimes(1));
    // 上传的是用户选中的那张图，文件名沿用原文件名
    const uploadedFile: File = uploadTempImage.mock.calls[0][0];
    expect(uploadedFile.name).toBe("路人甲.png");

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.tempImages).toEqual([
      {
        uuid: "t9",
        imagePath: "./projects/temp/images/t9.png",
        posX: 0,
        posY: 0,
        scale: 1,
        dim: false,
      },
    ]);

    delete (window as any).electronAPI;
  });
});
