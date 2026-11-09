/**
 * @module 面板停靠 —— 全局状态操作
 *
 * <p>把布局树、独立窗口、最大化面板当成一份状态来改：停靠、拖出、隐藏、恢复、
 * 窗口移动/缩放/置顶、分割线尺寸都在这里。组件层只调用这些函数并把结果画出来。
 *
 * <p>约定：
 * - 每个面板在整个状态里**最多出现一次**（主区域或某个独立窗口）；
 * - 不出现在任何布局树里的面板 = 隐藏面板（面板菜单/空状态里可以恢复）；
 * - 独立窗口内部固定只有一个页签组（面板拖到窗口上 = 合并成页签）。
 */
import {
  DOCK_CONTAINER_ID,
  DockState,
  DockTarget,
  FloatingWindowState,
  LayoutNode,
  PANEL_IDS,
  PanelId,
  PanelPlacement,
  Point,
  Rect,
  Size,
  TabNode,
} from "./dockTypes";
import {
  activateTab,
  createDefaultDockRoot,
  createDockId,
  createTabNode,
  findPanelTabNode,
  findTabNode,
  firstTabNode,
  insertPanelIntoTab,
  isTabNode,
  removePanelFromTree,
  setSplitSizes,
  splitTabWithPanel,
} from "./dockTree";
import { nextWindowRect } from "./dockGeometry";

/* ===================== 初始状态 / 查询 ===================== */

/** 首次进入（或点「重置布局」）时的状态：三块区域按原来的位置摆好 */
export function createInitialDockState(): DockState {
  return {
    dockRoot: createDefaultDockRoot(),
    windows: [],
    maximized: null,
  };
}

export function resetDockState(): DockState {
  return createInitialDockState();
}

/** 面板当前在哪儿 */
export function locatePanel(state: DockState, panelId: PanelId): PanelPlacement {
  const dockedTab = findPanelTabNode(state.dockRoot, panelId);
  if (dockedTab) {
    return {
      kind: "docked",
      nodeId: dockedTab.id,
      active: dockedTab.activePanel === panelId,
    };
  }

  for (const window of state.windows) {
    if (window.node.panels.includes(panelId)) {
      return {
        kind: "floating",
        windowId: window.id,
        nodeId: window.node.id,
        active: window.node.activePanel === panelId,
      };
    }
  }

  return { kind: "hidden" };
}

/** 没在任何布局树里的面板（隐藏面板），按固定顺序 */
export function hiddenPanelsOf(state: DockState): PanelId[] {
  return PANEL_IDS.filter((panelId) => locatePanel(state, panelId).kind === "hidden");
}

/** 按节点 id 找页签组及其容器 */
export function findTabNodeInState(
  state: DockState,
  nodeId: string,
): { containerId: string; node: TabNode } | null {
  const docked = findTabNode(state.dockRoot, nodeId);
  if (docked) return { containerId: DOCK_CONTAINER_ID, node: docked };

  for (const window of state.windows) {
    if (window.node.id === nodeId) {
      return { containerId: window.id, node: window.node };
    }
  }
  return null;
}

function containerRoot(state: DockState, containerId: string): LayoutNode | null {
  if (containerId === DOCK_CONTAINER_ID) return state.dockRoot;
  return state.windows.find((window) => window.id === containerId)?.node ?? null;
}

function removeWindow(state: DockState, windowId: string): DockState {
  if (!state.windows.some((window) => window.id === windowId)) return state;
  return {
    ...state,
    windows: state.windows.filter((window) => window.id !== windowId),
  };
}

/** 写回容器根节点；独立窗口只允许页签组，根节点为空则关掉窗口 */
function withContainerRoot(
  state: DockState,
  containerId: string,
  root: LayoutNode | null,
): DockState {
  if (containerId === DOCK_CONTAINER_ID) {
    return { ...state, dockRoot: root };
  }

  if (!root) return removeWindow(state, containerId);
  if (!isTabNode(root)) return state;

  let changed = false;
  const windows = state.windows.map((window) => {
    if (window.id !== containerId) return window;
    changed = true;
    return { ...window, node: root };
  });
  return changed ? { ...state, windows } : state;
}

