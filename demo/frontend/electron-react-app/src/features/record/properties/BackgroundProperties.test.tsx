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
