/**
 * @module 面板停靠 —— 布局渲染
 *
 * <p>「剧情编辑」的三块区域（预览 / 属性 / 剧情记录）现在都是可停靠面板：
 * <ul>
 *   <li>按住页签拖动：拖到另一块的上/下/左/右 = 分割停靠，中部 = 合并成页签；</li>
 *   <li>拖到停靠区外松手 = 变成可移动、可缩放的独立窗口（可再停靠回来）；</li>
 *   <li>布局自动存 localStorage，下次打开原样恢复；Esc 取消拖拽；</li>
 *   <li>三块面板的内容**始终挂载**，只改位置/显隐，所以停靠不会丢滚动位置与内部状态。</li>
 * </ul>
 *
 * <p>渲染分两层：几何层（页签组外壳、分割线、独立窗口）按 `computeLayout` 的像素矩形
 * 绝对定位；内容层把每个面板挂在自己的 host 里，host 也绝对定位到"当前所在组的正文区"。
 * 两层分开是为了让面板在停靠/合并时**不换 React 父节点**（不重新挂载）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./DockLayout.css";
import {
  DOCK_CONTAINER_ID,
  DockState,
  FloatingWindowState,
  GROUP_HEADER_HEIGHT,
  PANEL_IDS,
  PANEL_MIN_SIZE,
  PanelId,
  Point,
  Rect,
  ResolvedDrop,
  Size,
  TabNode,
} from "./dockTypes";
import {
  GroupHit,
  ResizeDirection,
  SplitterGeometry,
  clampWindowRect,
  computeLayout,
  contentRectOf,
  resizeWindowRect,
  resolveDropTarget,
  zoneLabel,
} from "./dockGeometry";
import { findPanelTabNode, findSplitNode, splitPairSizes } from "./dockTree";
import { locatePanel } from "./dockState";
import { useDockLayout } from "./useDockLayout";
import { usePanelDrag } from "./usePanelDrag";
import { useElementSize } from "../preview/useElementSize";

/* ===================== 对外类型 ===================== */

/** 一个可停靠面板：标题/图标给标题栏与「面板」菜单用，内容始终挂载 */
export interface DockPanelDefinition {
  id: PanelId;
  title: string;
  icon: string;
  content: React.ReactNode;
}

export interface DockLayoutProps {
  panels: DockPanelDefinition[];
  /** 持久化键；不传用默认键（测试可传独立键避免相互影响） */
  storageKey?: string;
  /** 操作提示（隐藏/拖出/重置时给用户一句话反馈） */
  onNotice?: (message: string) => void;
}

type PanelMap = Partial<Record<PanelId, DockPanelDefinition>>;

/* ===================== 内部类型 ===================== */

interface GroupRegistration {
  nodeId: string;
  containerId: string;
  panels: PanelId[];
  /** 用来量取命中矩形（页签组外壳 / 独立窗口外壳） */
  element: HTMLElement;
}

type RegisterGroup = (registration: GroupRegistration) => () => void;

interface PanelHostInfo {
  rect: Rect;
  zIndex: number;
  visible: boolean;
}

interface WindowLayout {
  floating: FloatingWindowState;
  rect: Rect;
}

interface DockTabsProps {
  node: TabNode;
  panelMap: PanelMap;
  onActivate: (panelId: PanelId) => void;
  onStartDrag: (panelId: PanelId, event: React.PointerEvent) => void;
  consumeClickSuppression: (panelId?: PanelId) => boolean;
}

const RESIZE_DIRECTIONS: ResizeDirection[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
];

/* ===================== 页签 ===================== */

/**
 * 页签栏：既是"切页签"的控件，也是面板的标题栏（页签里的 ⠿ 就是拖拽手柄）。
 * 按住页签拖动 = 停靠/拖出；不拖动时点击 = 切页签。
 */
