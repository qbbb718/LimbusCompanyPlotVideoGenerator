/**
 * 「剧情编辑 → 摄像机」页签。
 *
 * 摄像机原先浮在预览画面上的工具条里，现在是独立页签。这组用例锁的是**搬迁后仍然成立的行为**：
 * - 起止镜头：点「◇ 终点」后推近 → 生成运镜（`camera.to` 出现），面板切到"运镜"态；
 * - 重置：起点与终点一起回到画布中心 1.00×；
 * - 运镜时长：合法值立刻写回记录，输入过程中的空值只当草稿（不把 24 帧顶成最小值）；
 * - 铺满背景：只放大最上层背景的 scale、不动 X/Y，倍数与 cameraView.coverScaleForBackground 一致；
 * - 拖动工具（移镜 / 移元素）与视图按钮都在这一个页签里。
 *
 * 状态由 useCameraEditor 统一持有（与预览里的世界视图共用），所以这里把 Hook 一起挂上：
 * 点按钮 → 写回记录 → 面板按新记录重渲染，走的是真实链路。
 */
import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  BackgroundVisual,
  DialogueAlign,
  Emotion,
  Record as PlotRecord,
  RecordCamera,
} from "@types";
import CameraProperties from "./CameraProperties";
import { useCameraEditor } from "../preview/useCameraEditor";
import { IDENTITY_CAMERA } from "../preview/cameraView";

/**
 * 背景原图尺寸：30:9 的横长条。
 *
 * <p>选它是因为倍数能手算：contain 到 1920×1080 只画 1920×288，
 * 铺满取景框（1920×1080）要放大 1080/288 = 3.75 倍。
 */
const BACKGROUND_SIZE = { width: 3840, height: 576 };

/**
 * jsdom 不会真的加载图片，`useImageSizes` 永远等不到 naturalWidth。
 * 这里用一个"立刻成功"的替身：尺寸固定，`src` 一设置就在下一个宏任务里回调 onload。
 */
class MockImage {
  onload: (() => void) | null = null;

  onerror: (() => void) | null = null;

  naturalWidth = BACKGROUND_SIZE.width;

  naturalHeight = BACKGROUND_SIZE.height;

