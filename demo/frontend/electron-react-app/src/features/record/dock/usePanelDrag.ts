/**
 * @module 面板停靠 —— 拖拽会话
 *
 * <p>不用 HTML5 拖放，而是 pointer 事件 + 4px 阈值：
 * 页签既能点击切换，也能按住拖走；一旦越过阈值就进入"拖拽模式"，
 * 在 window 上监听 move/up，拖到窗口边缘甚至外面也不会断。
 *
 * <p>Esc / pointercancel / 窗口失焦都会取消本次拖拽——因为布局只在松手时才修改，
 * 取消不需要"还原"，只要不再提交即可。
 *
 * <p>拖到目标上时指示器**延迟 90ms** 出现（{@link DOCK_HOVER_DELAY_MS}）：
 * 快速掠过几个面板时不会一路闪，停住才确认要停靠。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DockTarget, DropZone, PanelId, Point, Rect, ResolvedDrop } from "./dockTypes";
import { DOCK_HOVER_DELAY_MS } from "./dockGeometry";

/** 超过这个位移才当成拖动而不是点击 */
export const DRAG_THRESHOLD_PX = 4;

/** 拖动期间挂在 body 上的 class：统一光标、禁止选中 */
const DRAG_BODY_CLASS = "dock-panel-dragging";

/** 页面里跟随指针的拖拽预览（组件层据此画 ghost 与停靠指示器） */
export interface PanelDragView {
  panelId: PanelId;
  /** 指针位置（停靠表面坐标系） */
  point: Point;
  target: DockTarget | null;
  indicator: Rect | null;
  zone: DropZone | null;
  /** 指针在停靠区与所有独立窗口之外：松手会变成独立窗口 */
  outside: boolean;
  active: boolean;
}

export interface StartPanelDragArgs {
  panelId: PanelId;
  /** 用原生事件的最小子集，方便单测直接构造 */
  event: {
    pointerId: number;
    clientX: number;
    clientY: number;
    button?: number;
  };
  /** 停靠表面元素（换算坐标 + 判断是否在停靠区内） */
  surfaceElement: HTMLElement | null;
  /** 解析当前指针下的落点（由 DockLayout 用注册的面板组矩形算） */
  resolve: (point: Point, panelId: PanelId) => ResolvedDrop;
  /** 松手：只有真正拖动过才会调用 */
  onDrop: (panelId: PanelId, resolved: ResolvedDrop, point: Point) => void;
}

interface DragSession {
  panelId: PanelId;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  surfaceRect: DOMRect;
  active: boolean;
  latestPoint: Point;
  latestResolved: ResolvedDrop;
  resolve: (point: Point, panelId: PanelId) => ResolvedDrop;
  onDrop: (panelId: PanelId, resolved: ResolvedDrop, point: Point) => void;
}

export interface UsePanelDragResult {
  drag: PanelDragView | null;
  startDrag: (args: StartPanelDragArgs) => void;
  isDragging: boolean;
  /** 页签的 onClick 先问一句：刚拖完的那一下点击要吞掉（只吞被拖的那个页签） */
  consumeClickSuppression: (panelId?: PanelId) => boolean;
}

function dropTargetKey(resolved: ResolvedDrop): string {
  if (resolved.outside) return "outside";
  if (!resolved.target) return "none";
  const target = resolved.target;
  return `${target.containerId}|${target.nodeId ?? ""}|${target.zone}`;
}