const DockTabs: React.FC<DockTabsProps> = ({
  node,
  panelMap,
  onActivate,
  onStartDrag,
  consumeClickSuppression,
}) => (
  <div className="dock-tabs" role="tablist" aria-label="面板页签">
    {node.panels.map((panelId) => {
      const panel = panelMap[panelId];
      const title = panel?.title ?? panelId;
      const icon = panel?.icon ?? "▢";
      const active = node.activePanel === panelId;

      return (
        <button
          key={panelId}
          type="button"
          role="tab"
          title={`${title}：拖动可停靠 / 拖出成独立窗口`}
          aria-selected={active}
          aria-controls={`dock-panel-${panelId}`}
          className={`dock-tab${active ? " active" : ""}`}
          data-dock-tab={panelId}
          onPointerDown={(event) => onStartDrag(panelId, event)}
          onClick={() => {
            if (consumeClickSuppression(panelId)) return;
            onActivate(panelId);
          }}
        >
          <span className="dock-tab-grip" aria-hidden="true">
            ⠿
          </span>
          <span className="dock-tab-icon" aria-hidden="true">
            {icon}
          </span>
          <span className="dock-tab-title">{title}</span>
        </button>
      );
    })}
  </div>
);

/* ===================== 主区域页签组 ===================== */

interface DockGroupChromeProps {
  containerId: string;
  node: TabNode;
  rect: Rect;
  panelMap: PanelMap;
  /** 当前页签组处于最大化（铺满主区域） */
  maximized: boolean;
  registerGroup: RegisterGroup;
  onActivate: (panelId: PanelId) => void;
  onStartDrag: (panelId: PanelId, event: React.PointerEvent) => void;
  consumeClickSuppression: (panelId?: PanelId) => boolean;
  onToggleMaximize: (panelId: PanelId) => void;
  onFloat: (panelId: PanelId) => void;
  onHide: (panelId: PanelId) => void;
}

const DockGroupChrome: React.FC<DockGroupChromeProps> = ({
  containerId,
  node,
  rect,
  panelMap,
  maximized,
  registerGroup,
  onActivate,
  onStartDrag,
  consumeClickSuppression,
  onToggleMaximize,
  onFloat,
  onHide,
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const panels = node.panels;
  const activePanel = node.activePanel;
  const activeTitle = panelMap[activePanel]?.title ?? activePanel;

  /** 标题栏空白处也能拖（沿用当前页签的面板），按钮/页签有自己的手势 */
  const handleHeaderPointerDown = (event: React.PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-dock-tab]")) return;
    if (target?.closest("button")) return;
    onStartDrag(activePanel, event);
  };

  // 注册命中矩形：拖拽时按真实 DOM 矩形判断"落在哪个组"
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    return registerGroup({ nodeId: node.id, containerId, panels, element });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerGroup, node.id, containerId, panels]);

  return (
    <div
      ref={frameRef}
      className="dock-group"
      data-dock-node-id={node.id}
      data-dock-container-id={containerId}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: 2,
      }}
    >
      <div className="dock-group-frame" aria-hidden="true" />
      <div
        className="dock-group-header"
        style={{ height: GROUP_HEADER_HEIGHT }}
        onPointerDown={handleHeaderPointerDown}
      >
        <DockTabs
          node={node}
          panelMap={panelMap}
          onActivate={onActivate}
          onStartDrag={onStartDrag}
          consumeClickSuppression={consumeClickSuppression}
        />
        <div className="dock-group-actions">
          <button
            type="button"
            className="dock-action"
            title={maximized ? "还原面板" : "最大化面板"}
            aria-label={maximized ? "还原面板" : "最大化面板"}
            onClick={() => onToggleMaximize(activePanel)}
          >
            {maximized ? "⤡" : "⤢"}
          </button>
          <button
            type="button"
            className="dock-action"
            title={`把「${activeTitle}」拖出成独立窗口`}
            aria-label={`把「${activeTitle}」拖出成独立窗口`}
            onClick={() => onFloat(activePanel)}
          >
            ⧉
          </button>
          <button
            type="button"
            className="dock-action"
            title={`隐藏「${activeTitle}」（可在「面板」菜单恢复）`}
            aria-label={`隐藏「${activeTitle}」`}
            onClick={() => onHide(activePanel)}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};

/* ===================== 独立窗口 ===================== */

interface FloatingPanelWindowProps {
  floating: FloatingWindowState;
  rect: Rect;
  panelMap: PanelMap;
  surface: Size;
  registerGroup: RegisterGroup;
  onActivate: (panelId: PanelId) => void;
  onStartDrag: (panelId: PanelId, event: React.PointerEvent) => void;
  consumeClickSuppression: (panelId?: PanelId) => boolean;
  onRaise: (windowId: string) => void;
  onMove: (windowId: string, x: number, y: number) => void;
  onResize: (windowId: string, rect: Rect) => void;
  onDock: (windowId: string) => void;
  onClose: (windowId: string) => void;
}

