/**
 * @module 面板停靠 —— 布局持久化
 *
 * <p>布局（分割比例、页签分组、当前页签、独立窗口位置、最大化/隐藏状态）存 localStorage，
 * 下次打开软件原样恢复。数据来自用户磁盘，解析时必须逐字段校验：
 * 未知面板、重复面板、空页签组、单叉分栏都要清理掉，坏数据直接回落到默认布局。
 *
 * <p>注意：**隐藏面板不单独存**。不在任何布局树里的面板就是隐藏的，
 * 这样即使某次版本升级新增了面板，旧布局里没有它也会自动出现在「面板」菜单里，
 * 而不是永远找不回来。
 */
import {
  DockState,
  FloatingWindowState,
  LayoutNode,
  PanelId,
  SplitChild,
  SplitNode,
  TabNode,
  isPanelId,
} from "./dockTypes";
import {
  collectTabNodes,
  createDockId,
  createTabNode,
  findPanelTabNode,
  isTabNode,
  normalizeSplit,
} from "./dockTree";

/** 存储格式版本；结构变化时递增，旧数据会被丢弃并回落默认布局 */
export const DOCK_STORAGE_VERSION = 1;

/** localStorage 键名（与工程设置的 `lcpgv_project_settings` 保持同一命名风格） */
export const DOCK_LAYOUT_STORAGE_KEY = "lcpgv_record_dock_layout";

/** 持久化用的最小存储接口（便于单测传内存实现） */
export interface DockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 持久化结构（字段都可能是坏数据，所以是 unknown） */
export interface PersistedDockLayout {
  version: number;
  dockRoot: unknown;
  windows: unknown;
  maximized: unknown;
}

/** 取浏览器 localStorage；不可用（无 window / 隐私模式）时返回 null */
export function getDockStorage(): DockStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readId(
  value: unknown,
  prefix: string,
  usedIds: Set<string>,
): string {
  let id =
    typeof value === "string" && value.trim() ? value : createDockId(prefix);
  // 磁盘上的数据可能被手改过：重复的节点/窗口 id 会让 React key 与拖放命中打架
  if (usedIds.has(id)) id = createDockId(prefix);
  usedIds.add(id);
  return id;
}

/**
 * 校验并清理一棵布局树。
 *
 * @param used 已经出现过的面板（跨根节点去重，保证每个面板只出现一次）
 * @param usedIds 已经出现过的节点 id（去重，避免 React key 冲突）
 * @returns null = 这棵子树没有有效内容
 */
function sanitizeNode(
  value: unknown,
  used: Set<PanelId>,
  usedIds: Set<string>,
): LayoutNode | null {
  if (!isRecord(value)) return null;

  if (value.type === "tabs") {
    const rawPanels = Array.isArray(value.panels) ? value.panels : [];
    const panels: PanelId[] = [];
    rawPanels.forEach((panel) => {
      if (!isPanelId(panel) || used.has(panel) || panels.includes(panel)) return;
      panels.push(panel);
    });
    if (panels.length === 0) return null;
    panels.forEach((panel) => used.add(panel));

    const active =
      isPanelId(value.activePanel) && panels.includes(value.activePanel)
        ? value.activePanel
        : panels[0];

    return {
      type: "tabs",
      id: readId(value.id, "tabs", usedIds),
      panels,
      activePanel: active,
    };
  }

  if (value.type === "split") {
    const orientation =
      value.orientation === "row" || value.orientation === "column"
        ? value.orientation
        : null;
    if (!orientation) return null;

    const rawChildren = Array.isArray(value.children) ? value.children : [];
    const children: SplitChild[] = [];
    rawChildren.forEach((rawChild) => {
      if (!isRecord(rawChild)) return;
      const node = sanitizeNode(rawChild.node, used, usedIds);
      if (!node) return;
      children.push({
        id: readId(rawChild.id, "cell", usedIds),
        size: asFiniteNumber(rawChild.size, 0),
        node,
      });
    });

    if (children.length === 0) return null;
    if (children.length === 1) return children[0].node;

    const split: SplitNode = {
      type: "split",
      id: readId(value.id, "split", usedIds),
      orientation,
      children,
    };
    return normalizeSplit(split);
  }

  return null;
}

/** 独立窗口内部只允许一个页签组：万一存在分割，把面板都摊进一个组 */
function flattenToTabNode(node: LayoutNode): TabNode {
  if (isTabNode(node)) return node;
  const panels: PanelId[] = [];
  let active: PanelId | null = null;
  collectTabNodes(node).forEach((tab) => {
    if (!active) active = tab.activePanel;
    tab.panels.forEach((panel) => {
      if (!panels.includes(panel)) panels.push(panel);
    });
  });
  return createTabNode(panels, active ?? undefined);
}

/**
 * 解析持久化字符串。
 *
 * @returns 合法状态；版本不符 / 结构完全不对时返回 null（调用方回落默认布局）
 */
export function parseDockState(raw: unknown): DockState | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== DOCK_STORAGE_VERSION) return null;

  const used = new Set<PanelId>();
  const usedIds = new Set<string>();
  const dockRoot = sanitizeNode(raw.dockRoot, used, usedIds);

  const rawWindows = Array.isArray(raw.windows) ? raw.windows : [];
  const windows: FloatingWindowState[] = [];
  rawWindows.forEach((rawWindow) => {
    if (!isRecord(rawWindow)) return;
    const node = sanitizeNode(rawWindow.node, used, usedIds);
    if (!node) return;

    windows.push({
      id: readId(rawWindow.id, "window", usedIds),
      node: flattenToTabNode(node),
      x: asFiniteNumber(rawWindow.x, 0),
      y: asFiniteNumber(rawWindow.y, 0),
      width: Math.max(asFiniteNumber(rawWindow.width, 480), 240),
      height: Math.max(asFiniteNumber(rawWindow.height, 360), 160),
      z: asFiniteNumber(rawWindow.z, windows.length + 1),
    });
  });

  // z 重新排成 1..n：避免手改/长期置顶后 z 无限增大
  windows.sort((a, b) => a.z - b.z);
  windows.forEach((window, index) => {
    window.z = index + 1;
  });

  const maximized =
    isPanelId(raw.maximized) && findPanelTabNode(dockRoot, raw.maximized)
      ? raw.maximized
      : null;

  return { dockRoot, windows, maximized };
}

/** 从存储读取；坏 JSON / 坏结构都返回 null */
export function loadDockState(
  storage: DockStorage | null,
  key: string = DOCK_LAYOUT_STORAGE_KEY,
): DockState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return parseDockState(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** 序列化成可存储的纯对象 */
export function serializeDockState(state: DockState): PersistedDockLayout {
  return {
    version: DOCK_STORAGE_VERSION,
    dockRoot: state.dockRoot,
    windows: state.windows,
    maximized: state.maximized,
  };
}

/** 写入存储；容量不足 / 隐私模式等异常静默忽略（布局丢一次不影响编辑） */
export function saveDockState(
  storage: DockStorage | null,
  key: string,
  state: DockState,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(serializeDockState(state)));
  } catch {
    // 忽略：持久化失败时仍按当前内存布局工作
  }
}