/** 当前最大 z（新窗口/置顶用） */
export function maxWindowZ(state: DockState): number {
  return state.windows.reduce((max, window) => Math.max(max, window.z), 0);
}

function nextWindowZ(state: DockState): number {
  return maxWindowZ(state) + 1;
}

function isDocked(state: DockState, panelId: PanelId): boolean {
  return findPanelTabNode(state.dockRoot, panelId) !== null;
}

/* ===================== 页签 / 显示 ===================== */

/** 切到某个面板（停靠中：切页签；浮窗：切页签并置顶；隐藏：无操作） */
export function activatePanelInState(state: DockState, panelId: PanelId): DockState {
  const placement = locatePanel(state, panelId);
  if (placement.kind === "hidden") return state;

  let next = setActiveTabInState(state, placement.nodeId, panelId);
  if (placement.kind === "floating") {
    next = raiseWindowInState(next, placement.windowId);
    return next;
  }

  // 别的面板正在最大化：切到这个面板就把最大化撤掉，否则用户看不到自己点的东西
  if (next.maximized && next.maximized !== panelId) {
    return { ...next, maximized: null };
  }
  return next;
}

/** 切换某个页签组的当前面板（独立窗口会顺带置顶） */
export function setActiveTabInState(
  state: DockState,
  nodeId: string,
  panelId: PanelId,
): DockState {
  const found = findTabNodeInState(state, nodeId);
  if (!found || !found.node.panels.includes(panelId)) return state;

  const currentRoot = containerRoot(state, found.containerId);
  if (!currentRoot) return state;

  const nextRoot = activateTab(currentRoot, nodeId, panelId);
  const next =
    nextRoot === currentRoot
      ? state
      : withContainerRoot(state, found.containerId, nextRoot);

  // 独立窗口：点击页签（即使已经是当前页签）也要把窗口提到最前
  return found.containerId === DOCK_CONTAINER_ID
    ? next
    : raiseWindowInState(next, found.containerId);
}

/* ===================== 隐藏 / 恢复 ===================== */

/** 把面板从布局里移除（收进「面板」菜单，不销毁内容） */
export function hidePanelInState(state: DockState, panelId: PanelId): DockState {
  const placement = locatePanel(state, panelId);
  if (placement.kind === "hidden") return state;
  return removePanelFromState(state, panelId);
}

/** 恢复一个隐藏面板：停回主区域（主区域空了就新建根组） */
export function showPanelInState(state: DockState, panelId: PanelId): DockState {
  const placement = locatePanel(state, panelId);
  if (placement.kind !== "hidden") return activatePanelInState(state, panelId);

  if (!state.dockRoot) {
    return {
      ...state,
      dockRoot: createTabNode([panelId], panelId),
      maximized: null,
    };
  }

  const first = firstTabNode(state.dockRoot);
  if (!first) {
    return {
      ...state,
      dockRoot: createTabNode([panelId], panelId),
      maximized: null,
    };
  }

  return {
    ...state,
    dockRoot: insertPanelIntoTab(state.dockRoot, first.id, panelId),
    maximized: null,
  };
}

/** 从它所在的容器里拿走面板；连带处理空组、空分栏与空窗口 */
function removePanelFromState(state: DockState, panelId: PanelId): DockState {
  const placement = locatePanel(state, panelId);
  if (placement.kind === "hidden") return state;

  if (placement.kind === "docked") {
    const nextRoot = removePanelFromTree(state.dockRoot, panelId);
    return {
      ...state,
      dockRoot: nextRoot,
      maximized: state.maximized === panelId ? null : state.maximized,
    };
  }

  const window = state.windows.find((item) => item.id === placement.windowId);
  if (!window) return state;

  const nextNode = removePanelFromTree(window.node, panelId);
  if (!nextNode) return removeWindow(state, window.id);
  if (!isTabNode(nextNode)) return state;

  return {
    ...state,
    windows: state.windows.map((item) =>
      item.id === window.id ? { ...item, node: nextNode } : item,
    ),
  };
}

