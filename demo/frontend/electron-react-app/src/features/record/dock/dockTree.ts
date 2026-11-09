/**
 * @module 面板停靠 —— 布局树纯函数
 *
 * <p>停靠/合并/分割/移除全部在这里完成，组件层只负责渲染与鼠标手势。
 * 所有函数都是纯函数（不读写 DOM、不碰 React state），因此可以单独测。
 *
 * <p>树的归一化约定：
 * - tabs 节点的 `panels` 至少 1 个，`activePanel` 必须属于 `panels`；
 * - split 节点至少 2 个子节点，兄弟 `size` 之和为 1；
 * - 移除面板后如果某个 split 只剩 1 个子节点，就把这个子节点提升上来（不留单叉分栏）。
 */
import {
  DOCK_GAP,
  LayoutNode,
  PANEL_MIN_SIZE,
  PanelId,
  Size,
  SplitChild,
  SplitNode,
  TabNode,
  DockOrientation,
  DropZone,
} from "./dockTypes";

/* ===================== id ===================== */

let idCounter = 0;

/**
 * 生成布局节点/窗口 id。
 *
 * <p>不用 `crypto.randomUUID`：Electron 与 jsdom 的支持情况不一致，
 * 而这里只需要"同一次会话内不重复 + 持久化后仍然唯一"。
 */
