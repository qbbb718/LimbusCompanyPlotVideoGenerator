import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Background, DialogueAlign, Emotion, Record as PlotRecord } from "@types";
import ApiService, { BASE_URL } from "@services/ApiService";
import BackgroundProperties from "./BackgroundProperties";

/**
 * "剧情编辑 → 背景" tab 的背景列表项：
 * - 每个 item 都要带缩略图（优先 thumbnailPath，老数据没有就退回原图）；
 * - 缩略图加载失败时退回原图，不留破图；
 * - 列表项结构改了以后，删除按钮仍然只删自己那一条。
 */

const getBackgrounds = jest.spyOn(ApiService, "getBackgrounds");

const officeBackground: Background = {
  uuid: "bg1",
  name: "办公室",
  path: "/assets/backgrounds/办公室.png",
  thumbnailPath: "/assets/backgrounds/thumbnails/thumb_bg1.png",
  tags: [],
};

/** 记录里内嵌的背景快照（没有 tags） */
const snapshotOf = (background: Background) => ({
  uuid: background.uuid,
  name: background.name,
  path: background.path,
  thumbnailPath: background.thumbnailPath,
});

const makeRecord = (backgrounds: Background[]): PlotRecord => ({
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
  bg: backgrounds.map((background) => ({
    background: snapshotOf(background),
    posX: 0,
    posY: 0,
    scale: 1,
    visible: true,
  })),
  chars: [],
  tempImages: [],
  effects: [],
  audioCommands: [],
});

beforeEach(() => {
  // CRA 的 jest 配置开了 resetMocks，实现要在每个用例前往回填
  getBackgrounds.mockResolvedValue([officeBackground]);
});

const renderPanel = (record: PlotRecord, updateRecord = jest.fn()) => {
  render(
    <BackgroundProperties
      selectedRecord={record}
      selectedRecordIndex={0}
      updateRecord={updateRecord}
    />,
  );
  return updateRecord;
};

describe("BackgroundProperties 背景列表缩略图", () => {
  it("列表项用 thumbnailPath 显示缩略图", () => {
    renderPanel(makeRecord([officeBackground]));

    const thumbnail = screen.getByAltText("办公室");
    expect(thumbnail.getAttribute("src")).toBe(
      `${BASE_URL}/assets/backgrounds/thumbnails/thumb_bg1.png`,
    );
  });

  it("老数据没有 thumbnailPath 时直接用原图", () => {
    const legacy: Background = { ...officeBackground, thumbnailPath: undefined };
    renderPanel(makeRecord([legacy]));

    const thumbnail = screen.getByAltText("办公室");
    expect(thumbnail.getAttribute("src")).toBe(
      `${BASE_URL}/assets/backgrounds/办公室.png`,
    );
  });

  it("缩略图加载失败时退回原图", () => {
    renderPanel(makeRecord([officeBackground]));

    const thumbnail = screen.getByAltText("办公室") as HTMLImageElement;
    fireEvent.error(thumbnail);

    // img.src 会被浏览器（jsdom 同理）规范化并编码中文，比较前先解回来
    expect(decodeURI(thumbnail.src)).toBe(
      ApiService.getBackgroundUrl(officeBackground.path),
    );
  });

  it("删除按钮只删当前这一条", async () => {
    const second: Background = {
      uuid: "bg2",
      name: "街道",
      path: "/assets/backgrounds/街道.png",
      thumbnailPath: "/assets/backgrounds/thumbnails/thumb_bg2.png",
      tags: [],
    };
    const updateRecord = renderPanel(makeRecord([officeBackground, second]));

    fireEvent.click(screen.getAllByText("删除")[0]);

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [index, updatedRecord] = updateRecord.mock.calls[0];
    expect(index).toBe(0);
    expect(updatedRecord.bg).toHaveLength(1);
    expect(updatedRecord.bg[0].background.uuid).toBe("bg2");
  });
});