/**
 * 独立面板窗口：拖标题栏/左侧手柄移动、拖边角缩放；页签仍然可以再拖回主区域。
 * 窗口内部固定只有一个页签组（拖别的面板到窗口上 = 合并成页签）。
 */
const FloatingPanelWindow: React.FC<FloatingPanelWindowProps> = ({
  floating,
  rect,
  panelMap,
  surface,
  registerGroup,
  onActivate,
  onStartDrag,
  consumeClickSuppression,
  onRaise,
  onMove,
  onResize,
  onDock,
  onClose,
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const panels = floating.node.panels;
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    return registerGroup({
      nodeId: floating.node.id,
      containerId: floating.id,
      panels,
      element,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerGroup, floating.id, floating.node.id, panels]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  /** 开始拖窗口/缩窗口：松手结束；Esc 还原到起点 */
  const beginSession = (
    mode: "move" | "resize",
    event: React.PointerEvent,
    direction?: ResizeDirection,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onRaise(floating.id);

    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = rect;

    const handleMove = (nativeEvent: PointerEvent) => {
      const dx = nativeEvent.clientX - startX;
      const dy = nativeEvent.clientY - startY;

      if (mode === "move") {
        const nextX = Math.min(
          Math.max(startRect.x + dx, 0),
          Math.max(surface.width - startRect.width, 0),
        );
        const nextY = Math.min(
          Math.max(startRect.y + dy, 0),
          Math.max(surface.height - startRect.height, 0),
        );
        onMove(floating.id, nextX, nextY);
        return;
      }

      if (direction) {
        onResize(
          floating.id,
          resizeWindowRect(startRect, direction, dx, dy, surface),
        );
      }
    };

    function cleanup() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("keydown", handleKey, true);
      cleanupRef.current = null;
      try {
        document.body.classList.remove("dock-window-moving");
      } catch {
        // 忽略
      }
    }

    function handleUp() {
      cleanup();
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (mode === "move") {
        onMove(floating.id, startRect.x, startRect.y);
      } else {
        onResize(floating.id, startRect);
      }
      cleanup();
    }

    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("keydown", handleKey, true);
    try {
      document.body.classList.add("dock-window-moving");
    } catch {
      // 忽略
    }
  };

  const handleHeaderPointerDown = (event: React.PointerEvent) => {
    const target = event.target as HTMLElement | null;
    // 页签 / 按钮有自己的手势，不要顺带把窗口拖走
    if (target?.closest("[data-dock-tab]")) return;
    if (target?.closest("button")) return;
    beginSession("move", event);
  };

  return (
    <div
      ref={frameRef}
      className="dock-float"
      data-dock-window-id={floating.id}
      data-dock-node-id={floating.node.id}
      data-dock-container-id={floating.id}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: 10 + floating.z * 2,
      }}
    >
      <div
        className="dock-float-header"
        style={{ height: GROUP_HEADER_HEIGHT }}
        onPointerDown={handleHeaderPointerDown}
      >
        <span className="dock-float-grip" title="拖动窗口" aria-hidden="true">
          ⠿
        </span>
        <DockTabs
          node={floating.node}
          panelMap={panelMap}
          onActivate={onActivate}
          onStartDrag={onStartDrag}
          consumeClickSuppression={consumeClickSuppression}
        />
        <div className="dock-float-actions">
          <button
            type="button"
            className="dock-action"
            title="停靠回主区域"
            aria-label="停靠回主区域"
            onClick={() => onDock(floating.id)}
          >
            ⤓
          </button>
          <button
            type="button"
            className="dock-action"
            title="关闭窗口（面板收进「面板」菜单，可随时恢复）"
            aria-label="关闭独立窗口"
            onClick={() => onClose(floating.id)}
          >
            ✕
          </button>
        </div>
      </div>

      {RESIZE_DIRECTIONS.map((direction) => (
        <div
          key={direction}
          className={`dock-resize-handle ${direction}`}
          data-resize-direction={direction}
          onPointerDown={(event) => beginSession("resize", event, direction)}
        />
      ))}
    </div>
  );
};

/* ===================== 工具条 ===================== */

interface DockToolbarProps {
  state: DockState;
  panelMap: PanelMap;
  hiddenPanels: PanelId[];
  onActivate: (panelId: PanelId) => void;
  onShow: (panelId: PanelId) => void;
  onReset: () => void;
}

