/**
 * 序列帧动画预览：视图缩放 / 平移 / 缩略图缩放精度的**接线测试**。
 *
 * 几何内核（锚点缩放、平移夹取、上下限）由 `spritePreviewView.test.ts` 覆盖；
 * 这里只验"控件 / 滚轮 / 拖拽 → 舞台样式与回调"这一层：
 * 1. 100% = 适应窗口，舞台尺寸 = fitStage（不拉伸）；
 * 2. 输入框 / 按钮 / 适应 → 舞台按倍数变大变小；
 * 3. Ctrl+滚轮缩放视图（拦截默认行为）、普通滚轮缩放缩略图（细 / 粗 / 微调）；
 * 4. 放大后拖舞台空白处平移，夹在边界内；
 * 5. 视图缩放不写任何摆放参数。
 *
 * jsdom 不做布局：把 `getBoundingClientRect` 固定成 800×450 的视口，
 * 于是舞台 = fitStage(800×450, 1280×720) = 785×442（16:9、四周留 4px）。
 */
import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import type { AnimationClipDto, AnimationClipPoster } from "@features/record/animation/animationClipAsset";
import SpriteAnimationPreview from "./SpriteAnimationPreview";
import type { PreviewPlayback } from "./SpriteAnimationPreview";
import { fitStage } from "./stageFit";

const VIEWPORT_RECT = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  width: 800,
  height: 450,
  right: 800,
  bottom: 450,
  toJSON: () => ({}),
} as DOMRect;

/** 与组件里同一个纯函数算出来的舞台尺寸（785 × 442） */
const STAGE = fitStage({ width: 800, height: 450 }, { width: 1280, height: 720 })!;

const CLIP: AnimationClipDto = {
  id: "flow_preview01",
  name: "花开",
  canvasWidth: 600,
  canvasHeight: 400,
  fps: 30,
  frameCount: 2,
  totalFrames: 3,
  frameHolds: [2, 1],
  loop: "once",
  iterations: null,
  startFrame: 0,
  fadeInFrames: 0,
  fadeOutFrames: 0,
  opacity: 1,
  poster: { frame: 0, offsetX: 0, offsetY: 0, scale: 1 },
  createdAt: 1,
  frameBaseUrl: "/assets/animation-clips/flow_preview01/frames/",
  coverUrl: "/assets/animation-clips/flow_preview01/frames/0001.png",
  framesOnDisk: 2,
  missingFrames: false,
};

const PLAYBACK: PreviewPlayback = {
  loop: "once",
  iterations: null,
  startFrame: 0,
  fadeInFrames: 0,
  fadeOutFrames: 0,
  opacity: 1,
};

/**
 * jsdom 没有 PointerEvent：RTL 会退化成普通 Event，`clientX / button` 全丢，
 * React 的合成事件也就读不到（拖动会算出 NaN）。补一个最小实现。
 */
class PointerEventPolyfill extends MouseEvent {
  public pointerId: number;

  constructor(type: string, params: Record<string, unknown> = {}) {
    super(type, params as MouseEventInit);
    this.pointerId = Number(params.pointerId ?? 0);
  }
}

beforeAll(() => {
  (window as any).PointerEvent = PointerEventPolyfill;
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn(() => false);
});