/* ===================== 停靠 ===================== */

/**
 * 把面板停靠到目标（分割 / 合并）。
 *
 * @param target {@link import("./dockGeometry").resolveDropTarget} 解析出的目标
 */
export function dockPanelInState(
  state: DockState,
  panelId: PanelId,
  target: DockTarget | null,
): DockState {
  if (!target) return state;

  const placement = locatePanel(state, panelId);

  // 拖回自己原来的组中心：等价于切回这个页签，不重排
  if (
    placement.kind === "docked" &&
    target.containerId === DOCK_CONTAINER_ID &&
    target.nodeId === placement.nodeId &&
    target.zone === "center"
  ) {
    return setActiveTabInState(state, placement.nodeId, panelId);
  }
  if (
    placement.kind === "floating" &&
    target.containerId === placement.windowId &&
    target.zone === "center"
  ) {
    return activatePanelInState(state, panelId);
  }

  // 先移除（可能把源组/源窗口收掉），再插入目标容器
  const withoutPanel = removePanelFromState(state, panelId);
  return insertPanelIntoContainer(withoutPanel, panelId, target);
}

/** 把面板插进目标容器：独立窗口只合并页签，主区域按四边分割/中心合并 */
function insertPanelIntoContainer(
  state: DockState,
  panelId: PanelId,
  target: DockTarget,
): DockState {
  if (target.containerId !== DOCK_CONTAINER_ID) {
    const window = state.windows.find((item) => item.id === target.containerId);
    if (!window) return showPanelInState(state, panelId);

    const node: TabNode = window.node.panels.includes(panelId)
      ? { ...window.node, activePanel: panelId }
      : {
          ...window.node,
          panels: [...window.node.panels, panelId],
          activePanel: panelId,
        };
    return {
      ...state,
      windows: state.windows.map((item) =>
        item.id === window.id ? { ...item, node } : item,
      ),
    };
  }

  if (!state.dockRoot) {
    return {
      ...state,
      dockRoot: createTabNode([panelId], panelId),
      maximized: null,
    };
  }

  const targetNodeId = target.nodeId ?? firstTabNode(state.dockRoot)?.id ?? null;
  if (!targetNodeId) {
    return {
      ...state,
      dockRoot: createTabNode([panelId], panelId),
      maximized: null,
    };
  }

  const targetNode = findTabNode(state.dockRoot, targetNodeId);
  if (!targetNode) {
    // 目标组在"先移除再插入"的过程里被收掉了（极端情况）：退回主区域第一个组
    const first = firstTabNode(state.dockRoot);
    return {
      ...state,
      dockRoot: first
        ? insertPanelIntoTab(state.dockRoot, first.id, panelId)
        : createTabNode([panelId], panelId),
      maximized: null,
    };
  }

  if (target.zone === "center") {
    return {
      ...state,
      dockRoot: insertPanelIntoTab(state.dockRoot, targetNodeId, panelId),
      maximized: null,
    };
  }

  const orientation =
    target.zone === "left" || target.zone === "right" ? "row" : "column";
  const available = target.rect
    ? orientation === "row"
      ? target.rect.width
      : target.rect.height
    : 0;

  return {
    ...state,
    dockRoot: splitTabWithPanel(
      state.dockRoot,
      targetNodeId,
      panelId,
      target.zone,
      available,
    ),
    maximized: null,
  };
}

/**
 * 把面板拖出成独立窗口。
 *
 * @param size 沿用的内容尺寸（拖出前的面板大小）
 * @param pointer 松手位置；null = 居中（「浮动」按钮）
 */