export function usePanelDrag(): UsePanelDragResult {
  const [drag, setDrag] = useState<PanelDragView | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef<PanelId | null>(null);
  const indicatorTimerRef = useRef<number | null>(null);
  const indicatorKeyRef = useRef<string | null>(null);
  const suppressResetRef = useRef<number | null>(null);

  const consumeClickSuppression = useCallback((panelId?: PanelId) => {
    const suppressed = suppressClickRef.current;
    if (!suppressed) return false;
    if (panelId && suppressed !== panelId) return false;
    suppressClickRef.current = null;
    return true;
  }, []);

  const startDrag = useCallback((args: StartPanelDragArgs) => {
    if (args.event.button !== undefined && args.event.button !== 0) return;
    const surface = args.surfaceElement;
    if (!surface) return;
    if (sessionRef.current?.active) return;

    // 上一次会话可能还挂着（正常不会），先清干净
    cleanupRef.current?.();

    const surfaceRect = surface.getBoundingClientRect();
    const startPoint: Point = {
      x: args.event.clientX - surfaceRect.left,
      y: args.event.clientY - surfaceRect.top,
    };

    const initialResolved: ResolvedDrop = {
      target: null,
      indicator: null,
      outside: false,
      zone: null,
    };

    const session: DragSession = {
      panelId: args.panelId,
      pointerId: args.event.pointerId,
      startClientX: args.event.clientX,
      startClientY: args.event.clientY,
      surfaceRect,
      active: false,
      latestPoint: startPoint,
      latestResolved: initialResolved,
      resolve: args.resolve,
      onDrop: args.onDrop,
    };
    sessionRef.current = session;

    const clearIndicatorTimer = () => {
      if (indicatorTimerRef.current !== null) {
        window.clearTimeout(indicatorTimerRef.current);
        indicatorTimerRef.current = null;
      }
    };

    const pasteResolved = (resolved: ResolvedDrop) => {
      setDrag((previous) =>
        previous
          ? {
              ...previous,
              target: resolved.target,
              indicator: resolved.indicator,
              zone: resolved.zone,
              outside: resolved.outside,
            }
          : previous,
      );
    };

    const showResolved = (resolved: ResolvedDrop) => {
      pasteResolved(resolved);
      indicatorKeyRef.current = dropTargetKey(resolved);
    };

    /**
     * 落点变化时清理旧指示器，新的在 90ms 后出现。
     * outside 不走延迟：ghost 上的"松开 → 独立窗口"要立刻反馈。
     */
    const updateIndicator = (resolved: ResolvedDrop) => {
      const key = dropTargetKey(resolved);
      if (key === indicatorKeyRef.current) return;

      clearIndicatorTimer();
      indicatorKeyRef.current = key;

      if (key === "outside" || key === "none") {
        showResolved(resolved);
        return;
      }

      // 先只把指示器清掉，指针一停再显示新的
      pasteResolved({
        ...resolved,
        target: null,
        indicator: null,
        zone: null,
      });

      indicatorTimerRef.current = window.setTimeout(() => {
        indicatorTimerRef.current = null;
        const current = sessionRef.current;
        if (!current?.active) return;
        const latest = current.latestResolved;
        if (dropTargetKey(latest) !== indicatorKeyRef.current) return;
        pasteResolved(latest);
      }, DOCK_HOVER_DELAY_MS);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const current = sessionRef.current;
      if (!current || event.pointerId !== current.pointerId) return;

      if (!current.active) {
        const distance = Math.sqrt(
          (event.clientX - current.startClientX) ** 2 +
            (event.clientY - current.startClientY) ** 2,
        );
        if (distance < DRAG_THRESHOLD_PX) return;

        current.active = true;
        try {
          document.body.classList.add(DRAG_BODY_CLASS);
        } catch {
          // jsdom / 非浏览器环境忽略
        }
        setDrag({
          panelId: current.panelId,
          point: current.latestPoint,
          target: null,
          indicator: null,
          zone: null,
          outside: false,
          active: true,
        });
      }

      try {
        event.preventDefault();
      } catch {
        // 被动监听等场景忽略
      }

      const point: Point = {
        x: event.clientX - current.surfaceRect.left,
        y: event.clientY - current.surfaceRect.top,
      };
      current.latestPoint = point;
      const resolved = current.resolve(point, current.panelId);
      current.latestResolved = resolved;

      updateIndicator(resolved);
      setDrag((previous) => (previous ? { ...previous, point } : previous));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = sessionRef.current;
      if (!current || event.pointerId !== current.pointerId) return;

      if (current.active) {
        const point: Point = {
          x: event.clientX - current.surfaceRect.left,
          y: event.clientY - current.surfaceRect.top,
        };
        // 松手位置可能没有再触发 move：这里重新解析一次
        const resolved = current.resolve(point, current.panelId);
        current.latestPoint = point;
        current.latestResolved = resolved;

        current.onDrop(current.panelId, resolved, point);

        // 拖拽结束后浏览器还会补一个 click，页签的 onClick 要忽略它
        suppressClickRef.current = current.panelId;
        if (suppressResetRef.current !== null) {
          window.clearTimeout(suppressResetRef.current);
        }
        suppressResetRef.current = window.setTimeout(() => {
          suppressResetRef.current = null;
          suppressClickRef.current = null;
        }, 0);
      }

      cleanupRef.current?.();
    };

    const handlePointerCancel = () => {
      cleanupRef.current?.();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();

      const current = sessionRef.current;
      const wasActive = current?.active === true;
      const draggedPanel = current?.panelId ?? null;
      cleanupRef.current?.();

      // 拖到一半按 Esc：若松手时仍落在页签上，不应把页签点开
      if (wasActive) {
        suppressClickRef.current = draggedPanel;
        const reset = () => {
          window.setTimeout(() => {
            suppressClickRef.current = null;
          }, 0);
        };
        window.addEventListener("pointerup", reset, { once: true, capture: true });
      }
    };

    const handleBlur = () => {
      cleanupRef.current?.();
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", handleBlur);
      clearIndicatorTimer();
      indicatorKeyRef.current = null;
      sessionRef.current = null;
      setDrag(null);
      try {
        document.body.classList.remove(DRAG_BODY_CLASS);
      } catch {
        // 忽略
      }
    };

    cleanupRef.current = cleanup;

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("blur", handleBlur);
  }, []);

  // 组件卸载（切页面）时收拾干净，避免 window 上留监听
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      if (suppressResetRef.current !== null) {
        window.clearTimeout(suppressResetRef.current);
      }
    };
  }, []);

  return {
    drag,
    startDrag,
    isDragging: drag !== null,
    consumeClickSuppression,
  };
}
