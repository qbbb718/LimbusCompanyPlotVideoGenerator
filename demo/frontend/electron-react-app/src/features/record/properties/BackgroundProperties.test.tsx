import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/* ===================== 压暗 ===================== */

describe("BackgroundProperties 压暗", () => {
  it("老工程没有 dim 字段时默认不压暗", () => {
    renderPanel(makeRecord([officeBackground]));

    const toggle = screen.getByLabelText("背景 1 压暗") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it("勾上「压暗」把 dim 写回记录，不动缩放与偏移", async () => {
    const record = makeRecord([officeBackground]);
    record.bg[0].scale = 2;
    record.bg[0].posX = 300;
    const updateRecord = renderPanel(record);

    fireEvent.click(screen.getByLabelText("背景 1 压暗"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.bg[0].dim).toBe(true);
    expect(updatedRecord.bg[0].scale).toBe(2);
    expect(updatedRecord.bg[0].posX).toBe(300);
  });

  it("已经压暗的背景回显为勾选", () => {
    const record = makeRecord([officeBackground]);
    record.bg[0].dim = true;
    renderPanel(record);

    expect(
      (screen.getByLabelText("背景 1 压暗") as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("取消勾选把 dim 写回 false", async () => {
    const record = makeRecord([officeBackground]);
    record.bg[0].dim = true;
    const updateRecord = renderPanel(record);

    fireEvent.click(screen.getByLabelText("背景 1 压暗"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    expect(updateRecord.mock.calls[0][1].bg[0].dim).toBe(false);
  });

  it("每张背景的压暗各自独立", () => {
    const record = makeRecord([officeBackground, streetBackground]);
    record.bg[0].dim = true;
    renderPanel(record);

    expect(
      (screen.getByLabelText("背景 1 压暗") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("背景 2 压暗") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("新添加的背景默认不压暗", async () => {
    const updateRecord = renderPanel(makeRecord([]));
    // 等挂载时拉的背景列表落地（选择器里的格子来自这次请求），再打开选择器
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "添加背景" }));
    fireEvent.doubleClick(screen.getByText("办公室"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.bg).toHaveLength(1);
    expect(updatedRecord.bg[0].dim).toBe(false);
  });

  it("点「压暗」勾选框不会触发预览选中", () => {
    const onSelectVisual = jest.fn();
    render(
      <BackgroundProperties
        selectedRecord={makeRecord([officeBackground])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
        onSelectVisual={onSelectVisual}
      />,
    );

    fireEvent.click(screen.getByLabelText("背景 1 压暗"));

    expect(onSelectVisual).not.toHaveBeenCalled();
  });
});

/* ===================== 批量删除 ===================== */

const streetBackground: Background = {
  uuid: "bg2",
  name: "街道",
  path: "/assets/backgrounds/街道.png",
  thumbnailPath: "/assets/backgrounds/thumbnails/thumb_bg2.png",
  tags: [],
};

describe("BackgroundProperties 批量删除", () => {
  it("勾选两张 → 出现「批量删除」；确认后一次写回记录、清空勾选、通知预览态", async () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    const onVisualsRemoved = jest.fn();
    const updateRecord = jest.fn();
    render(
      <BackgroundProperties
        selectedRecord={makeRecord([officeBackground, streetBackground])}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
        onVisualsRemoved={onVisualsRemoved}
      />,
    );

    expect(screen.queryByRole("button", { name: /批量删除/ })).toBeNull();

    fireEvent.click(screen.getByLabelText("选择背景 1"));
    fireEvent.click(screen.getByLabelText("选择背景 2"));
    expect(screen.getByText("已选 2 / 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /批量删除/ }));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const [recordIndex, updatedRecord] = updateRecord.mock.calls[0];
    expect(recordIndex).toBe(0);
    expect(updatedRecord.bg).toEqual([]);
    expect(onVisualsRemoved).toHaveBeenCalledWith([0, 1]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /批量删除/ })).toBeNull(),
    );
  });

  it("确认框里点取消 → 不写回记录", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const updateRecord = jest.fn();
    render(
      <BackgroundProperties
        selectedRecord={makeRecord([officeBackground])}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    fireEvent.click(screen.getByLabelText("选择背景 1"));
    fireEvent.click(screen.getByRole("button", { name: /批量删除/ }));

    await waitFor(() =>
      expect(screen.getByText("已选 1 / 1")).toBeTruthy(),
    );
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("全选 / 取消全选", () => {
    const updateRecord = jest.fn();
    render(
      <BackgroundProperties
        selectedRecord={makeRecord([officeBackground, streetBackground])}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    fireEvent.click(screen.getByLabelText("全选"));
    expect(screen.getByText("已选 2 / 2")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("取消全选"));
    expect(screen.getByText("已选 0 / 2")).toBeTruthy();
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("单条「删除」也通知预览态（与批量删除同一套逻辑）", () => {
    const onVisualsRemoved = jest.fn();
    const updateRecord = jest.fn();
    render(
      <BackgroundProperties
        selectedRecord={makeRecord([officeBackground, streetBackground])}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
        onVisualsRemoved={onVisualsRemoved}
      />,
    );

    fireEvent.click(screen.getAllByText("删除")[0]);

    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(updateRecord.mock.calls[0][1].bg).toHaveLength(1);
    expect(onVisualsRemoved).toHaveBeenCalledWith([0]);
  });
});

/* ===================== 点卡片 → 预览选中 ===================== */

describe("BackgroundProperties 点卡片 → 预览选中", () => {
  it("点卡片本体请求预览选中；不会勾上批量删除的复选框", () => {
    const onSelectVisual = jest.fn();
    render(
      <BackgroundProperties
        selectedRecord={makeRecord([officeBackground])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
        onSelectVisual={onSelectVisual}
      />,
    );

    fireEvent.click(screen.getByText("办公室"));

    expect(onSelectVisual).toHaveBeenCalledWith(0);
    expect(
      (screen.getByLabelText("选择背景 1") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("点卡片里的控件（滑杆 / 复原按钮 / 勾选框）不触发预览选中", () => {
    const onSelectVisual = jest.fn();
    render(
      <BackgroundProperties
        selectedRecord={makeRecord([officeBackground])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
        onSelectVisual={onSelectVisual}
      />,
    );

    fireEvent.click(screen.getByLabelText("背景 1 缩放滑块"));
    fireEvent.click(screen.getByLabelText("复原背景 1 缩放"));
    fireEvent.click(screen.getByLabelText("选择背景 1"));

    expect(onSelectVisual).not.toHaveBeenCalled();
  });

  it("activeIndex 指向的那张卡片显示预览选中态", () => {
    const { container } = render(
      <BackgroundProperties
        selectedRecord={makeRecord([officeBackground, streetBackground])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
        activeIndex={1}
      />,
    );

    const items = container.querySelectorAll(".backgrounds-list .background-item");
    expect(items[0].getAttribute("data-preview-selected")).toBeNull();
    expect(items[1].getAttribute("data-preview-selected")).toBe("true");
    expect(items[1].className).toContain("visual-card-preview-selected");
  });
});

/* ===================== 层级（上移 / 下移） ===================== */

/** 第三张背景：验证「删中间那张后剩下顺序不变」 */
const parkBackground: Background = {
  uuid: "bg3",
  name: "公园",
  path: "/assets/backgrounds/公园.png",
  thumbnailPath: "/assets/backgrounds/thumbnails/thumb_bg3.png",
  tags: [],
};

describe("BackgroundProperties 背景层级", () => {
  /** ↑ / ↓ 按钮：accessible name 就是箭头（与「立绘」页签的操作入口一致） */
  const arrows = (glyph: "↑" | "↓") =>
    screen.getAllByRole("button", { name: glyph }) as HTMLButtonElement[];

  const renderLayers = (backgrounds: Background[]) => {
    const updateRecord = renderPanel(makeRecord(backgrounds));
    return { updateRecord };
  };

  it("每张背景都有 ↑ / ↓；首项上移、末项下移禁用（无越界）", () => {
    renderLayers([officeBackground, streetBackground]);
    const ups = arrows("↑");
    const downs = arrows("↓");

    expect(ups).toHaveLength(2);
    expect(downs).toHaveLength(2);
    expect(ups[0].disabled).toBe(true);
    expect(downs[0].disabled).toBe(false);
    expect(ups[1].disabled).toBe(false);
    expect(downs[1].disabled).toBe(true);
  });

  it("只有一张背景时 ↑ / ↓ 都不可用", () => {
    renderLayers([officeBackground]);
    expect(arrows("↑")[0].disabled).toBe(true);
    expect(arrows("↓")[0].disabled).toBe(true);
  });

  it("点 ↓：这张在列表里下移一位（画面里后移一层）", () => {
    const { updateRecord } = renderLayers([officeBackground, streetBackground]);
    fireEvent.click(arrows("↓")[0]);

    expect(updateRecord).toHaveBeenCalledTimes(1);
    const [recordIndex, updated] = updateRecord.mock.calls[0];
    expect(recordIndex).toBe(0);
    // 首项下移 = 与第二项交换：街道跑到列表最上（画面最前）
    expect(updated.bg.map((bg: any) => bg.background.uuid)).toEqual([
      "bg2",
      "bg1",
    ]);
  });

  it("点 ↑：这张在列表里上移一位（画面里前移一层）", () => {
    const { updateRecord } = renderLayers([officeBackground, streetBackground]);
    fireEvent.click(arrows("↑")[1]);

    expect(updateRecord).toHaveBeenCalledTimes(1);
    const [, updated] = updateRecord.mock.calls[0];
    expect(updated.bg.map((bg: any) => bg.background.uuid)).toEqual([
      "bg2",
      "bg1",
    ]);
    // 交换的是位置：每张背景自己的缩放 / 偏移 / 压暗跟着它一起走
    expect(updated.bg[0].background.name).toBe("街道");
    expect(updated.bg[1].background.name).toBe("办公室");
    expect(updated.bg[1].scale).toBe(1);
  });

  it("禁用按钮点了不写回记录（首项不能上移、末项不能下移）", () => {
    const { updateRecord } = renderLayers([officeBackground, streetBackground]);
    fireEvent.click(arrows("↑")[0]);
    fireEvent.click(arrows("↓")[1]);
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("调整层级会清空批量勾选（下标含义变了，避免误删）", () => {
    renderLayers([officeBackground, streetBackground]);
    fireEvent.click(screen.getByLabelText("选择背景 1"));
    expect(screen.getByText("已选 1 / 2")).toBeTruthy();

    fireEvent.click(arrows("↓")[0]);
    expect(screen.getByText("已选 0 / 2")).toBeTruthy();
  });

  it("点 ↑ / ↓ 不会触发「点卡片 → 预览选中」（它们和删除按钮一样是卡片里的控件）", () => {
    const onSelectVisual = jest.fn();
    render(
      <BackgroundProperties
        selectedRecord={makeRecord([officeBackground, streetBackground])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
        onSelectVisual={onSelectVisual}
      />,
    );

    fireEvent.click(arrows("↓")[0]);
    fireEvent.click(arrows("↑")[1]);

    expect(onSelectVisual).not.toHaveBeenCalled();
  });

  it("删除中间那张后，剩下两张的相对顺序不变", () => {
    const { updateRecord } = renderLayers([
      officeBackground,
      streetBackground,
      parkBackground,
    ]);

    // 三张：首项只能下移、末项只能上移、中间项两个方向都能
    expect(arrows("↑")[0].disabled).toBe(true);
    expect(arrows("↓")[2].disabled).toBe(true);
    expect(arrows("↑")[1].disabled).toBe(false);
    expect(arrows("↓")[1].disabled).toBe(false);

    // 删中间的「街道」→ 剩下 办公室、公园，顺序保持不变
    fireEvent.click(screen.getAllByText("删除")[1]);
    const [, updated] = updateRecord.mock.calls[0];
    expect(updated.bg.map((bg: any) => bg.background.uuid)).toEqual([
      "bg1",
      "bg3",
    ]);
  });

  it("新加的背景追加到列表末尾（画面最底层，与现有新增行为一致）", async () => {
    getBackgrounds.mockResolvedValue([officeBackground, streetBackground]);
    const { updateRecord } = renderLayers([officeBackground]);
    // 等挂载时拉的背景列表落地（选择弹窗里的格子来自这次请求）
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "添加背景" }));
    fireEvent.doubleClick(screen.getByText("街道"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updated] = updateRecord.mock.calls[0];
    expect(updated.bg.map((bg: any) => bg.background.uuid)).toEqual([
      "bg1",
      "bg2",
    ]);
  });
});