beforeEach(() => {
  jest.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(VIEWPORT_RECT);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const stageEl = () => screen.getByTestId("sprite-preview-stage");
const viewportEl = () => screen.getByTestId("sprite-preview-viewport");
const zoomInput = () => screen.getByLabelText(/视图缩放比例/) as HTMLInputElement;
const stageWidth = () => parseFloat(stageEl().style.width);

/**
 * 带本地状态的预览：与资源管理页里一样，`onPosterChange` 会回写成新的 poster，
 * 这样滚轮连续缩放才能基于"上一档"继续算（组件内部只用 prop 作为权威值）。
 */
const renderPreview = (onPosterChange = jest.fn()) => {
  const Harness: React.FC = () => {
    const [poster, setPoster] = useState<AnimationClipPoster>({
      frame: 0,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
    return (
      <SpriteAnimationPreview
        clip={CLIP}
        poster={poster}
        playback={PLAYBACK}
        onPosterChange={(next) => {
          setPoster(next);
          onPosterChange(next);
        }}
        characters={[]}
        backgrounds={[]}
      />
    );
  };
  const view = render(<Harness />);
  return { ...view, onPosterChange };
};

const setViewZoom = (value: string) => {
  fireEvent.change(zoomInput(), { target: { value } });
  fireEvent.keyDown(zoomInput(), { key: "Enter" });
};

describe("序列帧动画预览：视图缩放与缩放精度", () => {
  test("初始 100% = 适应窗口：舞台 = fitStage 的 785×442，不平移", () => {
    renderPreview();

    expect(zoomInput().value).toBe("100");
    expect(stageWidth()).toBe(STAGE.width);
    expect(parseFloat(stageEl().style.height)).toBe(STAGE.height);
    expect(stageEl().style.transform).toBe("");
    expect(stageEl().className).not.toContain("is-zoomed");
  });

  test("输入 200% / 点「适应」/ 按按钮：舞台按倍数缩放，并夹在 100%~400%", () => {
    renderPreview();

    setViewZoom("200");
    expect(zoomInput().value).toBe("200");
    expect(stageWidth()).toBeCloseTo(STAGE.width * 2, 6);
    expect(parseFloat(stageEl().style.height)).toBeCloseTo(STAGE.height * 2, 6);
    expect(stageEl().className).toContain("is-zoomed");

    fireEvent.click(screen.getByText("适应"));
    expect(zoomInput().value).toBe("100");
    expect(stageWidth()).toBe(STAGE.width);
    expect(stageEl().style.transform).toBe("");

    // 按钮一次 10 个百分点
    fireEvent.click(screen.getByRole("button", { name: "放大视图" }));
    expect(zoomInput().value).toBe("110");
    expect(stageWidth()).toBeCloseTo(STAGE.width * 1.1, 6);

    // 上限 400%
    setViewZoom("900");
    expect(zoomInput().value).toBe("400");
    expect(stageWidth()).toBeCloseTo(STAGE.width * 4, 6);
    expect((screen.getByRole("button", { name: "放大视图" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  test("Ctrl+滚轮以指针为锚点缩放视图；普通滚轮按 1% / 5% / 0.1% 缩放缩略图", () => {
    const { onPosterChange } = renderPreview();

    // Ctrl+滚轮：视图放大（一格约 10.5%），并拦住默认滚动 / 窗口缩放
    const viewWheel = fireEvent.wheel(stageEl(), {
      deltaY: -100,
      ctrlKey: true,
      clientX: 400,
      clientY: 225,
    });
    expect(viewWheel).toBe(false); // preventDefault 生效
    expect(zoomInput().value).toBe("110.5");
    expect(stageWidth()).toBeCloseTo(STAGE.width * Math.exp(0.1), 4);

    // 普通滚轮：缩略图缩放，一格约 1%
    const scaleWheel = fireEvent.wheel(stageEl(), { deltaY: 100 });
    expect(scaleWheel).toBe(false);
    expect(onPosterChange).toHaveBeenCalledTimes(1);
    expect((onPosterChange.mock.calls[0][0] as AnimationClipPoster).scale).toBeCloseTo(
      Math.exp(-0.01),
      6,
    );

    // Shift：粗调约 5%
    fireEvent.wheel(stageEl(), { deltaY: 100, shiftKey: true });
    expect((onPosterChange.mock.calls[1][0] as AnimationClipPoster).scale).toBeCloseTo(
      Math.exp(-0.01) * Math.exp(-0.05),
      6,
    );

    // Alt：微调约 0.1%
    fireEvent.wheel(stageEl(), { deltaY: 100, altKey: true });
    expect((onPosterChange.mock.calls[2][0] as AnimationClipPoster).scale).toBeCloseTo(
      Math.exp(-0.01) * Math.exp(-0.05) * Math.exp(-0.001),
      6,
    );

    // 在舞台外的留白上滚轮不抢（交给页面滚动），也不改缩放
    const outside = fireEvent.wheel(viewportEl(), { deltaY: 100 });
    expect(outside).toBe(true);
    expect(onPosterChange).toHaveBeenCalledTimes(3);
  });

  test("放大后拖动舞台空白处平移，夹在边界内；松手恢复抓取光标", () => {
    renderPreview();
    setViewZoom("200");

    const maxPanX = (STAGE.width * 2 - VIEWPORT_RECT.width) / 2;
    const maxPanY = (STAGE.height * 2 - VIEWPORT_RECT.height) / 2;

    fireEvent.pointerDown(stageEl(), { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    expect(stageEl().className).toContain("is-panning");

    fireEvent.pointerMove(stageEl(), { pointerId: 1, clientX: 300, clientY: 250 });
    expect(stageEl().style.transform).toBe("translate(200px, 150px)");

    // 拖过头：夹在"舞台边缘贴住视口边缘"
    fireEvent.pointerMove(stageEl(), { pointerId: 1, clientX: 5000, clientY: 5000 });
    expect(stageEl().style.transform).toBe(
      `translate(${maxPanX}px, ${maxPanY}px)`,
    );

    fireEvent.pointerUp(stageEl(), { pointerId: 1 });
    expect(stageEl().className).not.toContain("is-panning");
  });

  test("视图输入框编辑中滚轮缩放：以滚轮为准，失焦不按旧草稿缩回去", () => {
    renderPreview();
    const input = zoomInput();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "150" } }); // 只是草稿，还没提交
    fireEvent.wheel(stageEl(), { deltaY: -100, ctrlKey: true, clientX: 400, clientY: 225 });

    // 滚轮立即接管读数（旧草稿被丢掉）
    expect(input.value).toBe("110.5");
    fireEvent.blur(input);
    expect(input.value).toBe("110.5");
  });

  test("视图缩放只影响看：不调用 onPosterChange（摆放参数一个字都没动）", () => {
    const { onPosterChange } = renderPreview();

    fireEvent.click(screen.getByRole("button", { name: "放大视图" }));
    setViewZoom("300");
    fireEvent.wheel(stageEl(), { deltaY: -100, ctrlKey: true, clientX: 600, clientY: 300 });
    fireEvent.click(screen.getByText("适应"));

    expect(onPosterChange).not.toHaveBeenCalled();
  });
});