export function createDockId(prefix: string): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${random}`;
}

/* ===================== 构造 ===================== */

/** 新建页签组；重复的面板 id 会被去掉 */
export function createTabNode(
  panels: PanelId[],
  activePanel?: PanelId,
  id?: string,
): TabNode {
  const unique: PanelId[] = [];
  for (const panel of panels) {
    if (!unique.includes(panel)) unique.push(panel);
  }
  if (unique.length === 0) unique.push("preview");
  const active =
    activePanel && unique.includes(activePanel) ? activePanel : unique[0];
  return {
    type: "tabs",
    id: id ?? createDockId("tabs"),
    panels: unique,
    activePanel: active,
  };
}

/** 新建分割节点；尺寸会被归一化 */
export function createSplitNode(
  orientation: DockOrientation,
  children: Array<{ node: LayoutNode; size?: number }>,
  id?: string,
): SplitNode {
  return normalizeSplit({
    type: "split",
    id: id ?? createDockId("split"),
    orientation,
    children: children.map((child) => ({
      id: createDockId("cell"),
      size: child.size ?? 1 / Math.max(children.length, 1),
      node: child.node,
    })),
  });
}

/**
 * 默认布局（与改造前的三块区域一致）：
 *
 * ```
 * 上下分割
 * ├── 左右分割：预览 | 属性（46% 高度）
 * └── 剧情记录（54% 高度）
 * ```
 */
export function createDefaultDockRoot(): SplitNode {
  const preview = createTabNode(["preview"], "preview", "dock-preview");
  const properties = createTabNode(["properties"], "properties", "dock-properties");
  const records = createTabNode(["records"], "records", "dock-records");
  const top = createSplitNode("row", [
    { node: preview, size: 0.58 },
    { node: properties, size: 0.42 },
  ], "dock-split-top");
  return createSplitNode("column", [
    { node: top, size: 0.47 },
    { node: records, size: 0.53 },
  ], "dock-split-main");
}

/* ===================== 查询 ===================== */

export function isTabNode(node: LayoutNode): node is TabNode {
  return node.type === "tabs";
}

export function isSplitNode(node: LayoutNode): node is SplitNode {
  return node.type === "split";
}

/** 深度优先收集所有页签组（布局顺序） */
export function collectTabNodes(node: LayoutNode | null): TabNode[] {
  const result: TabNode[] = [];
  const walk = (current: LayoutNode) => {
    if (isTabNode(current)) {
      result.push(current);
      return;
    }
    current.children.forEach((child) => walk(child.node));
  };
  if (node) walk(node);
  return result;
}

/** 布局树里出现的面板（按布局顺序，去重） */
export function collectPanels(node: LayoutNode | null): PanelId[] {
  const result: PanelId[] = [];
  collectTabNodes(node).forEach((tab) => {
    tab.panels.forEach((panel) => {
      if (!result.includes(panel)) result.push(panel);
    });
  });
  return result;
}

/** 按 id 找页签组 */
export function findTabNode(
  node: LayoutNode | null,
  nodeId: string,
): TabNode | null {
  if (!node) return null;
  if (isTabNode(node)) return node.id === nodeId ? node : null;
  for (const child of node.children) {
    const found = findTabNode(child.node, nodeId);
    if (found) return found;
  }
  return null;
}

/** 按 id 找分割节点 */
export function findSplitNode(
  node: LayoutNode | null,
  splitId: string,
): SplitNode | null {
  if (!node) return null;
  if (isTabNode(node)) return null;
  if (node.id === splitId) return node;
  for (const child of node.children) {
    const found = findSplitNode(child.node, splitId);
    if (found) return found;
  }
  return null;
}

/** 面板所在的页签组 */
export function findPanelTabNode(
  node: LayoutNode | null,
  panelId: PanelId,
): TabNode | null {
  const tabs = collectTabNodes(node);
  for (const tab of tabs) {
    if (tab.panels.includes(panelId)) return tab;
  }
  return null;
}

/** 布局树里第一个页签组（恢复面板、停靠窗口时的默认落点） */
export function firstTabNode(node: LayoutNode | null): TabNode | null {
  return collectTabNodes(node)[0] ?? null;
}

/** 布局树里是否还有这个面板 */
export function treeHasPanel(node: LayoutNode | null, panelId: PanelId): boolean {
  return findPanelTabNode(node, panelId) !== null;
}

/* ===================== 最小尺寸 ===================== */

function maxOf(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), 0);
}

/**
 * 子树的最小可用尺寸。
 *
 * <p>页签组取组内面板的最大值（切换页签不跳），分割容器沿分割方向累加、垂直方向取最大。
 */
export function minSizeOf(node: LayoutNode): Size {
  if (isTabNode(node)) {
    return {
      width: maxOf(node.panels.map((panel) => PANEL_MIN_SIZE[panel].width)),
      height: maxOf(node.panels.map((panel) => PANEL_MIN_SIZE[panel].height)),
    };
  }

  if (node.orientation === "row") {
    return {
      width:
        node.children.reduce(
          (sum, child) => sum + minSizeOf(child.node).width,
          0,
        ) + DOCK_GAP * Math.max(node.children.length - 1, 0),
      height: maxOf(node.children.map((child) => minSizeOf(child.node).height)),
    };
  }

  return {
    width: maxOf(node.children.map((child) => minSizeOf(child.node).width)),
    height:
      node.children.reduce(
        (sum, child) => sum + minSizeOf(child.node).height,
        0,
      ) + DOCK_GAP * Math.max(node.children.length - 1, 0),
  };
}

/** 子节点在分割方向上的最小长度 */
export function minLengthOf(node: LayoutNode, orientation: DockOrientation): number {
  const size = minSizeOf(node);
  return orientation === "row" ? size.width : size.height;
}

function clamp(value: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * 一次分割停靠的尺寸分配。
 *
 * <p>默认 50/50；某一侧会小于最小尺寸时向另一侧让，两边都放不下时按最小尺寸比例分。
 *
 * @param available 目标容器在分割方向上的长度（含将来要插入的间隙）
 * @returns `[已有面板占比, 新面板占比]`，两者和为 1
 */
export function splitFractions(
  orientation: DockOrientation,
  available: number,
  existingNode: LayoutNode,
  newNode: LayoutNode,
): [number, number] {
  const usable = available - DOCK_GAP;
  if (!Number.isFinite(usable) || usable <= 1) return [0.5, 0.5];

  const existingMin = minLengthOf(existingNode, orientation);
  const newMin = minLengthOf(newNode, orientation);

  if (existingMin + newMin >= usable) {
    const ratio = existingMin + newMin > 0 ? existingMin / (existingMin + newMin) : 0.5;
    const safe = clamp(ratio, 0.2, 0.8);
    return [safe, 1 - safe];
  }

  const existingSize = clamp(usable / 2, existingMin, usable - newMin);
  const existingFraction = existingSize / usable;
  return [existingFraction, 1 - existingFraction];
}

/* ===================== 归一化 ===================== */

/** 把 split 的子节点尺寸归一化成和为 1（非法值按等分处理） */
export function normalizeSplit(split: SplitNode): SplitNode {
  const children = split.children.map((child) => ({
    ...child,
    size: Number.isFinite(child.size) && child.size > 0 ? child.size : 0,
  }));
  const total = children.reduce((sum, child) => sum + child.size, 0);
  if (!(total > 0)) {
    const equal = 1 / Math.max(children.length, 1);
    return { ...split, children: children.map((child) => ({ ...child, size: equal })) };
  }
  return {
    ...split,
    children: children.map((child) => ({ ...child, size: child.size / total })),
  };
}

/**
 * 分割节点的收尾：丢掉空子节点；只剩一个子节点时把子节点提上来；否则归一化尺寸。
 *
 * @returns 收尾后的节点；子树整个空了返回 null
 */
function pruneSplit(split: SplitNode): LayoutNode | null {
  if (split.children.length === 0) return null;
  if (split.children.length === 1) return split.children[0].node;
  return normalizeSplit(split);
}

/* ===================== 结构修改 ===================== */

/** 递归重建树：`updater` 对每个页签组调用，返回 null 表示删掉这个组 */
function mapTabs(
  node: LayoutNode,
  nodeId: string,
  updater: (tab: TabNode) => LayoutNode | null,
): LayoutNode | null {
  if (isTabNode(node)) {
    return node.id === nodeId ? updater(node) : node;
  }

  let changed = false;
  const children: SplitChild[] = [];
  node.children.forEach((child) => {
    const next = mapTabs(child.node, nodeId, updater);
    if (!next) {
      changed = true;
      return;
    }
    if (next !== child.node) changed = true;
    children.push(next === child.node ? child : { ...child, node: next });
  });

  if (!changed) return node;
  return pruneSplit({ ...node, children });
}

/**
 * 在指定页签组里插入面板（已存在则只切到它）。
 *
 * <p>找不到目标组时原样返回。
 */
export function insertPanelIntoTab(
  root: LayoutNode,
  nodeId: string,
  panelId: PanelId,
): LayoutNode {
  const next = mapTabs(root, nodeId, (tab) => {
    if (tab.panels.includes(panelId)) {
      // 已经是当前页签：返回原对象，让上层状态比较可以提前退出
      return tab.activePanel === panelId ? tab : { ...tab, activePanel: panelId };
    }
    return { ...tab, panels: [...tab.panels, panelId], activePanel: panelId };
  });
  return next ?? root;
}

/** 切换某个页签组的当前面板（面板不在组里则原样返回） */
export function activateTab(
  root: LayoutNode,
  nodeId: string,
  panelId: PanelId,
): LayoutNode {
  const next = mapTabs(root, nodeId, (tab) =>
    tab.panels.includes(panelId) ? { ...tab, activePanel: panelId } : tab,
  );
  return next ?? root;
}

/** 从布局树里移除面板，并把变空的组/单叉分栏收掉 */
export function removePanelFromTree(
  root: LayoutNode | null,
  panelId: PanelId,
): LayoutNode | null {
  if (!root) return null;
  if (!treeHasPanel(root, panelId)) return root;

  if (isTabNode(root)) {
    if (!root.panels.includes(panelId)) return root;
    const panels = root.panels.filter((panel) => panel !== panelId);
    if (panels.length === 0) return null;
    return {
      ...root,
      panels,
      activePanel: panels.includes(root.activePanel) ? root.activePanel : panels[0],
    };
  }

  let changed = false;
  const children: SplitChild[] = [];
  root.children.forEach((child) => {
    const next = removePanelFromTree(child.node, panelId);
    if (!next) {
      changed = true;
      return;
    }
    if (next !== child.node) changed = true;
    children.push(next === child.node ? child : { ...child, node: next });
  });

  if (!changed) return root;
  return pruneSplit({ ...root, children });
}

/**
 * 把面板分割停靠到目标组的某一侧，返回新的根节点。
 *
 * <p>中心落点不在这里处理（走 {@link insertPanelIntoTab}）。
 */
export function splitTabWithPanel(
  root: LayoutNode,
  nodeId: string,
  panelId: PanelId,
  zone: Exclude<DropZone, "center">,
  available: number,
): LayoutNode {
  const target = findTabNode(root, nodeId);
  if (!target) return root;
  // 调用方约定先移除再停靠；万一没移除（同一组里拖到自己旁边），这里直接当无操作
  if (target.panels.includes(panelId)) return root;

  const orientation: DockOrientation =
    zone === "left" || zone === "right" ? "row" : "column";
  const newTab = createTabNode([panelId], panelId);
  const [existingFraction, newFraction] = splitFractions(
    orientation,
    available,
    target,
    newTab,
  );

  const newFirst = zone === "left" || zone === "top";
  const children = newFirst
    ? [
        { id: createDockId("cell"), size: newFraction, node: newTab },
        { id: createDockId("cell"), size: existingFraction, node: target },
      ]
    : [
        { id: createDockId("cell"), size: existingFraction, node: target },
        { id: createDockId("cell"), size: newFraction, node: newTab },
      ];

  const next = mapTabs(root, nodeId, () => ({
    type: "split",
    id: createDockId("split"),
    orientation,
    children,
  }));
  return next ?? root;
}

/** 设置某个分割节点的子节点尺寸（长度必须匹配，会自动归一化） */
export function setSplitSizes(
  root: LayoutNode,
  splitId: string,
  sizes: number[],
): LayoutNode {
  const split = findSplitNode(root, splitId);
  if (!split || split.children.length !== sizes.length) return root;

  const next = mapSplit(root, splitId, (node) => ({
    ...node,
    children: node.children.map((child, index) => ({
      ...child,
      size: sizes[index],
    })),
  }));
  return next ?? root;
}

/** 递归重建树：`updater` 对指定分割节点调用 */
function mapSplit(
  node: LayoutNode,
  splitId: string,
  updater: (split: SplitNode) => LayoutNode | null,
): LayoutNode | null {
  if (isTabNode(node)) return node;
  if (node.id === splitId) return updater(node);

  let changed = false;
  const children: SplitChild[] = [];
  node.children.forEach((child) => {
    const next = mapSplit(child.node, splitId, updater);
    if (!next) {
      changed = true;
      return;
    }
    if (next !== child.node) changed = true;
    children.push(next === child.node ? child : { ...child, node: next });
  });

  if (!changed) return node;
  return pruneSplit({ ...node, children });
}

/**
 * 计算拖动分割线后各子节点的新尺寸（返回完整 sizes 数组；不合法时返回 null）。
 *
 * <p>组件层在拖动开始时记下这份数组，之后每次 move 都从"起点"重算，
 * 不会把多次位移叠加上去。
 */
export function splitPairSizes(
  split: SplitNode,
  index: number,
  deltaPx: number,
  availableLength: number,
): number[] | null {
  if (index < 0 || index + 1 >= split.children.length) return null;
  if (!Number.isFinite(availableLength) || availableLength <= 0) return null;

  const children = split.children;
  const contentLength =
    availableLength - DOCK_GAP * Math.max(children.length - 1, 0);
  if (!(contentLength > 0)) return null;

  const total = children.reduce((sum, child) => sum + child.size, 0);
  if (!(total > 0)) return null;

  const firstLength = (children[index].size / total) * contentLength;
  const secondLength = (children[index + 1].size / total) * contentLength;
  const pairLength = firstLength + secondLength;

  const firstMin = minLengthOf(children[index].node, split.orientation);
  const secondMin = minLengthOf(children[index + 1].node, split.orientation);
  if (pairLength <= firstMin + secondMin) return null;

  const nextFirst = clamp(firstLength + deltaPx, firstMin, pairLength - secondMin);
  const nextSecond = pairLength - nextFirst;

  const sizes = children.map((child) => child.size / total);
  sizes[index] = nextFirst / contentLength;
  sizes[index + 1] = nextSecond / contentLength;
  return sizes;
}

/**
 * 拖动分割线：只调整相邻两个子节点的尺寸，其余子节点保持不变。
 *
 * @param splitId 分割节点 id
 * @param index 分割线左侧/上侧的 child 下标
 * @param deltaPx 指针位移（右/下为正）
 * @param availableLength 分割容器在分割方向上的总长度（含间隙）
 */
export function resizeSplitPair(
  root: LayoutNode,
  splitId: string,
  index: number,
  deltaPx: number,
  availableLength: number,
): LayoutNode {
  const split = findSplitNode(root, splitId);
  if (!split) return root;
  const sizes = splitPairSizes(split, index, deltaPx, availableLength);
  if (!sizes) return root;
  return setSplitSizes(root, splitId, sizes);
}
