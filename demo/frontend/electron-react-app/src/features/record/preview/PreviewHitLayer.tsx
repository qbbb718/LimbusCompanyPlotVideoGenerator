/**
 * @module 预览热区层
 *
 * 把几何模块算出来的每个图层铺成一个**可点击的按钮**，叠在栅格图上面：
 * 点击走「命中集合 + 循环下钻」（见 hitCycle.ts），按住拖动则移动元素（见 previewDrag.ts）。
 *
 * <h3>为什么按钮只负责"位置和可访问性"，鼠标交互交给外层容器</h3>
 * 每个图层一个 `<button>`，按图层 `z` 设 `z-index`：浏览器层叠规则天然等于后端绘制顺序，
 * 不用手写"谁在上面"。但**鼠标点击/拖拽在容器上统一处理**——只有容器知道这一点的完整命中集合
 * （DOM 事件只会落在最上面那个按钮上），循环下钻和"拖当前选中的那一层"都必须靠它。
 * 键盘（Enter/Space）点某个按钮时 `event.detail === 0`，直接选该按钮对应的元素，不参与循环。
 *
 * <h3>拖拽的几个约定</h3>
 * <ul>
 *   <li>移动超过 {@link DRAG_THRESHOLD_PX} 才算拖拽，否则按点击处理（不会点一下就把元素挪 1px）；</li>
 *   <li>拖的是"当前选中的那一层"（若它压在这点上），否则是最上层——所以先点一下选中再拖，语义最直观；</li>
 *   <li>位置计算只在这里做一次：起点 + 设计画布位移；写回记录由上层负责；</li>
 *   <li>位移用 `requestAnimationFrame` 合并，一帧最多回写一次，避免刷爆 React 状态；</li>
 *   <li>Esc 取消并还原到拖动起点；Shift 锁定单轴。</li>
 * </ul>
 */
import React, { useEffect, useRef } from "react";
import type { ImageSize, PreviewLayer } from "./previewLayout";
import { layersAt } from "./previewLayout";
import { resolveCycledHit } from "./hitCycle";
import type { HitCycleState } from "./hitCycle";
import {
  DRAG_THRESHOLD_PX,
  isDraggableLayer,
  lockAxis,
  worldDeltaFromStage,
} from "./previewDrag";
import type { DragPoint } from "./previewDrag";

interface PreviewHitLayerProps {
  /** 几何模块产出的全部图层（本层只负责摆位置与接收交互） */
  layers: PreviewLayer[];
  /** 百分比坐标的分母：预览图尺寸 */
  frame: ImageSize;
  /** 当前选中的图层 key（画选中框，也决定循环状态是否延续） */
  selectedKey?: string | null;
  /** 点击某个元素 */
  onSelect: (layer: PreviewLayer) => void;
  /** 点击空白（没有元素的位置）——用于取消选中 */
  onClear?: () => void;

  /* ===== 以下四个都传了才开启拖拽 ===== */
  /** 取某图层当前的位置（设计画布像素）；返回 null 表示这一层不可拖 */
  getLayerPosition?: (layer: PreviewLayer) => DragPoint | null;
  /** 真正开始拖动（越过阈值）时回调一次，带上拖动起点，供 Esc 还原 */
  onLayerDragStart?: (layer: PreviewLayer, start: DragPoint) => void;
  /** 拖动中：新的位置（已按帧合并） */
  onLayerMove?: (layer: PreviewLayer, position: DragPoint) => void;
  /** 松手：拖动结束 */
  onLayerDragEnd?: (layer: PreviewLayer) => void;
  /** Esc / 指针取消：需要把位置还原到起点 */
  onLayerDragCancel?: (layer: PreviewLayer) => void;
  /** 相机 zoom（identity = 1）；C1 之后放得越大，同样的手势移动的世界像素越少 */
  cameraZoom?: number;
}

const percent = (value: number, total: number): string =>
  total > 0 ? `${(value / total) * 100}%` : "0%";

/**
 * 把鼠标事件的客户端坐标换算成**预览图像素**。
 *
 * <p>容器（= 舞台）的 DOM 尺寸与 `frame` 是同一个宽高比，所以按比例缩放即可。
 * 还没完成布局（宽度为 0，或 jsdom 环境）时返回 null，调用方走兜底逻辑。
 */
