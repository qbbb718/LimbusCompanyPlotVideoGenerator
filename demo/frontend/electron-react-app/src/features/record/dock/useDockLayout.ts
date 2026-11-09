/**
 * @module 面板停靠 —— React 状态钩子
 *
 * <p>把 {@link import("./dockState")} 的纯函数包成一组稳定引用的操作，
 * 并在状态变化后**防抖写 localStorage**（拖动分割线/窗口时状态每秒变几十次，
 * 不能每次都同步落盘）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { DockState, DockTarget, PanelId, Point, Rect, Size } from "./dockTypes";
import {
  activatePanelInState,
  closeWindowInState,
  createInitialDockState,
  detachPanelInState,
  dockPanelInState,
  dockWindowInState,
  hiddenPanelsOf,
  hidePanelInState,
  moveWindowInState,
  resizeWindowInState,
  raiseWindowInState,
  resetDockState,
  setActiveTabInState,
  setSplitSizesInState,
  showPanelInState,
  toggleMaximizeInState,
} from "./dockState";
import {
  DOCK_LAYOUT_STORAGE_KEY,
  getDockStorage,
  loadDockState,
  saveDockState,
} from "./dockPersistence";

/** 写盘防抖：足够让拖动过程中的高频状态只落一次 */
const SAVE_DEBOUNCE_MS = 150;

export interface DockLayoutActions {
  /** 切到面板（停靠中切页签、浮窗置顶） */
  activate(panelId: PanelId): void;
  /** 切换某个页签组的当前面板 */
  setActiveTab(nodeId: string, panelId: PanelId): void;
  /** 隐藏面板（收进「面板」菜单） */
  hide(panelId: PanelId): void;
  /** 恢复隐藏面板到主区域 */
  show(panelId: PanelId): void;
  /** 按拖放结果停靠 */
  dock(panelId: PanelId, target: DockTarget | null): void;
  /** 拖出成独立窗口 */
  detach(panelId: PanelId, size: Size, pointer: Point | null, surface: Size): void;
  closeWindow(windowId: string): void;
  dockWindow(windowId: string): void;
  moveWindow(windowId: string, x: number, y: number): void;
  resizeWindow(windowId: string, rect: Rect): void;
  raiseWindow(windowId: string): void;
  setSplitSizes(splitId: string, sizes: number[]): void;
  toggleMaximize(panelId: PanelId): void;
  reset(): void;
}

export interface UseDockLayoutResult {
  state: DockState;
  hiddenPanels: PanelId[];
  actions: DockLayoutActions;
}

export function useDockLayout(
  storageKey: string = DOCK_LAYOUT_STORAGE_KEY,
): UseDockLayoutResult {
  const [state, setState] = useState<DockState>(() => {
    return (
      loadDockState(getDockStorage(), storageKey) ?? createInitialDockState()
    );
  });

  /** 给"卸载时补一次落盘"用：effect 清理闭包里拿不到最新 state */
  const stateRef = useRef(state);
  stateRef.current = state;
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveDockState(getDockStorage(), storageKey, stateRef.current);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [state, storageKey]);

  // 卸载（切到资源管理等页面）时把还没落盘的布局补存一次
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      saveDockState(getDockStorage(), storageKey, stateRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const actions = useMemo<DockLayoutActions>(
    () => ({
      activate: (panelId) => setState((prev) => activatePanelInState(prev, panelId)),
      setActiveTab: (nodeId, panelId) =>
        setState((prev) => setActiveTabInState(prev, nodeId, panelId)),
      hide: (panelId) => setState((prev) => hidePanelInState(prev, panelId)),
      show: (panelId) => setState((prev) => showPanelInState(prev, panelId)),
      dock: (panelId, target) =>
        setState((prev) => dockPanelInState(prev, panelId, target)),
      detach: (panelId, size, pointer, surface) =>
        setState((prev) => detachPanelInState(prev, panelId, size, pointer, surface)),
      closeWindow: (windowId) =>
        setState((prev) => closeWindowInState(prev, windowId)),
      dockWindow: (windowId) =>
        setState((prev) => dockWindowInState(prev, windowId)),
      moveWindow: (windowId, x, y) =>
        setState((prev) => moveWindowInState(prev, windowId, x, y)),
      resizeWindow: (windowId, rect) =>
        setState((prev) => resizeWindowInState(prev, windowId, rect)),
      raiseWindow: (windowId) => setState((prev) => raiseWindowInState(prev, windowId)),
      setSplitSizes: (splitId, sizes) =>
        setState((prev) => setSplitSizesInState(prev, splitId, sizes)),
      toggleMaximize: (panelId) =>
        setState((prev) => toggleMaximizeInState(prev, panelId)),
      reset: () => setState(resetDockState()),
    }),
    [],
  );

  const hiddenPanels = useMemo(() => hiddenPanelsOf(state), [state]);

  return { state, hiddenPanels, actions };
}
