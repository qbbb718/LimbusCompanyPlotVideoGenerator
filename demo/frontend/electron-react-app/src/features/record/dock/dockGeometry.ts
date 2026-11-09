/**
 * @module 面板停靠 —— 几何与命中
 *
 * <p>布局树只存比例，真正画到屏幕上需要换算成像素矩形：
 * {@link computeLayout} 把「根节点 + 停靠区尺寸」摊平成"页签组矩形 + 分割线矩形"两份列表，
 * 组件层拿它们做绝对定位即可（不依赖嵌套 flex，面板被拖来拖去时 React 节点位置不变）。
 *
 * <p>拖放命中、落点四边/中心判定、独立窗口的夹紧/缩放也在这里，全部是纯函数。
 */
import {
  DOCK_CONTAINER_ID,
  DOCK_GAP,
  DockOrientation,
  DropZone,
  GROUP_HEADER_HEIGHT,
  LayoutNode,
  PanelId,
  Point,
  Rect,
  ResolvedDrop,
  Size,
  TabNode,
} from "./dockTypes";
import { findPanelTabNode } from "./dockTree";

/** 拖拽时边缘热区的像素宽度（会按面板尺寸夹在 12%–35% 之间） */
export const EDGE_BAND_PX = 64;

/** 拖到目标上后，指示器延迟出现的时间：快速划过多个面板时不会一路闪 */
export const DOCK_HOVER_DELAY_MS = 90;

/** 独立窗口的最小尺寸 */
export const MIN_WINDOW_WIDTH = 320;
export const MIN_WINDOW_HEIGHT = 220;

/* ===================== 布局几何 ===================== */

export interface GroupGeometry {
  nodeId: string;
  containerId: string;
  node: TabNode;
  /** 整个页签组的矩形（含标题栏） */
  rect: Rect;
}

export interface SplitterGeometry {
  splitId: string;
  containerId: string;
  /** 分割线左/上侧的 child 下标 */
  index: number;
  orientation: DockOrientation;
  /** 分割线自身（落在两个子节点之间的空隙里） */
  rect: Rect;
  /** 分割容器在分割方向上的总长度，拖动换算与最小尺寸夹紧都用它 */
  available: number;
}

export interface LayoutGeometry {
  groups: GroupGeometry[];
  splitters: SplitterGeometry[];
}

const EMPTY_GEOMETRY: LayoutGeometry = { groups: [], splitters: [] };

/**
 * 把布局树摊平成可渲染的矩形列表。
 *
 * @param root 布局树（null = 主区域空了）
 * @param containerId 主区域用 `dock`，独立窗口用窗口 id
 * @param rect 容器矩形
 * @param maximizedPanel 有值时只返回这个面板所在的组（铺满容器，其它组隐藏）
 */
export function computeLayout(
  root: LayoutNode | null,
  containerId: string,
  rect: Rect,
  maximizedPanel: PanelId | null = null,
): LayoutGeometry {
  if (!root) return EMPTY_GEOMETRY;

  if (maximizedPanel) {
    const maxGroup = findPanelTabNode(root, maximizedPanel);
    if (maxGroup) {
      return {
        groups: [{ nodeId: maxGroup.id, containerId, node: maxGroup, rect }],
        splitters: [],
      };
    }
  }

  const groups: GroupGeometry[] = [];
  const splitters: SplitterGeometry[] = [];

  const walk = (node: LayoutNode, nodeRect: Rect) => {
    if (node.type === "tabs") {
      groups.push({ nodeId: node.id, containerId, node, rect: nodeRect });
      return;
    }

    const total = node.orientation === "row" ? nodeRect.width : nodeRect.height;
    const count = node.children.length;
    const content = Math.max(0, total - DOCK_GAP * Math.max(count - 1, 0));
    const sum = node.children.reduce(
      (acc, child) =>
        acc + (Number.isFinite(child.size) && child.size > 0 ? child.size : 0),
      0,
    );
    const divisor = sum > 0 ? sum : Math.max(count, 1);

    let offset = 0;
    node.children.forEach((child, index) => {
      const share =
        (Number.isFinite(child.size) && child.size > 0 ? child.size : 0) /
        divisor;
      const length = content * share;

      const childRect: Rect =
        node.orientation === "row"
          ? {
              x: nodeRect.x + offset,
              y: nodeRect.y,
              width: length,
              height: nodeRect.height,
            }
          : {
              x: nodeRect.x,
              y: nodeRect.y + offset,
              width: nodeRect.width,
              height: length,
            };

      walk(child.node, childRect);
      offset += length;

      if (index < count - 1) {
        const gapRect: Rect =
          node.orientation === "row"
            ? {
                x: nodeRect.x + offset,
                y: nodeRect.y,
                width: DOCK_GAP,
                height: nodeRect.height,
              }
            : {
                x: nodeRect.x,
                y: nodeRect.y + offset,
                width: nodeRect.width,
                height: DOCK_GAP,
              };
        splitters.push({
          splitId: node.id,
          containerId,
          index,
          orientation: node.orientation,
          rect: gapRect,
          available: total,
        });
        offset += DOCK_GAP;
      }
    });
  };

  walk(root, rect);
  return { groups, splitters };
}