const toFramePoint = (
  event: { clientX: number; clientY: number },
  element: HTMLElement | null,
  frame: ImageSize,
): DragPoint | null => {
  const rect = element?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((event.clientX - rect.left) / rect.width) * frame.width,
    y: ((event.clientY - rect.top) / rect.height) * frame.height,
  };
};

/** 一次进行中的拖拽 */
interface DragSession {
  pointerId: number;
  /** 按下时的指针位置（CSS 像素） */
  startClient: DragPoint;
  /** 按下时元素的位置（设计画布像素） */
  startPosition: DragPoint;
  layer: PreviewLayer;
  /** 是否已越过阈值（越过后才算"拖拽"，否则松手按点击处理） */
  moved: boolean;
}

/**
 * 热区层。
 *
 * <p>定位一律用百分比（分母是预览图尺寸），所以舞台随窗口缩放时热区自动跟随，
 * 不需要重新计算像素。
 */
const PreviewHitLayer: React.FC<PreviewHitLayerProps> = ({
  layers,
  frame,
  selectedKey = null,
  onSelect,
  onClear,
  getLayerPosition,
  onLayerDragStart,
  onLayerMove,
  onLayerDragEnd,
  onLayerDragCancel,
  cameraZoom = 1,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** 循环下钻的记忆：上次命中的集合与下标 */
  const cycleRef = useRef<HitCycleState | null>(null);
  /** 正在进行中的拖拽 */
  const dragRef = useRef<DragSession | null>(null);
  /** 刚拖完的那次 pointerup 会再触发一个 click，用它吃掉 */
  const suppressClickRef = useRef(false);
  /** 拖动位置的帧合并：一帧最多回写一次 */
  const pendingMoveRef = useRef<{ layer: PreviewLayer; position: DragPoint } | null>(null);
  const rafRef = useRef<number | null>(null);

  const dragEnabled = Boolean(getLayerPosition && onLayerMove);

  // 外部把选中清掉（切记录 / 点空白）时，循环记忆一起作废：
  // 否则下一次点同一片重叠区会从上一次的"下一层"接着走，而不是从最上层开始。
  useEffect(() => {
    if (!selectedKey) cycleRef.current = null;
  }, [selectedKey]);

  /** 把挂起的位移立刻发给上层（松手/取消时别丢掉最后一帧） */
  const flushMove = () => {
    if (rafRef.current !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = null;
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (pending) onLayerMove?.(pending.layer, pending.position);
  };

  /** 一帧内多次 pointermove 只回写最后一次 */
  const scheduleMove = (layer: PreviewLayer, position: DragPoint) => {
    // 没有 rAF 的环境（老浏览器/jsdom）直接同步回写，别把位移吞掉
    if (typeof requestAnimationFrame !== "function") {
      onLayerMove?.(layer, position);
      return;
    }
    pendingMoveRef.current = { layer, position };
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingMoveRef.current;
      pendingMoveRef.current = null;
      if (pending) onLayerMove?.(pending.layer, pending.position);
    });
  };

  /** 结束当前拖拽（不改记录），返回是否真的拖动过 */
  const endDrag = (): DragSession | null => {
    const session = dragRef.current;
    dragRef.current = null;
    if (!session) return null;
    try {
      containerRef.current?.releasePointerCapture?.(session.pointerId);
    } catch {
      /* 指针早就没了，忽略 */
    }
    return session;
  };

  // 拖动中按 Esc 取消：还原到起点
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const session = dragRef.current;
      if (!session || !session.moved) return;
      event.preventDefault();
      pendingMoveRef.current = null;
      endDrag();
      onLayerDragCancel?.(session.layer);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLayerDragCancel]);

  // 卸载时清掉挂起的帧，避免对已卸载组件回写
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      pendingMoveRef.current = null;
    },
    [],
  );

  /**
   * 处理一次"点击某个坐标"：
   * 有命中 → 按循环规则选一个；没命中（空白）→ 取消选中。
   */
  const handleClick = (
    event: React.MouseEvent<HTMLDivElement>,
    topmostKey?: string,
  ) => {
    // 刚拖完：这一次 click 是 pointerup 顺带产生的，忽略
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    const point = toFramePoint(event, containerRef.current, frame);
    if (!point) {
      // 量不到舞台尺寸（极端情况）：退化成"选中最上层"，至少不会点空
      const fallback =
        layers.find((layer) => layer.key === topmostKey) ??
        [...layers].sort((a, b) => b.z - a.z)[0];
      cycleRef.current = null;
      if (fallback) onSelect(fallback);
      else onClear?.();
      return;
    }

    const { layer, state } = resolveCycledHit(layers, point, cycleRef.current);
    cycleRef.current = state;
    if (layer) onSelect(layer);
    else onClear?.();
  };

  /* ===================== 拖拽 ===================== */

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // isPrimary 在部分环境（jsdom / 老浏览器）是 undefined，只有明确为 false 才忽略
    if (!dragEnabled || event.button !== 0 || event.isPrimary === false) return;
    const point = toFramePoint(event, containerRef.current, frame);
    if (!point) return;

    // 拖"当前选中的那一层"（若它压在这点上），否则拖最上层
    const stack = layersAt(layers, point);
    if (stack.length === 0) return;
    const target = stack.find((layer) => layer.key === selectedKey) ?? stack[0];
    if (!isDraggableLayer(target.kind)) return;

    const startPosition = getLayerPosition?.(target);
    if (!startPosition) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPosition,
      layer: target,
      moved: false,
    };
    try {
      containerRef.current?.setPointerCapture?.(event.pointerId);
    } catch {
      /* jsdom / 不支持捕获时退化成普通冒泡事件 */
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    if (!session) return;

    const cssDelta = {
      x: event.clientX - session.startClient.x,
      y: event.clientY - session.startClient.y,
    };

    if (!session.moved) {
      if (Math.hypot(cssDelta.x, cssDelta.y) < DRAG_THRESHOLD_PX) return;
      session.moved = true;
      // 拖动即选中：属性面板同步切到对应页签、数值跟着动
      onSelect(session.layer);
      onLayerDragStart?.(session.layer, session.startPosition);
    }

    const rect = containerRef.current?.getBoundingClientRect();
    let worldDelta = worldDeltaFromStage(
      cssDelta,
      { width: rect?.width ?? 0, height: rect?.height ?? 0 },
      cameraZoom,
    );
    if (event.shiftKey) worldDelta = lockAxis(worldDelta);

    scheduleMove(session.layer, {
      x: session.startPosition.x + worldDelta.x,
      y: session.startPosition.y + worldDelta.y,
    });
  };

  const handlePointerUp = () => {
    const session = endDrag();
    if (!session || !session.moved) return;
    flushMove();
    // 松手后浏览器还会补一个 click，吃掉它，避免触发循环下钻
    suppressClickRef.current = true;
    onLayerDragEnd?.(session.layer);
  };

  const handlePointerCancel = () => {
    const session = endDrag();
    if (!session || !session.moved) return;
    pendingMoveRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    onLayerDragCancel?.(session.layer);
  };

  if (frame.width <= 0 || frame.height <= 0) return null;

  // 按 z 升序渲染：DOM 顺序 = 绘制顺序，后渲染的在上层
  const ordered = [...layers].sort((a, b) => a.z - b.z);

  return (
    <div
      ref={containerRef}
      className={`preview-hit-layer${dragEnabled ? " draggable" : ""}`}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {ordered.map((layer) => (
        <button
          key={layer.key}
          type="button"
          className={`preview-hit kind-${layer.kind}${
            selectedKey === layer.key ? " selected" : ""
          }`}
          style={{
            left: percent(layer.outRect.x, frame.width),
            top: percent(layer.outRect.y, frame.height),
            width: percent(layer.outRect.w, frame.width),
            height: percent(layer.outRect.h, frame.height),
            zIndex: layer.z,
          }}
          aria-label={layer.label}
          aria-pressed={selectedKey === layer.key}
          title={`${layer.label}（点击编辑）`}
          onClick={(event) => {
            // 键盘触发（Enter/Space）的 click 没有坐标（detail === 0）：
            // 直接选中这个按钮对应的元素，不参与循环下钻。
            if (event.detail === 0) {
              event.stopPropagation();
              cycleRef.current = null;
              onSelect(layer);
              return;
            }
            // 鼠标点击：交给外层的 handleClick 统一判定（它才知道完整命中集合）
          }}
        />
      ))}
    </div>
  );
};

export default PreviewHitLayer;