describe("BackgroundProperties 缩放与位置控制", () => {
  it("每条背景都渲染缩放、X 偏移、Y 偏移控件与三个图标复原按钮", () => {
    renderPanel(makeRecord([officeBackground]));

    expect(screen.getByLabelText("背景 1 缩放滑块")).toBeTruthy();
    expect(screen.getByLabelText("背景 1 缩放")).toBeTruthy();
    expect(screen.getByLabelText("背景 1 X 偏移")).toBeTruthy();
    expect(screen.getByLabelText("背景 1 X 偏移滑块")).toBeTruthy();
    expect(screen.getByLabelText("背景 1 Y 偏移")).toBeTruthy();
    expect(screen.getByLabelText("背景 1 Y 偏移滑块")).toBeTruthy();

    // 三行各有一个图标复原按钮：可见内容是 ↺，不是"复原"文字
    ["缩放", "X 偏移", "Y 偏移"].forEach((label) => {
      const button = screen.getByLabelText(`复原背景 1 ${label}`);
      expect(button.textContent).toBe("↺");
    });
  });

  it("拖动缩放滑块把 scale 写回记录", async () => {
    const updateRecord = renderPanel(makeRecord([officeBackground]));

    fireEvent.change(screen.getByLabelText("背景 1 缩放滑块"), {
      target: { value: "2" },
    });

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.bg[0].scale).toBe(2);
  });

  it("位置数值不设上下限：可输入远大于画布 / 负数的偏移", async () => {
    const updateRecord = renderPanel(makeRecord([officeBackground]));
    const xInput = screen.getByLabelText("背景 1 X 偏移") as HTMLInputElement;

    fireEvent.change(xInput, { target: { value: "5000" } });
    expect(updateRecord.mock.calls[0][1].bg[0].posX).toBe(5000);

    updateRecord.mockClear();
    fireEvent.change(xInput, { target: { value: "-5000" } });
    expect(updateRecord.mock.calls[0][1].bg[0].posX).toBe(-5000);
  });

  it("位置滑块范围随缩放扩大：放大后仍能把背景完全移出画面", () => {
    const record = makeRecord([officeBackground]);
    record.bg[0].scale = 2;

    renderPanel(record);

    // 默认坐标系 1920×1080：X 方向范围 = ±(1920*2 + 1920)/2 = ±2880
    const xSlider = screen.getByLabelText("背景 1 X 偏移滑块");
    expect(xSlider.getAttribute("min")).toBe("-2880");
    expect(xSlider.getAttribute("max")).toBe("2880");

    // Y 方向范围 = ±(1080*2 + 1080)/2 = ±1620
    const ySlider = screen.getByLabelText("背景 1 Y 偏移滑块");
    expect(ySlider.getAttribute("min")).toBe("-1620");
    expect(ySlider.getAttribute("max")).toBe("1620");
  });

  it("缩放行的 ↺ 只把 scale 恢复 1.0，保留 X/Y 偏移", async () => {
    const record = makeRecord([officeBackground]);
    record.bg[0].scale = 2;
    record.bg[0].posX = 300;
    record.bg[0].posY = -200;
    const updateRecord = renderPanel(record);

    fireEvent.click(screen.getByLabelText("复原背景 1 缩放"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.bg[0].scale).toBe(1);
    expect(updatedRecord.bg[0].posX).toBe(300);
    expect(updatedRecord.bg[0].posY).toBe(-200);
  });

  it("X 行的 ↺ 只把 X 偏移归零，保留缩放与 Y 偏移", async () => {
    const record = makeRecord([officeBackground]);
    record.bg[0].scale = 2;
    record.bg[0].posX = 300;
    record.bg[0].posY = -200;
    const updateRecord = renderPanel(record);

    fireEvent.click(screen.getByLabelText("复原背景 1 X 偏移"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.bg[0].posX).toBe(0);
    expect(updatedRecord.bg[0].scale).toBe(2);
    expect(updatedRecord.bg[0].posY).toBe(-200);
  });

  it("Y 行的 ↺ 只把 Y 偏移归零，保留缩放与 X 偏移", async () => {
    const record = makeRecord([officeBackground]);
    record.bg[0].scale = 2;
    record.bg[0].posX = 300;
    record.bg[0].posY = -200;
    const updateRecord = renderPanel(record);

    fireEvent.click(screen.getByLabelText("复原背景 1 Y 偏移"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.bg[0].posY).toBe(0);
    expect(updatedRecord.bg[0].scale).toBe(2);
    expect(updatedRecord.bg[0].posX).toBe(300);
  });
});
