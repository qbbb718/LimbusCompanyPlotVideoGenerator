import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  DialogueAlign,
  Emotion,
  Record as PlotRecord,
  TempImageVisual,
} from "@types";
import ApiService, { BASE_URL } from "@services/ApiService";
import * as libraryModule from "../animation/useAnimationClipLibrary";
import TempImagesProperties from "./TempImagesProperties";

/**
 * "剧情编辑 → 临时素材"（与「立绘」同级的独立页签）：
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
  it("页签标题、「添加临时素材」入口与页签说明都在", () => {
    renderPanel(makeRecord([]));

    expect(screen.getByText("临时素材")).toBeTruthy();
    expect(screen.getByText("添加临时素材")).toBeTruthy();
    // 页签说明（产品文案原话）：临时素材不进资源管理登记，即传即用
    expect(
      screen.getByText(
        "用于添加物品、路人等使用频率较低的小素材，无需在资源管理中登记，即传即用。",
      ),
    ).toBeTruthy();
  });

  it("页签说明挂在标题下方，与有没有素材无关", () => {
    renderPanel(makeRecord([makeTempImage({})]));

    const hint = screen.getByText(/无需在资源管理中登记/);
    // 一行说明文字（不是标题、也不是卡片里的控件），样式由 .temp-images-hint 提供
    expect(hint.tagName).toBe("P");
    expect(hint.className).toBe("temp-images-hint");

    const panel = hint.closest(".temp-images-properties")!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector("h4")?.textContent).toBe("临时素材");
  });

  it("绝对路径的 imagePath 也能解析成 /projects/... 缩略图地址", () => {
    renderPanel(makeRecord([makeTempImage({})]));

    const thumbnail = screen.getByAltText("临时素材 1");
    expect(thumbnail.getAttribute("src")).toBe(
      `${BASE_URL}/projects/temp/images/825a397f-d9c8-4f33-87dc-d5b27d108a6f.png`,
    );
  });

  it("每条临时素材各用各的缩略图", () => {
    renderPanel(
      makeRecord([
        makeTempImage({ uuid: "t1" }),
        makeTempImage({
          uuid: "t2",
          imagePath: "./projects/temp/images/第二张.png",
        }),
      ]),
    );

    expect(screen.getByAltText("临时素材 1").getAttribute("src")).toBe(
      `${BASE_URL}/projects/temp/images/825a397f-d9c8-4f33-87dc-d5b27d108a6f.png`,
    );
    expect(screen.getByAltText("临时素材 2").getAttribute("src")).toBe(
      `${BASE_URL}/projects/temp/images/${encodeURIComponent("第二张.png")}`,
    );
  });

  it("缩略图加载失败时隐藏图片（露出占位符）", () => {
    renderPanel(makeRecord([makeTempImage({})]));

    const thumbnail = screen.getByAltText("临时素材 1") as HTMLImageElement;
    fireEvent.error(thumbnail);

    expect(thumbnail.style.display).toBe("none");
  });

  it("没有 imagePath 时不渲染 <img>", () => {
    renderPanel(makeRecord([makeTempImage({ imagePath: "" })]));

    expect(screen.queryByAltText("临时素材 1")).toBeNull();
    expect(screen.getByText("临时素材 1")).toBeTruthy();
  });
});

describe("TempImagesProperties 控件写回记录", () => {
  it("缩放滑块把 scale 写回 tempImages", () => {
    const updateRecord = renderPanel(
      makeRecord([makeTempImage({ scale: 1 })]),
    );

    fireEvent.change(screen.getByLabelText("临时素材 1 缩放滑块"), {
      target: { value: "2" },
    });

    expect(updateRecord.mock.calls[0][1].tempImages[0].scale).toBe(2);
  });

  it("X / Y 数值框把 posX / posY 写回 tempImages", () => {
    const updateRecord = renderPanel(makeRecord([makeTempImage({})]));

    fireEvent.change(screen.getByLabelText("临时素材 1 X 坐标"), {
      target: { value: "640" },
    });
    expect(updateRecord.mock.calls[0][1].tempImages[0].posX).toBe(640);

    fireEvent.change(screen.getByLabelText("临时素材 1 Y 坐标"), {
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

    fireEvent.click(screen.getByText("添加临时素材"));

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

/* ===================== 情绪动画（序列帧）=「立绘」页签同一套组件 ===================== */