  set src(_value: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}

const makeBackground = (
  overrides: Partial<BackgroundVisual> = {},
): BackgroundVisual => ({
  background: {
    uuid: "bg1",
    name: "宽幅背景",
    path: "wide.png",
  } as BackgroundVisual["background"],
  posX: 0,
  posY: 0,
  scale: 1,
  visible: true,
  ...overrides,
});

const makeRecord = (overrides: Partial<PlotRecord> = {}): PlotRecord => ({
  uuid: "r1",
  durationFrames: 90,
  dialogue: {
    text: "台词",
    location: "default",
    speakerC: [],
    speakerName: "旁白",
    faction: "",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
  },
  bg: [],
  chars: [],
  tempImages: [],
  effects: [],
  audioCommands: [],
  ...overrides,
});

/** 一条"已经在运镜"的记录：用来测时长/缓动/复位这些只有终点时才有的控件 */
const animatedRecord = (camera: Partial<RecordCamera> = {}): PlotRecord =>
  makeRecord({
    camera: {
      centerX: 960,
      centerY: 540,
      zoom: 1,
      to: { centerX: 480, centerY: 540, zoom: 1.5 },
      easing: "easeOut",
      moveFrames: 24,
      ...camera,
    },
  });

/**
 * 带状态的测试壳：记录保存在这里，`useCameraEditor` 的写回直接落在这份记录上，
 * 与 RecordEditor 里的连接方式一致（那边只是多了撤销栈）。
 * `onRecord` 把每一次写回都交给用例断言"到底改了什么"；
 * 「镜头自动跟随说话人」是工程级开关，这里同样用一份本地状态模拟 projectSettings。
 */
const Harness: React.FC<{
  initial: PlotRecord;
  onRecord?: (record: PlotRecord) => void;
  onFollowChange?: (enabled: boolean) => void;
}> = ({ initial, onRecord, onFollowChange }) => {
  const [record, setRecord] = useState(initial);
  const [followSpeaker, setFollowSpeaker] = useState(false);
  const updateRecord = (_index: number, next: PlotRecord) => {
    onRecord?.(next);
    setRecord(next);
  };
  const editor = useCameraEditor(
    record.camera,
    record.durationFrames ?? 0,
    (camera) => updateRecord(0, { ...record, camera }),
    record.uuid,
  );

  return (
    <CameraProperties
      selectedRecord={record}
      selectedRecordIndex={0}
      updateRecord={updateRecord}
      editor={editor}
      cameraFollowSpeaker={followSpeaker}
      onCameraFollowSpeakerChange={(enabled) => {
        onFollowChange?.(enabled);
        setFollowSpeaker(enabled);
      }}
    />
  );
};

/** 渲染面板，返回"每次写回后的记录"列表（最后一项 = 当前状态） */
const setupPanel = (initial: PlotRecord = makeRecord()): PlotRecord[] => {
  const writes: PlotRecord[] = [];
  render(<Harness initial={initial} onRecord={(record) => writes.push(record)} />);
  return writes;
};

/** 最后一次写回的记录 */
const lastWrite = (writes: PlotRecord[]): PlotRecord =>
  writes[writes.length - 1];

describe("摄像机页签 → 起止镜头", () => {
  beforeEach(() => {
    (global as any).Image = MockImage;
  });

  test("没有终点时是「静止镜头」：没有缓动/时长控件，播放按钮禁用", () => {
    setupPanel();

    expect(screen.getByText(/静止镜头/, { selector: ".camera-summary-state" })).toBeTruthy();
    // 提示用户怎么生成运镜
    expect(screen.getByText(/还没有终点镜头/)).toBeTruthy();
    expect(screen.queryByLabelText("运镜缓动")).toBeNull();
    expect(screen.queryByLabelText("运镜时长（帧）")).toBeNull();
    expect(screen.getByRole("button", { name: /播放/ })).toBeDisabled();
  });

  test("点「◇ 终点」后推近 → 记录里出现终点镜头，面板切成运镜态", () => {
    const writes = setupPanel();

    fireEvent.click(screen.getByRole("button", { name: /终点/ }));
    expect(screen.getByRole("button", { name: /终点/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // 推近只改缩放、中心不动（以取景框中心为锚）
    fireEvent.click(screen.getByRole("button", { name: "推近" }));

    const camera = lastWrite(writes).camera!;
    // 终点 = 起点中心 + 1.25 倍；起点原样保留（它还是恒等的 960,540,1）
    expect(camera.centerX).toBe(960);
    expect(camera.centerY).toBe(540);
    expect(camera.zoom).toBe(1);
    expect(camera.to).toEqual({ centerX: 960, centerY: 540, zoom: 1.25 });
    // 默认缓动「慢出」、默认运镜 24 帧（与后端 Camera 的初值一致）
    expect(camera.easing).toBe("easeOut");
    expect(camera.moveFrames).toBe(24);

    // 生成运镜后：摘要变成运镜，缓动与时长控件出现，播放按钮可用
    expect(screen.getByText(/运镜 24 帧/, { selector: ".camera-summary-state" })).toBeTruthy();
    expect(screen.getByLabelText("运镜缓动")).toBeTruthy();
    expect(screen.getByLabelText("运镜时长（帧）")).toBeTruthy();
    expect(screen.getByRole("button", { name: /播放/ })).not.toBeDisabled();
  });

  test("没点过「终点」时改缩放只动起点（不会凭空生成 to）", () => {
    const writes = setupPanel();

    fireEvent.change(screen.getByLabelText("镜头缩放滑块"), {
      target: { value: "2" },
    });

    expect(lastWrite(writes).camera).toEqual({
      centerX: 960,
      centerY: 540,
      zoom: 2,
    });
    expect(screen.getByText(/静止镜头/, { selector: ".camera-summary-state" })).toBeTruthy();
    expect(screen.queryByLabelText("运镜缓动")).toBeNull();
  });

  test("运镜时长：合法值立刻写回；清空只是草稿（不把 24 帧顶成最小值）", () => {
    const writes = setupPanel(animatedRecord({ moveFrames: 24 }));

    const field = screen.getByLabelText("运镜时长（帧）") as HTMLInputElement;
    expect(field).toHaveValue(24);

    fireEvent.change(field, { target: { value: "48" } });
    expect(lastWrite(writes).camera!.moveFrames).toBe(48);
    expect(screen.getByText(/运镜 48 帧/, { selector: ".camera-summary-state" })).toBeTruthy();

    // 清空输入框：草稿态，记录里的时长保持 48（旧实现会把 24 顶成 1）
    fireEvent.change(screen.getByLabelText("运镜时长（帧）"), {
      target: { value: "" },
    });
    expect(lastWrite(writes).camera!.moveFrames).toBe(48);
    expect(screen.getByLabelText("运镜时长（帧）")).toHaveValue(null);

    // 失焦：回到记录里的真实值
    fireEvent.blur(screen.getByLabelText("运镜时长（帧）"));
    expect(screen.getByLabelText("运镜时长（帧）")).toHaveValue(48);
  });

  test("缓动下拉写回记录", () => {
    const writes = setupPanel(animatedRecord({ easing: "easeOut" }));

    fireEvent.change(screen.getByLabelText("运镜缓动"), {
      target: { value: "linear" },
    });

    expect(lastWrite(writes).camera!.easing).toBe("linear");
  });

  test("复位镜头：起点与终点一起回到画布中心、1.00×", () => {
    const writes = setupPanel(
      animatedRecord({
        centerX: 1200,
        centerY: 300,
        zoom: 2,
        to: { centerX: 480, centerY: 800, zoom: 1.5 },
        easing: "easeIn",
        moveFrames: 10,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "复位镜头" }));

    // 恒等镜头 = 没有运镜 = 与没有摄像机时完全一样
    expect(lastWrite(writes).camera).toEqual(IDENTITY_CAMERA);
    expect(screen.getByText(/静止镜头/, { selector: ".camera-summary-state" })).toBeTruthy();
    expect(screen.queryByLabelText("运镜缓动")).toBeNull();
    expect(screen.getByLabelText("镜头缩放滑块")).toHaveValue("1");
    expect(screen.getAllByText(/960, 540/).length).toBeGreaterThan(0);
  });
});

describe("摄像机页签 → 铺满背景", () => {
  beforeEach(() => {
    (global as any).Image = MockImage;
  });

  test("没有背景时按钮禁用（读不到原图尺寸就无从算倍数）", () => {
    setupPanel();
    expect(screen.getByRole("button", { name: "铺满背景" })).toBeDisabled();
  });

  test("铺满最上层背景：倍数 = 取景框高 / 画出来的高（3.75），不动 X/Y 与其它字段", async () => {
    const background = makeBackground({ posX: 120, posY: -30, scale: 1 });
    const writes = setupPanel(makeRecord({ bg: [background] }));

    const cover = screen.getByRole("button", { name: "铺满背景" });
    // 原图尺寸是异步读到的：读到之后按钮才可用
    await waitFor(() => expect(cover).not.toBeDisabled());

    fireEvent.click(cover);

    const bg = lastWrite(writes).bg![0];
    // 3840×576 contain 进 1920×1080 → 画成 1920×288；盖住 1080 高要 3.75 倍
    expect(bg.scale).toBe(3.75);
    // 只改缩放：位置与选中的背景都不动
    expect(bg.posX).toBe(120);
    expect(bg.posY).toBe(-30);
    expect(bg.background).toBe(background.background);
  });
});

describe("摄像机页签 → 拖动工具与视图按钮", () => {
  beforeEach(() => {
    (global as any).Image = MockImage;
  });

  test("默认移镜；点「移元素」后两把工具的按下态互换（世界视图读的是同一份状态）", () => {
    setupPanel();

    expect(screen.getByRole("button", { name: /移镜/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /移元素/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: /移元素/ }));

    expect(screen.getByRole("button", { name: /移元素/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /移镜/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("世界视图的按钮都在这一个页签里（适配视图 / 复位 / 铺满背景）", () => {
    setupPanel();

    ["适配视图", "复位镜头", "铺满背景"].forEach((name) => {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    });
  });

  test("「预设」区块也在摄像机页签里（镜头摇动等镜头层效果）", () => {
    setupPanel();

    expect(screen.getByRole("region", { name: "摄像机预设" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "镜头摇动" })).toBeTruthy();
  });
});

describe("摄像机页签 → 构图辅助（镜头自动跟随说话人）", () => {
  beforeEach(() => {
    (global as any).Image = MockImage;
  });

  test("勾选框在页签里，默认关；勾选 / 取消都交给上层写工程设置", () => {
    const onFollowChange = jest.fn();
    render(
      <Harness initial={makeRecord()} onFollowChange={onFollowChange} />,
    );

    const toggle = screen.getByLabelText(
      "镜头自动跟随说话人",
    ) as HTMLInputElement;
    expect(toggle.type).toBe("checkbox");
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);
    expect(onFollowChange).toHaveBeenLastCalledWith(true);
    expect(toggle.checked).toBe(true);

    fireEvent.click(toggle);
    expect(onFollowChange).toHaveBeenLastCalledWith(false);
    expect(toggle.checked).toBe(false);
  });

  test("说明文字写清了「工程全局」与「手动调整优先」", () => {
    setupPanel();

    // 提示简化为一行，但必须点明两件事：作用于整个工程、手动调整优先
    expect(screen.getByText(/工程全局选项：移动说话人立绘/)).toBeTruthy();
    expect(screen.getByText(/手动调整优先/)).toBeTruthy();
  });
});