/** 页签组内容区（标题栏下面、边框里面） */
export function contentRectOf(rect: Rect): Rect {
  return {
    x: rect.x + 1,
    y: rect.y + GROUP_HEADER_HEIGHT,
    width: Math.max(0, rect.width - 2),
    height: Math.max(0, rect.height - GROUP_HEADER_HEIGHT - 1),
  };
}

/** 分割容器的总长度（拖动分割线时换算比例） */
export function splitterAvailable(
  rect: Rect,
  orientation: DockOrientation,
): number {
  return orientation === "row" ? rect.width : rect.height;
}

/* ===================== 落点判定 ===================== */

function clampNumber(value: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.min(Math.max(value, min), max);
}

export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** 点到矩形的最短距离（用于"落在缝隙里"时找最近的面板组） */
export function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 指针落在目标面板的哪个区域。
 *
 * <p>四边各是一条热区，中间是合并区；热区按 64px 折算成比例后夹在 12%–35%，
 * 所以小面板也不会只剩边缘、大面板不用把鼠标拖到很边上。
 */
export function zoneFromPoint(
  point: Point,
  rect: Rect,
  bandPx: number = EDGE_BAND_PX,
): DropZone {
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const relX = clampNumber((point.x - rect.x) / width, 0, 1);
  const relY = clampNumber((point.y - rect.y) / height, 0, 1);

  const bandX = clampNumber(bandPx / width, 0.12, 0.35);
  const bandY = clampNumber(bandPx / height, 0.12, 0.35);

  if (relX > bandX && relX < 1 - bandX && relY > bandY && relY < 1 - bandY) {
    return "center";
  }

  const distances: Array<{ zone: DropZone; distance: number }> = [
    { zone: "left", distance: relX },
    { zone: "right", distance: 1 - relX },
    { zone: "top", distance: relY },
    { zone: "bottom", distance: 1 - relY },
  ];
  distances.sort((a, b) => a.distance - b.distance);
  return distances[0].zone;
}

/** 落点对应的预览矩形（四边各占一半，中心是整块） */
export function indicatorRectForZone(rect: Rect, zone: DropZone): Rect {
  switch (zone) {
    case "left":
      return { x: rect.x, y: rect.y, width: rect.width / 2, height: rect.height };
    case "right":
      return {
        x: rect.x + rect.width / 2,
        y: rect.y,
        width: rect.width / 2,
        height: rect.height,
      };
    case "top":
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height / 2 };
    case "bottom":
      return {
        x: rect.x,
        y: rect.y + rect.height / 2,
        width: rect.width,
        height: rect.height / 2,
      };
    case "center":
    default:
      return rect;
  }
}

/** 指示器上的文字说明 */
export function zoneLabel(zone: DropZone): string {
  switch (zone) {
    case "left":
      return "停靠到左侧";
    case "right":
      return "停靠到右侧";
    case "top":
      return "停靠到上方";
    case "bottom":
      return "停靠到下方";
    case "center":
    default:
      return "合并为页签";
  }
}

/** 一个可被拖放命中的页签组（矩形是停靠表面坐标系） */
export interface GroupHit {
  nodeId: string;
  containerId: string;
  rect: Rect;
  panels: PanelId[];
}

/** 独立窗口的可命中范围（用来把"拖到窗口上"优先于"拖到主区域上"处理） */
export interface WindowHit {
  containerId: string;
  rect: Rect;
  z: number;
}

export interface ResolveDropArgs {
  point: Point;
  dockRect: Rect;
  groups: GroupHit[];
  windows: WindowHit[];
  draggingPanel: PanelId;
}

/**
 * 根据指针位置解析松手后会发生什么。
 *
 * 优先级：最上层独立窗口 > 主区域；都没命中 → `outside = true`（松手变独立窗口）。
 * 指针只在缝隙里、没落在任何组上时，退化为"最近的一组中心"（不制造意外浮窗）。
 */