describe("TempImagesProperties 情绪动画（与「立绘」页签功能同步）", () => {
  /**
   * 素材库里什么都没有：摆放编辑必须只凭记录里的内联快照就能工作
   * （素材被删 / 换机器没带素材时正是这种情况）。
   *
   * <p>`resetMocks` 会把 `jest.spyOn` 的实现清掉，所以在每个用例前重新给一份。
   */
  let librarySpy: jest.SpyInstance;

  beforeEach(() => {
    librarySpy = jest
      .spyOn(libraryModule, "useAnimationClipLibrary")
      .mockReturnValue({
        clips: [],
        loading: false,
        error: null,
        reload: jest.fn(),
        find: () => undefined,
      });
  });

  afterEach(() => {
    librarySpy.mockRestore();
  });

  const withEmotionAnim = (overrides: Record<string, unknown> = {}) =>
    makeTempImage({
      emotionAnim: {
        version: 1,
        clipId: "flow_1",
        name: "花开",
        canvasWidth: 600,
        canvasHeight: 400,
        frameHolds: [3, 1, 2],
        loop: "once",
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        posterFrame: 0,
        ...overrides,
      },
    });

  it("每张临时素材都带「情绪动画（序列帧）」面板，默认「不使用」", () => {
    renderPanel(makeRecord([makeTempImage({})]));

    expect(screen.getByText(/情绪动画（序列帧）/)).toBeTruthy();
    expect(
      screen.getByLabelText("临时素材 1 选用情绪动画").textContent,
    ).toContain("不使用");
  });

  it("下拉文案按元素种类说「临时素材」，不照抄「立绘」", () => {
    renderPanel(makeRecord([makeTempImage({})]));

    fireEvent.click(screen.getByLabelText("临时素材 1 选用情绪动画"));
    const option = screen.getByRole("option", { name: /不使用/ });

    expect(option.textContent).toContain("临时素材上不画序列帧");
  });

  it("拖摆放滑杆把位置写回这条临时素材的 emotionAnim，其余字段原样保留", async () => {
    const updateRecord = renderPanel(makeRecord([withEmotionAnim()]));

    fireEvent.change(screen.getByLabelText("临时素材 1 动画 Y 位置滑块"), {
      target: { value: "0.75" },
    });

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [index, updatedRecord] = updateRecord.mock.calls[0];
    expect(index).toBe(0);
    expect(updatedRecord.tempImages[0].emotionAnim.offsetY).toBe(0.75);
    // 动画的时序快照与图片自己的缩放都不该被这次微调改掉
    expect(updatedRecord.tempImages[0].emotionAnim.frameHolds).toEqual([3, 1, 2]);
    expect(updatedRecord.tempImages[0].scale).toBe(1);
  });

  it("微调后点「还原」把摆放收回缺省值（素材已删时没有原摆放可比）", async () => {
    const updateRecord = renderPanel(
      makeRecord([
        withEmotionAnim({ offsetX: 1.5, offsetY: -0.5, scale: 2 }),
      ]),
    );

    fireEvent.click(screen.getByLabelText("临时素材 1 还原动画摆放"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.tempImages[0].emotionAnim.offsetX).toBe(0);
    expect(updatedRecord.tempImages[0].emotionAnim.offsetY).toBe(0);
    expect(updatedRecord.tempImages[0].emotionAnim.scale).toBe(1);
  });

  it("没挂序列帧动画的临时素材不显示摆放控件", () => {
    renderPanel(makeRecord([makeTempImage({})]));

    expect(screen.queryByText("摆放（相对头部区域）")).toBeNull();
  });

  it("摆放提示的坐标原点是临时素材的「头部区域中心」（不是脸框中心）", () => {
    renderPanel(makeRecord([withEmotionAnim()]));

    expect(
      screen.getByLabelText("临时素材 1 动画 X 位置").getAttribute("title"),
    ).toContain("头部区域中心");
  });
});

/* ===================== 批量删除 ===================== */

describe("TempImagesProperties 批量删除", () => {
  const makeThree = () =>
    makeRecord([
      makeTempImage({ uuid: "t1" }),
      makeTempImage({
        uuid: "t2",
        imagePath: "./projects/temp/images/第二张.png",
      }),
      makeTempImage({ uuid: "t3" }),
    ]);

  it("勾选两张：确认后逐张删后端文件，一次写回记录并清空勾选", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const deleteTempImage = jest
      .spyOn(ApiService, "deleteTempImage")
      .mockResolvedValue({ success: true });
    const onVisualsRemoved = jest.fn();
    const updateRecord = jest.fn();
    render(
      <TempImagesProperties
        selectedRecord={makeThree()}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
        onVisualsRemoved={onVisualsRemoved}
      />,
    );

    fireEvent.click(screen.getByLabelText("选择临时素材 1"));
    fireEvent.click(screen.getByLabelText("选择临时素材 3"));
    expect(screen.getByText("已选 2 / 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /批量删除/ }));

    // 与单条删除一致：先删后端文件（每张一个 uuid）
    await waitFor(() => expect(deleteTempImage).toHaveBeenCalledTimes(2));
    expect(deleteTempImage).toHaveBeenNthCalledWith(1, "t1");
    expect(deleteTempImage).toHaveBeenNthCalledWith(2, "t3");

    // 再写回记录：只剩中间那张
    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.tempImages.map((temp: TempImageVisual) => temp.uuid)).toEqual([
      "t2",
    ]);
    expect(onVisualsRemoved).toHaveBeenCalledWith([0, 2]);

    // 勾选清空：批量删除入口消失
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /批量删除/ })).toBeNull(),
    );
    expect(screen.getByText("已选 0 / 3")).toBeTruthy();
  });

  it("确认框里点取消 → 既不删文件也不写记录", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const deleteTempImage = jest
      .spyOn(ApiService, "deleteTempImage")
      .mockResolvedValue({ success: true });
    const updateRecord = jest.fn();
    render(
      <TempImagesProperties
        selectedRecord={makeThree()}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    fireEvent.click(screen.getByLabelText("选择临时素材 1"));
    fireEvent.click(screen.getByRole("button", { name: /批量删除/ }));

    await waitFor(() => expect(updateRecord).not.toHaveBeenCalled());
    expect(deleteTempImage).not.toHaveBeenCalled();
  });

  it("全选 / 取消全选", () => {
    const updateRecord = jest.fn();
    render(
      <TempImagesProperties
        selectedRecord={makeThree()}
        selectedRecordIndex={0}
        updateRecord={updateRecord}
      />,
    );

    fireEvent.click(screen.getByLabelText("全选"));
    expect(screen.getByText("已选 3 / 3")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("取消全选"));
    expect(screen.getByText("已选 0 / 3")).toBeTruthy();
    expect(updateRecord).not.toHaveBeenCalled();
  });
});