const DockToolbar: React.FC<DockToolbarProps> = ({
  state,
  panelMap,
  hiddenPanels,
  onActivate,
  onShow,
  onReset,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="dock-toolbar">
      <span className="dock-toolbar-title">
        <span aria-hidden="true">▦</span> 面板布局
      </span>

      <div className="dock-toolbar-menu-wrap" ref={wrapRef}>
        <button
          type="button"
          className={`dock-toolbar-btn${open ? " active" : ""}`}
          aria-haspopup="menu"
          aria-expanded={open}
          title="查看/恢复面板"
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">🧩</span> 面板
          {hiddenPanels.length > 0 && (
            <span
              className="dock-badge"
              aria-label={`${hiddenPanels.length} 个隐藏面板`}
            >
              {hiddenPanels.length}
            </span>
          )}
        </button>

        {open && (
          <div className="dock-panel-menu" role="menu">
            {PANEL_IDS.map((panelId) => {
              const placement = locatePanel(state, panelId);
              const panel = panelMap[panelId];
              const status =
                placement.kind === "docked"
                  ? "停靠中"
                  : placement.kind === "floating"
                    ? "独立窗口"
                    : "已隐藏";
              return (
                <button
                  key={panelId}
                  type="button"
                  role="menuitem"
                  className="dock-panel-menu-item"
                  onClick={() => {
                    setOpen(false);
                    if (placement.kind === "hidden") onShow(panelId);
                    else onActivate(panelId);
                  }}
                >
                  <span className="dock-menu-icon" aria-hidden="true">
                    {panel?.icon ?? "▢"}
                  </span>
                  <span className="dock-menu-label">
                    {panel?.title ?? panelId}
                  </span>
                  <span className={`dock-menu-status ${placement.kind}`}>
                    {status}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        className="dock-toolbar-btn"
        title="恢复三块区域的默认布局"
        onClick={onReset}
      >
        <span aria-hidden="true">↺</span> 重置布局
      </button>

      <span className="dock-toolbar-hint">
        拖动页签：停靠 / 合并 · 拖出：独立窗口 · Esc 取消
      </span>
    </div>
  );
};

/* ===================== 空状态 ===================== */

interface DockEmptyStateProps {
  hiddenPanels: PanelId[];
  windowCount: number;
  panelMap: PanelMap;
  onShow: (panelId: PanelId) => void;
  onDockAllWindows: () => void;
  onReset: () => void;
}

const DockEmptyState: React.FC<DockEmptyStateProps> = ({
  hiddenPanels,
  windowCount,
  panelMap,
  onShow,
  onDockAllWindows,
  onReset,
}) => (
  <div className="dock-empty-state">
    <div className="dock-empty-icon" aria-hidden="true">
      🧩
    </div>
    <p className="dock-empty-title">主编辑区暂时没有面板</p>
    <p className="dock-empty-desc">
      面板可能被拖出成了独立窗口，或收进了「面板」菜单。内容都还在，随时可以放回来。
    </p>
    <div className="dock-empty-actions">
      {hiddenPanels.map((panelId) => (
        <button
          key={panelId}
          type="button"
          className="dock-empty-btn primary"
          onClick={() => onShow(panelId)}
        >
          恢复「{panelMap[panelId]?.title ?? panelId}」
        </button>
      ))}
      {windowCount > 0 && (
        <button
          type="button"
          className="dock-empty-btn"
          onClick={onDockAllWindows}
        >
          停靠全部 {windowCount} 个窗口
        </button>
      )}
      <button type="button" className="dock-empty-btn" onClick={onReset}>
        恢复默认布局
      </button>
    </div>
  </div>
);

/* ===================== 主组件 ===================== */

const DockLayout: React.FC<DockLayoutProps> = ({
  panels,
  storageKey,
  onNotice,
}) => {
  const { state, hiddenPanels, actions } = useDockLayout(storageKey);
  const { ref: surfaceRef, size: surfaceSize } = useElementSize<HTMLDivElement>();
  const { drag, startDrag, consumeClickSuppression } = usePanelDrag();

  const registryRef = useRef(new Map<string, GroupRegistration>());
  const splitterCleanupRef = useRef<(() => void) | null>(null);
  /**
   * 隐藏面板最后一次的正文矩形。
   *
   * <p>面板被隐藏/切到别的页签时不再有几何位置，但内容仍要按原尺寸排版：
   * 用 `visibility: hidden` 而不是 `display: none`，滚动位置与内部布局不会被浏览器清掉
   * （需求里的"布局变更后尽量保留滚动位置"）。
   */
  const lastHostRectsRef = useRef(new Map<PanelId, Rect>());

  const registerGroup = useCallback<RegisterGroup>((registration) => {
    const key = `${registration.containerId}:${registration.nodeId}`;
    registryRef.current.set(key, registration);
    return () => {
      if (registryRef.current.get(key) === registration) {
        registryRef.current.delete(key);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      splitterCleanupRef.current?.();
    };
  }, []);

  const panelMap = useMemo<PanelMap>(() => {
    const map: PanelMap = {};
    panels.forEach((panel) => {
      map[panel.id] = panel;
    });
    return map;
  }, [panels]);

  const notify = useCallback((message: string) => onNotice?.(message), [onNotice]);

  const titleOf = useCallback(
    (panelId: PanelId) => panelMap[panelId]?.title ?? panelId,
    [panelMap],
  );

  const dockRect = useMemo<Rect>(
    () => ({
      x: 0,
      y: 0,
      width: surfaceSize.width,
      height: surfaceSize.height,
    }),
    [surfaceSize.width, surfaceSize.height],
  );

  const dockGeometry = useMemo(
    () =>
      computeLayout(
        state.dockRoot,
        DOCK_CONTAINER_ID,
        dockRect,
        state.maximized,
      ),
    [state.dockRoot, state.maximized, dockRect],
  );

  const windowLayouts = useMemo<WindowLayout[]>(
    () =>
      state.windows.map((floating) => ({
        floating,
        rect: clampWindowRect(
          {
            x: floating.x,
            y: floating.y,
            width: floating.width,
            height: floating.height,
          },
          surfaceSize,
        ),
      })),
    [state.windows, surfaceSize],
  );

  /* ---------- 拖放：解析落点 ---------- */

  const resolveDrop = useCallback(
    (point: Point, draggedPanel: PanelId): ResolvedDrop => {
      const surface = surfaceRef.current;
      if (!surface) {
        return { target: null, indicator: null, outside: true, zone: null };
      }

      const surfaceRect = surface.getBoundingClientRect();
      const surfaceSizeNow: Size = {
        width: surfaceRect.width,
        height: surfaceRect.height,
      };

      const groups: GroupHit[] = [];
      registryRef.current.forEach((registration) => {
        const element = registration.element;
        if (!element.isConnected) return;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        groups.push({
          nodeId: registration.nodeId,
          containerId: registration.containerId,
          panels: registration.panels,
          rect: {
            x: rect.left - surfaceRect.left,
            y: rect.top - surfaceRect.top,
            width: rect.width,
            height: rect.height,
          },
        });
      });

      const windows = state.windows.map((floating) => ({
        containerId: floating.id,
        rect: clampWindowRect(
          {
            x: floating.x,
            y: floating.y,
            width: floating.width,
            height: floating.height,
          },
          surfaceSizeNow,
        ),
        z: floating.z,
      }));

      return resolveDropTarget({
        point,
        dockRect: {
          x: 0,
          y: 0,
          width: surfaceRect.width,
          height: surfaceRect.height,
        },
        groups,
        windows,
        draggingPanel: draggedPanel,
      });
    },
    [state.windows, surfaceRef],
  );

  /* ---------- 拖放：松手落地 ---------- */

  const handleDrop = useCallback(
    (panelId: PanelId, resolved: ResolvedDrop, point: Point) => {
      if (resolved.target) {
        actions.dock(panelId, resolved.target);
        return;
      }
      if (!resolved.outside) return;

      const surface = surfaceRef.current;
      const surfaceRect = surface?.getBoundingClientRect();
      const surfaceSizeNow: Size = surfaceRect
        ? { width: surfaceRect.width, height: surfaceRect.height }
        : surfaceSize;

      // 沿用拖出前的面板大小（找不到时按最小尺寸放大一点）
      let sourceSize: Size = {
        width: PANEL_MIN_SIZE[panelId].width + 240,
        height: PANEL_MIN_SIZE[panelId].height + 160,
      };
      registryRef.current.forEach((registration) => {
        if (!registration.panels.includes(panelId)) return;
        const rect = registration.element.getBoundingClientRect();
        const content = contentRectOf({
          x: 0,
          y: 0,
          width: rect.width,
          height: rect.height,
        });
        if (content.width > 0 && content.height > 0) {
          sourceSize = {
            width: Math.min(Math.max(content.width, 360), 760),
            height: Math.min(Math.max(content.height, 260), 560),
          };
        }
      });

      actions.detach(panelId, sourceSize, point, surfaceSizeNow);
      notify(`「${titleOf(panelId)}」已拖出为独立窗口`);
    },
    [actions, notify, surfaceRef, surfaceSize, titleOf],
  );

  const handleTabDragStart = useCallback(
    (panelId: PanelId, event: React.PointerEvent) => {
      startDrag({
        panelId,
        event: event.nativeEvent,
        surfaceElement: surfaceRef.current,
        resolve: resolveDrop,
        onDrop: handleDrop,
      });
    },
    [startDrag, resolveDrop, handleDrop, surfaceRef],
  );

  /* ---------- 页签 / 面板操作 ---------- */

  const handleActivateTab = useCallback(
    (nodeId: string, panelId: PanelId) => {
      actions.setActiveTab(nodeId, panelId);
      // 最大化时在同一组里换页签：最大化目标跟着换，保持铺满
      if (state.maximized && state.maximized !== panelId) {
        const maximizedTab = findPanelTabNode(state.dockRoot, state.maximized);
        if (maximizedTab?.id === nodeId) actions.toggleMaximize(panelId);
      }
    },
    [actions, state.maximized, state.dockRoot],
  );

  const handleActivatePanel = useCallback(
    (panelId: PanelId) => actions.activate(panelId),
    [actions],
  );

  const handleToggleMaximize = useCallback(
    (panelId: PanelId) => {
      actions.toggleMaximize(state.maximized ?? panelId);
    },
    [actions, state.maximized],
  );

  const handleHidePanel = useCallback(
    (panelId: PanelId) => {
      actions.hide(panelId);
      notify(`已隐藏「${titleOf(panelId)}」，可在「面板」菜单恢复`);
    },
    [actions, notify, titleOf],
  );

  const handleFloatPanel = useCallback(
    (panelId: PanelId) => {
      const surface = surfaceRef.current;
      const rect = surface?.getBoundingClientRect();
      const size: Size = rect
        ? { width: rect.width, height: rect.height }
        : surfaceSize;
      actions.detach(
        panelId,
        {
          width: Math.max(520, PANEL_MIN_SIZE[panelId].width + 220),
          height: Math.max(380, PANEL_MIN_SIZE[panelId].height + 180),
        },
        null,
        size,
      );
      notify(`「${titleOf(panelId)}」已弹出为独立窗口`);
    },
    [actions, notify, surfaceRef, surfaceSize, titleOf],
  );

  const handleShowPanel = useCallback(
    (panelId: PanelId) => {
      actions.show(panelId);
      notify(`已恢复「${titleOf(panelId)}」`);
    },
    [actions, notify, titleOf],
  );

  const handleReset = useCallback(() => {
    actions.reset();
    notify("已恢复默认面板布局");
  }, [actions, notify]);

  const handleDockWindow = useCallback(
    (windowId: string) => {
      actions.dockWindow(windowId);
      notify("独立窗口已停靠回主区域");
    },
    [actions, notify],
  );

  const handleCloseWindow = useCallback(
    (windowId: string) => {
      const floating = state.windows.find((item) => item.id === windowId);
      const count = floating?.node.panels.length ?? 0;
      actions.closeWindow(windowId);
      notify(`已关闭独立窗口，${count} 个面板收进「面板」菜单，可随时恢复`);
    },
    [actions, notify, state.windows],
  );

  const handleDockAllWindows = useCallback(() => {
    state.windows.forEach((floating) => actions.dockWindow(floating.id));
    notify("独立窗口已全部停靠回主区域");
  }, [actions, notify, state.windows]);

  /* ---------- 分割线拖动 ---------- */

  const beginSplitterDrag = useCallback(
    (splitter: SplitterGeometry, event: React.PointerEvent) => {
      if (event.button !== 0 || !state.dockRoot) return;
      const split = findSplitNode(state.dockRoot, splitter.splitId);
      if (!split) return;

      splitterCleanupRef.current?.();
      event.preventDefault();
      event.stopPropagation();

      const startClientX = event.clientX;
      const startClientY = event.clientY;
      const total =
        split.children.reduce((sum, child) => sum + child.size, 0) || 1;
      const startSizes = split.children.map((child) => child.size / total);

      const handleMove = (nativeEvent: PointerEvent) => {
        const delta =
          splitter.orientation === "row"
            ? nativeEvent.clientX - startClientX
            : nativeEvent.clientY - startClientY;
        const sizes = splitPairSizes(
          split,
          splitter.index,
          delta,
          splitter.available,
        );
        if (sizes) actions.setSplitSizes(splitter.splitId, sizes);
      };

      function cleanup() {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", cleanup);
        window.removeEventListener("keydown", handleKey, true);
        splitterCleanupRef.current = null;
        try {
          document.body.classList.remove("dock-splitter-dragging");
        } catch {
          // 忽略
        }
      }

      function handleUp() {
        cleanup();
      }

      function handleKey(keyEvent: KeyboardEvent) {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        actions.setSplitSizes(splitter.splitId, startSizes);
        cleanup();
      }

      splitterCleanupRef.current = cleanup;
      window.addEventListener("pointermove", handleMove, { passive: true });
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", cleanup);
      window.addEventListener("keydown", handleKey, true);
      try {
        document.body.classList.add("dock-splitter-dragging");
      } catch {
        // 忽略
      }
    },
    [actions, state.dockRoot],
  );

  const nudgeSplitter = useCallback(
    (splitter: SplitterGeometry, delta: number) => {
      if (!state.dockRoot) return;
      const split = findSplitNode(state.dockRoot, splitter.splitId);
      if (!split) return;
      const sizes = splitPairSizes(
        split,
        splitter.index,
        delta,
        splitter.available,
      );
      if (sizes) actions.setSplitSizes(splitter.splitId, sizes);
    },
    [actions, state.dockRoot],
  );

  /* ---------- 面板内容挂载点 ---------- */

  const hostInfo = new Map<PanelId, PanelHostInfo>();

  dockGeometry.groups.forEach((group) => {
    const contentRect = contentRectOf(group.rect);
    group.node.panels.forEach((panelId) => {
      lastHostRectsRef.current.set(panelId, contentRect);
      hostInfo.set(panelId, {
        rect: contentRect,
        zIndex: 3,
        visible: group.node.activePanel === panelId,
      });
    });
  });

  windowLayouts.forEach(({ floating, rect }) => {
    const contentRect = contentRectOf(rect);
    floating.node.panels.forEach((panelId) => {
      lastHostRectsRef.current.set(panelId, contentRect);
      hostInfo.set(panelId, {
        rect: contentRect,
        zIndex: 11 + floating.z * 2,
        visible: floating.node.activePanel === panelId,
      });
    });
  });

  const maximizedTab = state.maximized
    ? findPanelTabNode(state.dockRoot, state.maximized)
    : null;

  return (
    <div className="dock-layout">
      <DockToolbar
        state={state}
        panelMap={panelMap}
        hiddenPanels={hiddenPanels}
        onActivate={handleActivatePanel}
        onShow={handleShowPanel}
        onReset={handleReset}
      />

      <div className="dock-surface" ref={surfaceRef}>
        {/* 1) 主区域：页签组外壳 + 标题栏 */}
        {dockGeometry.groups.map((group) => (
          <DockGroupChrome
            key={group.nodeId}
            containerId={DOCK_CONTAINER_ID}
            node={group.node}
            rect={group.rect}
            panelMap={panelMap}
            maximized={maximizedTab?.id === group.nodeId}
            registerGroup={registerGroup}
            onActivate={(panelId) => handleActivateTab(group.nodeId, panelId)}
            onStartDrag={handleTabDragStart}
            consumeClickSuppression={consumeClickSuppression}
            onToggleMaximize={handleToggleMaximize}
            onFloat={handleFloatPanel}
            onHide={handleHidePanel}
          />
        ))}

        {/* 2) 分割线（主区域） */}
        <div className="dock-splitter-layer">
          {dockGeometry.splitters.map((splitter) => (
            <div
              key={`${splitter.splitId}-${splitter.index}`}
              className="dock-splitter"
              role="separator"
              tabIndex={0}
              aria-orientation={
                splitter.orientation === "row" ? "vertical" : "horizontal"
              }
              aria-label="调整面板大小"
              data-orientation={splitter.orientation}
              style={{
                left: splitter.rect.x,
                top: splitter.rect.y,
                width: splitter.rect.width,
                height: splitter.rect.height,
                zIndex: 5,
              }}
              onPointerDown={(event) => beginSplitterDrag(splitter, event)}
              onKeyDown={(event) => {
                const back =
                  splitter.orientation === "row"
                    ? event.key === "ArrowLeft"
                    : event.key === "ArrowUp";
                const forward =
                  splitter.orientation === "row"
                    ? event.key === "ArrowRight"
                    : event.key === "ArrowDown";
                if (!back && !forward) return;
                event.preventDefault();
                nudgeSplitter(splitter, back ? -16 : 16);
              }}
            />
          ))}
        </div>

        {/* 3) 独立窗口（外壳 + 标题栏 + 缩放边） */}
        {windowLayouts.map(({ floating, rect }) => (
          <FloatingPanelWindow
            key={floating.id}
            floating={floating}
            rect={rect}
            panelMap={panelMap}
            surface={surfaceSize}
            registerGroup={registerGroup}
            onActivate={(panelId) =>
              handleActivateTab(floating.node.id, panelId)
            }
            onStartDrag={handleTabDragStart}
            consumeClickSuppression={consumeClickSuppression}
            onRaise={actions.raiseWindow}
            onMove={actions.moveWindow}
            onResize={actions.resizeWindow}
            onDock={handleDockWindow}
            onClose={handleCloseWindow}
          />
        ))}

        {/* 4) 主区域空了：合理空状态，不影响窗口/菜单里的面板 */}
        {!state.dockRoot && (
          <DockEmptyState
            hiddenPanels={hiddenPanels}
            windowCount={state.windows.length}
            panelMap={panelMap}
            onShow={handleShowPanel}
            onDockAllWindows={handleDockAllWindows}
            onReset={handleReset}
          />
        )}

        {/* 5) 内容层：三块面板始终挂载，只改位置/显隐 */}
        {PANEL_IDS.map((panelId) => {
          const panel = panelMap[panelId];
          if (!panel) return null;
          const host = hostInfo.get(panelId);
          const visible = host?.visible === true;
          const rect =
            host?.rect ??
            lastHostRectsRef.current.get(panelId) ?? {
              x: 0,
              y: 0,
              width: 0,
              height: 0,
            };
          return (
            <div
              key={panelId}
              id={`dock-panel-${panelId}`}
              className="dock-panel-host"
              data-dock-panel={panelId}
              role="tabpanel"
              aria-label={panel.title}
              aria-hidden={visible ? undefined : true}
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                zIndex: host?.zIndex ?? 0,
                // 用 visibility 而不是 display：内容保持原尺寸排版，滚动位置不丢
                visibility: visible ? "visible" : "hidden",
                pointerEvents: visible ? "auto" : "none",
              }}
            >
              <div className="dock-panel-body">{panel.content}</div>
            </div>
          );
        })}

        {/* 6) 拖拽预览层 */}
        {drag && (
          <div className="dock-drag-layer" aria-hidden="true">
            {drag.indicator && drag.zone && (
              <div
                className="dock-drop-indicator"
                data-zone={drag.zone}
                style={{
                  left: drag.indicator.x,
                  top: drag.indicator.y,
                  width: drag.indicator.width,
                  height: drag.indicator.height,
                }}
              >
                <span className="dock-drop-indicator-label">
                  {drag.target?.nodeId === null && drag.zone === "center"
                    ? "停靠到主区域"
                    : zoneLabel(drag.zone)}
                </span>
              </div>
            )}

            <div
              className="dock-drag-ghost"
              style={{
                left: Math.min(
                  Math.max(drag.point.x + 14, 4),
                  Math.max(surfaceSize.width - 210, 4),
                ),
                top: Math.min(
                  Math.max(drag.point.y + 16, 4),
                  Math.max(surfaceSize.height - 64, 4),
                ),
              }}
            >
              <span className="dock-drag-ghost-grip" aria-hidden="true">
                ⠿
              </span>
              <span className="dock-drag-ghost-title">
                {panelMap[drag.panelId]?.icon ?? "▢"}{" "}
                {panelMap[drag.panelId]?.title ?? drag.panelId}
              </span>
              {drag.outside && (
                <span className="dock-drag-ghost-badge">松开 → 独立窗口</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DockLayout;
