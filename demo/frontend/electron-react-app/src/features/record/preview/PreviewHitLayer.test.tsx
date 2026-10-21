/**
 * 预览热区层的交互测试。
 *
 * 只验证"点谁、回调什么"这类与几何无关的行为（几何已在 previewLayout.test.ts 锁过）：
 * 鼠标点击走「命中集合 + 循环下钻」，键盘 Enter 走"直接选这个按钮"。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
// 本项目没有全局 setupTests（jest-dom 匹配器未注册），用到 toBeInTheDocument 的文件自行引入
import "@testing-library/jest-dom";
import PreviewHitLayer from "./PreviewHitLayer";
import type { PreviewLayer } from "./previewLayout";

const FRAME = { width: 1920, height: 1080 };

const makeLayer = (over: Partial<PreviewLayer>): PreviewLayer => ({
  key: "dialogBox",
  kind: "dialogBox",
  index: -1,
  label: "对话框（含台词）",
  z: 300,
  space: "design",
  baseRect: { x: 264, y: 826, w: 1470, h: 254 },
  outRect: { x: 264, y: 826, w: 1470, h: 254 },
  ...over,
});

const background = makeLayer({
  key: "background:0",
  kind: "background",
  index: 0,
  label: "背景 1 · 办公室",
  z: 10,
  space: "world",
  outRect: { x: 192, y: 108, w: 1536, h: 864 },
  baseRect: { x: 192, y: 108, w: 1536, h: 864 },
});

const charA = makeLayer({
  key: "character:0",
  kind: "character",
  index: 0,
  label: "立绘 1 · 罗佳",
  z: 100,
  space: "world",
  outRect: { x: 600, y: 100, w: 400, h: 600 },
  baseRect: { x: 600, y: 100, w: 400, h: 600 },
});

const charB = makeLayer({
  key: "character:1",
  kind: "character",
  index: 1,
  label: "立绘 2 · 希斯克利夫",
  z: 90,
  space: "world",
  outRect: { x: 700, y: 200, w: 400, h: 600 },
  baseRect: { x: 700, y: 200, w: 400, h: 600 },
});

/** 给热区层容器补一个 1920×1080 的布局盒（jsdom 默认 getBoundingClientRect 全是 0） */
const stubLayout = (container: HTMLElement) => {
  const layer = container.querySelector(".preview-hit-layer") as HTMLElement;
  jest.spyOn(layer, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: FRAME.width,
    height: FRAME.height,
    right: FRAME.width,
    bottom: FRAME.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  return layer;
};

const renderLayers = (props: Partial<React.ComponentProps<typeof PreviewHitLayer>> = {}) => {
  const onSelect = jest.fn();
  const result = render(
    <PreviewHitLayer
      layers={[background, charA, charB]}
      frame={FRAME}
      onSelect={onSelect}
      {...props}
    />,
  );
  const layer = stubLayout(result.container);
  return { ...result, layer, onSelect };
};

describe("预览热区层", () => {
  test("每个图层都是一个按钮，aria-label 是元素名", () => {
    renderLayers();
    expect(screen.getByRole("button", { name: "立绘 1 · 罗佳" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "背景 1 · 办公室" })).toBeInTheDocument();
  });

  test("点重叠区域 → 选最上层；再点 → 依次下钻", () => {
    const { layer, onSelect } = renderLayers();
    // (800,400) 同时压住 charA / charB / 背景
    fireEvent.click(layer, { clientX: 800, clientY: 400 });
    fireEvent.click(layer, { clientX: 800, clientY: 400 });
    fireEvent.click(layer, { clientX: 800, clientY: 400 });
    fireEvent.click(layer, { clientX: 800, clientY: 400 });
    expect(onSelect.mock.calls.map((call) => call[0].key)).toEqual([
      "character:0",
      "character:1",
      "background:0",
      "character:0",
    ]);
  });

  test("点空白 → 取消选中，且不误触发选中", () => {
    const onClear = jest.fn();
    const { layer, onSelect } = renderLayers({ onClear });
    fireEvent.click(layer, { clientX: 20, clientY: 20 });
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("切换区域后循环归零：先在重叠区钻一层，再点只压一层的区域", () => {
    const { layer, onSelect } = renderLayers();
    fireEvent.click(layer, { clientX: 800, clientY: 400 }); // charA
    fireEvent.click(layer, { clientX: 620, clientY: 500 }); // 只压 charA + 背景 → 归零
    expect(onSelect.mock.calls.map((call) => call[0].key)).toEqual([
      "character:0",
      "character:0",
    ]);
  });

  test("外部清空选中（切记录）后，循环记忆一并作废", () => {
    const { layer, onSelect, rerender } = renderLayers({ selectedKey: "character:0" });
    fireEvent.click(layer, { clientX: 800, clientY: 400 }); // charA
    fireEvent.click(layer, { clientX: 800, clientY: 400 }); // 下钻到 charB
    // 模拟切记录：父组件把选中清成 null
    rerender(
      <PreviewHitLayer
        layers={[background, charA, charB]}
        frame={FRAME}
        onSelect={onSelect}
        selectedKey={null}
      />,
    );
    fireEvent.click(layer, { clientX: 800, clientY: 400 });
    expect(onSelect.mock.calls.map((call) => call[0].key)).toEqual([
      "character:0",
      "character:1",
      "character:0", // 清空后重新从最上层开始
    ]);
  });

  test("键盘 Enter（detail=0）直接选中该按钮对应的元素，不参与循环", () => {
    const { onSelect } = renderLayers();
    // 直接对"最下层"那个按钮触发键盘点击
    fireEvent.click(screen.getByRole("button", { name: "立绘 2 · 希斯克利夫" }), {
      detail: 0,
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].key).toBe("character:1");
  });

  test("选中的那个图层带 selected 类与 aria-pressed", () => {
    renderLayers({ selectedKey: "character:0" });
    const selected = screen.getByRole("button", { name: "立绘 1 · 罗佳" });
    const other = screen.getByRole("button", { name: "背景 1 · 办公室" });
    expect(selected.className).toContain("selected");
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(other.className).not.toContain("selected");
    expect(other.getAttribute("aria-pressed")).toBe("false");
  });

  test("按图层 z 渲染，后渲染的在上层", () => {
    const { container } = renderLayers();
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".preview-hit"),
    );
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "背景 1 · 办公室",
      "立绘 2 · 希斯克利夫",
      "立绘 1 · 罗佳",
    ]);
    expect(buttons.map((button) => button.style.zIndex)).toEqual(["10", "90", "100"]);
  });

  test("frame 尺寸为 0（还没量到舞台）时不渲染", () => {
    const { container } = render(
      <PreviewHitLayer
        layers={[background]}
        frame={{ width: 0, height: 0 }}
        onSelect={jest.fn()}
      />,
    );
    expect(container.querySelector(".preview-hit-layer")).toBeNull();
  });
});