export function detachPanelInState(
  state: DockState,
  panelId: PanelId,
  size: Size,
  pointer: Point | null,
  surface: Size,
): DockState {
  const rect = nextWindowRect(size, pointer, surface);
  const placement = locatePanel(state, panelId);

  const withoutPanel =
    placement.kind === "hidden" ? state : removePanelFromState(state, panelId);

  const window: FloatingWindowState = {
    id: createDockId("window"),
    node: createTabNode([panelId], panelId),
    ...rect,
    z: nextWindowZ(withoutPanel),
  };

  return {
    ...withoutPanel,
    windows: [...withoutPanel.windows, window],
    maximized:
      withoutPanel.maximized === panelId ? null : withoutPanel.maximized,
  };
}

/* ===================== 窗口操作 ===================== */

export function moveWindowInState(
  state: DockState,
  windowId: string,
  x: number,
  y: number,
): DockState {
  const window = state.windows.find((item) => item.id === windowId);
  if (!window || (window.x === x && window.y === y)) return state;
  return {
    ...state,
    windows: state.windows.map((item) =>
      item.id === windowId ? { ...item, x, y } : item,
    ),
  };
}

export function resizeWindowInState(
  state: DockState,
  windowId: string,
  rect: Rect,
): DockState {
  const window = state.windows.find((item) => item.id === windowId);
  if (!window) return state;
  if (
    window.x === rect.x &&
    window.y === rect.y &&
    window.width === rect.width &&
    window.height === rect.height
  ) {
    return state;
  }
  return {
    ...state,
    windows: state.windows.map((item) =>
      item.id === windowId
        ? {
            ...item,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        : item,
    ),
  };
}

/** 置顶窗口（点击/拖动窗口时调用） */
export function raiseWindowInState(state: DockState, windowId: string): DockState {
  const window = state.windows.find((item) => item.id === windowId);
  if (!window) return state;
  const topZ = maxWindowZ(state);
  if (window.z >= topZ) return state;
  return {
    ...state,
    windows: state.windows.map((item) =>
      item.id === windowId ? { ...item, z: topZ + 1 } : item,
    ),
  };
}

/** 把窗口里的面板全部停回主区域（窗口关闭） */
export function dockWindowInState(state: DockState, windowId: string): DockState {
  const window = state.windows.find((item) => item.id === windowId);
  if (!window) return state;

  const panels = window.node.panels;
  const active = window.node.activePanel;
  let next = removeWindow(state, windowId);

  if (panels.length === 0) return next;

  if (!next.dockRoot) {
    return {
      ...next,
      dockRoot: createTabNode(panels, active),
      maximized: null,
    };
  }

  const first = firstTabNode(next.dockRoot);
  if (!first) {
    return {
      ...next,
      dockRoot: createTabNode(panels, active),
      maximized: null,
    };
  }

  let root = next.dockRoot;
  panels.forEach((panelId) => {
    root = insertPanelIntoTab(root, first.id, panelId);
  });
  root = activateTab(root, first.id, active);

  next = { ...next, dockRoot: root, maximized: null };
  return next;
}

/** 关闭窗口 = 面板收进「面板」菜单（不销毁面板内容，可随时恢复） */
export function closeWindowInState(state: DockState, windowId: string): DockState {
  return removeWindow(state, windowId);
}

/* ===================== 分割线 / 最大化 / 重置 ===================== */

/** 写回某个分割节点的尺寸（只对主区域生效；窗口内没有分割） */
export function setSplitSizesInState(
  state: DockState,
  splitId: string,
  sizes: number[],
): DockState {
  if (!state.dockRoot) return state;
  const nextRoot = setSplitSizes(state.dockRoot, splitId, sizes);
  if (nextRoot === state.dockRoot) return state;
  return { ...state, dockRoot: nextRoot };
}

/** 最大化 / 还原（只有停靠在主区域的面板可以最大化） */
export function toggleMaximizeInState(state: DockState, panelId: PanelId): DockState {
  if (!isDocked(state, panelId)) return state;
  if (state.maximized === panelId) return { ...state, maximized: null };
  return activatePanelInState({ ...state, maximized: panelId }, panelId);
}