/* ===================== 点卡片 → 预览选中 ===================== */

describe("TempImagesProperties 点卡片 → 预览选中", () => {
  it("点卡片本体请求预览选中；不会勾上批量删除的复选框", () => {
    const onSelectVisual = jest.fn();
    render(
      <TempImagesProperties
        selectedRecord={makeRecord([makeTempImage({})])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
        onSelectVisual={onSelectVisual}
      />,
    );

    fireEvent.click(screen.getByText("临时素材 1"));

    expect(onSelectVisual).toHaveBeenCalledWith(0);
    expect(
      (screen.getByLabelText("选择临时素材 1") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("点卡片里的控件（滑杆 / 勾选框）不触发预览选中", () => {
    const onSelectVisual = jest.fn();
    render(
      <TempImagesProperties
        selectedRecord={makeRecord([makeTempImage({})])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
        onSelectVisual={onSelectVisual}
      />,
    );

    fireEvent.click(screen.getByLabelText("临时素材 1 缩放滑块"));
    fireEvent.click(screen.getByLabelText("选择临时素材 1"));

    expect(onSelectVisual).not.toHaveBeenCalled();
  });

  it("activeIndex 指向的那张卡片显示预览选中态", () => {
    const { container } = render(
      <TempImagesProperties
        selectedRecord={makeRecord([
          makeTempImage({ uuid: "t1" }),
          makeTempImage({ uuid: "t2" }),
        ])}
        selectedRecordIndex={0}
        updateRecord={jest.fn()}
        activeIndex={0}
      />,
    );

    const items = container.querySelectorAll(".temp-image-item");
    expect(items[0].getAttribute("data-preview-selected")).toBe("true");
    expect(items[0].className).toContain("visual-card-preview-selected");
    expect(items[1].getAttribute("data-preview-selected")).toBeNull();
  });
});
