/**
 * @module 面板停靠 —— 数据模型
 *
 * <p>「剧情编辑」页面从固定的三栏布局改成了**可拖动、可拼合**的面板系统。
 * 这里定义布局树的节点、独立窗口与拖放目标。
 *
 * <p>布局树只有两种节点：
 * <ul>
 *   <li><b>split</b>：分割容器（横向 row / 纵向 column），子节点按 `size` 比例分配空间；</li>
 *   <li><b>tabs</b>：页签组，一个组里若干面板共用一个区域，`activePanel` 决定谁可见。</li>
 * </ul>
 * 树可以任意嵌套（组里再分割、分割里再合并），布局管理器只维护这棵树 + 一组独立窗口。
 */

/** 三个可停靠面板的 id（与「剧情编辑」的三块区域一一对应） */
export type PanelId = "preview" | "properties" | "records";

/** 面板渲染顺序（也是默认布局、恢复顺序、面板菜单的顺序） */
export const PANEL_IDS: PanelId[] = ["preview", "properties", "records"];

/** 判断任意字符串是不是合法的面板 id（持久化数据可能被手改过） */
export function isPanelId(value: unknown): value is PanelId {
  return value === "preview" || value === "properties" || value === "records";
}

/**
 * 各面板的最小可用尺寸（CSS 像素）。
 *
 * <p>拖动分割线、把面板停靠到另一块旁边时都按这里限制：
 * 一个组的最小尺寸取组内所有面板的最小值的**最大值**（页签切换时布局不跳），
 * 分割容器则是各子节点最小尺寸的累加（横向加宽 / 纵向加高）或取最大值（另一方向）。
 */
export const PANEL_MIN_SIZE: Record<PanelId, Size> = {
  preview: { width: 300, height: 200 },
  properties: { width: 300, height: 180 },
  records: { width: 320, height: 150 },
};

/** 停靠区（主区域）的容器 id；独立窗口用各自的窗口 id */
export const DOCK_CONTAINER_ID = "dock";

/** 相邻分割块之间的空隙（同时是分割线的可拖动区域宽度） */
export const DOCK_GAP = 6;

/** 每个页签组顶部标题栏的高度；面板内容从标题栏下面开始 */
export const GROUP_HEADER_HEIGHT = 30;

/** 分割方向：row = 左右分栏，column = 上下分栏 */
export type DockOrientation = "row" | "column";

/** 拖放落点：四边 = 分割停靠，中心 = 合并成页签 */
export type DropZone = "top" | "right" | "bottom" | "left" | "center";

/** 二维点 / 尺寸 / 矩形（全部是「停靠表面」坐标系里的 CSS 像素） */
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 页签组节点 */
export interface TabNode {
  type: "tabs";
  id: string;
  /** 组内面板，至少 1 个；内容面板组件始终挂载，只是非当前页签时隐藏 */
  panels: PanelId[];
  /** 当前显示的面板；不合法时归一化成 panels[0] */
  activePanel: PanelId;
}

/** 分割节点的子项：`size` 是占父容器可分配空间的比例（兄弟间总和为 1） */
export interface SplitChild {
  /** 仅用于 React key / 拖放命中，与 node.id 不同 */
  id: string;
  size: number;
  node: LayoutNode;
}

/** 分割节点 */
export interface SplitNode {
  type: "split";
  id: string;
  orientation: DockOrientation;
  children: SplitChild[];
}

/** 布局树节点 */
export type LayoutNode = TabNode | SplitNode;

/** 独立面板窗口（浮层）。窗口内部固定是一个页签组，可再合并其它面板为页签 */
export interface FloatingWindowState {
  id: string;
  node: TabNode;
  /** 窗口在停靠表面坐标系里的矩形（渲染时会按表面尺寸夹紧一次） */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 层级：越大越靠前；同一时刻窗口之间不重复 */
  z: number;
}

/**
 * 布局管理器持有的全部状态。
 *
 * <p>`dockRoot` 为 null 表示主区域已经没有任何面板（全部拖出/隐藏），
 * 此时页面显示「空状态」，但独立窗口与隐藏面板仍然可用。
 */
export interface DockState {
  dockRoot: LayoutNode | null;
  windows: FloatingWindowState[];
  /** 主区域里被最大化的面板；只对停靠在主区域的面板生效 */
  maximized: PanelId | null;
}

/** 一次停靠的目标：容器（主区域/某个窗口）+ 目标页签组 + 落点 */
export interface DockTarget {
  containerId: string;
  /** null = 主区域已经空了，新建一个页签组当根节点 */
  nodeId: string | null;
  zone: DropZone;
  /** 目标组的矩形（用来按最小尺寸算分割比例），缺失时按 50/50 */
  rect?: Rect;
}

/** 面板当前在哪儿（渲染、面板菜单、隐藏列表都用它） */
export type PanelPlacement =
  | { kind: "docked"; nodeId: string; active: boolean }
  | { kind: "floating"; windowId: string; nodeId: string; active: boolean }
  | { kind: "hidden" };

/** 拖拽到落点时可显示的行为：分割 or 合并 or 独立窗口 */
export interface ResolvedDrop {
  target: DockTarget | null;
  /** 停靠指示器的矩形（表面坐标系）；null = 不显示指示器 */
  indicator: Rect | null;
  /** 指针在停靠区、所有独立窗口之外 → 松手会变成独立窗口 */
  outside: boolean;
  zone: DropZone | null;
}