describe("预览热区层 → 拖拽", () => {
  /**
   * jsdom 没有 PointerEvent，用 MouseEvent 造同类型的合成事件（React 只认事件类型，
   * clientX/clientY/shiftKey 都在 MouseEvent 上）。
   */
  const firePointer = (
    element: Element,
    type: "pointerdown" | "pointermove" | "pointerup",
    init: MouseEventInit,
  ) => {
    element.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }),
    );
  };

  const renderDraggable = () => {
    const onSelect = jest.fn();
    const onLayerMove = jest.fn();
    const onLayerDragStart = jest.fn();
    const onLayerDragEnd = jest.fn();
    const onLayerDragCancel = jest.fn();
    const result = render(
      <PreviewHitLayer
        layers={[background, charA, charB]}
        frame={FRAME}
        onSelect={onSelect}
        getLayerPosition={(layer) =>
          layer.kind === "character" ? { x: 100, y: 200 } : { x: 0, y: 0 }
        }
        onLayerMove={onLayerMove}
        onLayerDragStart={onLayerDragStart}
        onLayerDragEnd={onLayerDragEnd}
        onLayerDragCancel={onLayerDragCancel}
      />,
    );
    const layer = stubLayout(result.container);
    return {
      layer,
      onSelect,
      onLayerMove,
      onLayerDragStart,
      onLayerDragEnd,
      onLayerDragCancel,
    };
  };

  test("拖动超过阈值：先选中该元素，再持续回写「起点 + 位移」", () => {
    const handlers = renderDraggable();
    firePointer(handlers.layer, "pointerdown", { clientX: 800, clientY: 400 });
    firePointer(handlers.layer, "pointermove", { clientX: 810, clientY: 400 });
    firePointer(handlers.layer, "pointerup", { clientX: 810, clientY: 400 });

    // 拖动即选中（属性面板要跟着切）
    expect(handlers.onSelect).toHaveBeenCalledTimes(1);
    expect(handlers.onSelect.mock.calls[0][0].key).toBe("character:0");
    expect(handlers.onLayerDragStart).toHaveBeenCalledWith(
      expect.objectContaining({ key: "character:0" }),
      { x: 100, y: 200 },
    );

    // 舞台 1920 宽、frame 1920 → 1 CSS 像素 = 1.25 设计像素；位移 10 CSS → +12.5
    const [, position] = handlers.onLayerMove.mock.calls.at(-1)!;
    expect(position.x).toBeCloseTo(100 + 10 * 1.25);
    expect(position.y).toBeCloseTo(200);
    expect(handlers.onLayerDragEnd).toHaveBeenCalledTimes(1);
  });

  test("位移不足阈值按点击处理：不进入拖拽", () => {
    const handlers = renderDraggable();
    firePointer(handlers.layer, "pointerdown", { clientX: 800, clientY: 400 });
    firePointer(handlers.layer, "pointermove", { clientX: 801, clientY: 401 });
    firePointer(handlers.layer, "pointerup", { clientX: 801, clientY: 401 });
    fireEvent.click(handlers.layer, { clientX: 800, clientY: 400 });

    expect(handlers.onLayerMove).not.toHaveBeenCalled();
    expect(handlers.onLayerDragStart).not.toHaveBeenCalled();
    // 仍然是普通点击 → 选中最上层
    expect(handlers.onSelect).toHaveBeenCalledTimes(1);
    expect(handlers.onSelect.mock.calls[0][0].key).toBe("character:0");
  });

  test("拖完的 pointerup 会带一个 click，不能让它再触发一次选中", () => {
    const handlers = renderDraggable();
    firePointer(handlers.layer, "pointerdown", { clientX: 800, clientY: 400 });
    firePointer(handlers.layer, "pointermove", { clientX: 830, clientY: 400 });
    firePointer(handlers.layer, "pointerup", { clientX: 830, clientY: 400 });
    fireEvent.click(handlers.layer, { clientX: 830, clientY: 400 });
    expect(handlers.onSelect).toHaveBeenCalledTimes(1); // 只有拖动开始时那一次
  });

  test("Shift 锁轴：只有位移大的轴生效", () => {
    const handlers = renderDraggable();
    firePointer(handlers.layer, "pointerdown", { clientX: 800, clientY: 400 });
    firePointer(handlers.layer, "pointermove", {
      clientX: 840,
      clientY: 410,
      shiftKey: true,
    });
    firePointer(handlers.layer, "pointerup", { clientX: 840, clientY: 410, shiftKey: true });

    const [, position] = handlers.onLayerMove.mock.calls.at(-1)!;
    expect(position.x).toBeCloseTo(100 + 40 * 1.25);
    expect(position.y).toBeCloseTo(200); // 纵向被锁掉
  });

  test("Esc 取消拖动：回调 cancel，由上层还原位置", () => {
    const handlers = renderDraggable();
    firePointer(handlers.layer, "pointerdown", { clientX: 800, clientY: 400 });
    firePointer(handlers.layer, "pointermove", { clientX: 830, clientY: 430 });
    fireEvent.keyDown(window, { key: "Escape" });

    expect(handlers.onLayerDragCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onLayerDragCancel.mock.calls[0][0].key).toBe("character:0");
    expect(handlers.onLayerDragEnd).not.toHaveBeenCalled();
  });

  test("没有传拖拽回调时就是纯点选模式（pointer 事件不产生位移）", () => {
    const onSelect = jest.fn();
    const onLayerMove = jest.fn();
    const { container } = render(
      <PreviewHitLayer
        layers={[background, charA]}
        frame={FRAME}
        onSelect={onSelect}
        onLayerMove={onLayerMove}
      />,
    );
    const layer = stubLayout(container);
    firePointer(layer, "pointerdown", { clientX: 800, clientY: 400 });
    firePointer(layer, "pointermove", { clientX: 860, clientY: 400 });
    firePointer(layer, "pointerup", { clientX: 860, clientY: 400 });
    expect(onLayerMove).not.toHaveBeenCalled();
  });
});