export function resolveDropTarget({
  point,
  dockRect,
  groups,
  windows,
  draggingPanel,
}: ResolveDropArgs): ResolvedDrop {
  const isNoopGroup = (group: GroupHit) =>
    group.panels.length === 1 && group.panels[0] === draggingPanel;

  const targetOf = (group: GroupHit, zone: DropZone): ResolvedDrop => {
    // 拖到自己单独占用的组上没有任何可做的：不做分割、也不做合并
    if (isNoopGroup(group)) {
      return { target: null, indicator: null, outside: false, zone: null };
    }
    return {
      target: {
        containerId: group.containerId,
        nodeId: group.nodeId,
        zone,
        rect: group.rect,
      },
      indicator: indicatorRectForZone(group.rect, zone),
      outside: false,
      zone,
    };
  };

  // 1) 独立窗口浮在最上层：指针在窗口里就只考虑这个窗口（窗口内部固定合并成页签）
  const windowHits = windows
    .filter((window) => pointInRect(point, window.rect))
    .sort((a, b) => b.z - a.z);
  if (windowHits.length > 0) {
    const topWindow = windowHits[0];
    const windowGroups = groups.filter(
      (group) => group.containerId === topWindow.containerId,
    );
    if (windowGroups.length === 0) {
      return { target: null, indicator: null, outside: false, zone: null };
    }
    const hit =
      windowGroups.find((group) => pointInRect(point, group.rect)) ??
      windowGroups[0];
    return targetOf(hit, "center");
  }

  // 2) 停靠区之外 → 松手成为独立窗口
  if (!pointInRect(point, dockRect)) {
    return { target: null, indicator: null, outside: true, zone: null };
  }

  const dockGroups = groups.filter(
    (group) => group.containerId === DOCK_CONTAINER_ID,
  );

  // 3) 主区域空了：中间落一个新建的页签组
  if (dockGroups.length === 0) {
    return {
      target: {
        containerId: DOCK_CONTAINER_ID,
        nodeId: null,
        zone: "center",
        rect: dockRect,
      },
      indicator: dockRect,
      outside: false,
      zone: "center",
    };
  }

  // 4) 命中某个页签组；只落在缝隙里时找最近的一组按中心处理
  const hit = dockGroups
    .filter((group) => pointInRect(point, group.rect))
    .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)[0];

  if (!hit) {
    const nearest = [...dockGroups].sort(
      (a, b) => distanceToRect(point, a.rect) - distanceToRect(point, b.rect),
    )[0];
    return targetOf(nearest, "center");
  }

  return targetOf(hit, zoneFromPoint(point, hit.rect));
}

/* ===================== 独立窗口 ===================== */

export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** 把窗口矩形夹进停靠表面，并按最小尺寸修正 */
export function clampWindowRect(rect: Rect, surface: Size): Rect {
  const maxWidth = Math.max(surface.width - 8, 160);
  const maxHeight = Math.max(surface.height - 8, 120);
  const width = Math.min(Math.max(rect.width, MIN_WINDOW_WIDTH), maxWidth);
  const height = Math.min(Math.max(rect.height, MIN_WINDOW_HEIGHT), maxHeight);
  return {
    x: clampNumber(rect.x, 0, Math.max(surface.width - width, 0)),
    y: clampNumber(rect.y, 0, Math.max(surface.height - height, 0)),
    width,
    height,
  };
}

/**
 * 新建独立窗口时的矩形：鼠标在哪就在哪附近出现，居中于指针、夹在表面内。
 *
 * @param desired 沿用的面板大小（通常取拖出前的面板内容尺寸）
 * @param pointer 松手位置（表面坐标）；null 时居中显示（用于「浮动」按钮）
 */
export function nextWindowRect(
  desired: Size,
  pointer: Point | null,
  surface: Size,
): Rect {
  const width = Math.min(
    Math.max(desired.width, MIN_WINDOW_WIDTH),
    Math.max(surface.width - 16, 240),
  );
  const height = Math.min(
    Math.max(desired.height, MIN_WINDOW_HEIGHT),
    Math.max(surface.height - 16, 160),
  );
  const centeredX = (surface.width - width) / 2;
  const centeredY = (surface.height - height) / 2;
  return clampWindowRect(
    {
      x: pointer ? pointer.x - width / 2 : centeredX,
      y: pointer ? pointer.y - 22 : centeredY,
      width,
      height,
    },
    surface,
  );
}

/** 拖动窗口的边/角调整大小（夹在表面内、不小于最小尺寸） */
export function resizeWindowRect(
  start: Rect,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  surface: Size,
): Rect {
  const west = direction.includes("w");
  const east = direction.includes("e");
  const north = direction.includes("n");
  const south = direction.includes("s");

  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (west) {
    const maxDelta = start.width - MIN_WINDOW_WIDTH;
    const delta = Math.min(Math.max(dx, -start.x), Math.max(maxDelta, 0));
    x = start.x + delta;
    width = start.width - delta;
  } else if (east) {
    width = Math.max(
      MIN_WINDOW_WIDTH,
      Math.min(start.width + dx, surface.width - start.x),
    );
  }

  if (north) {
    const maxDelta = start.height - MIN_WINDOW_HEIGHT;
    const delta = Math.min(Math.max(dy, -start.y), Math.max(maxDelta, 0));
    y = start.y + delta;
    height = start.height - delta;
  } else if (south) {
    height = Math.max(
      MIN_WINDOW_HEIGHT,
      Math.min(start.height + dy, surface.height - start.y),
    );
  }

  return clampWindowRect({ x, y, width, height }, surface);
}
