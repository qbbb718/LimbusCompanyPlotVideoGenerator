/**
 * 停靠几何：布局矩形摊平、四边/中心落点、独立窗口夹紧与缩放。
 */
import {
  clampWindowRect,
  computeLayout,
  contentRectOf,
  indicatorRectForZone,
  nextWindowRect,
  resizeWindowRect,
  resolveDropTarget,
  zoneFromPoint,
  type GroupHit,
} from "./dockGeometry";
import { createDefaultDockRoot } from "./dockTree";
import { DOCK_CONTAINER_ID, PanelId, Rect } from "./dockTypes";

const surface = { width: 1200, height: 800 };
const dockRect: Rect = { x: 0, y: 0, ...surface };

const group = (
  nodeId: string,
  rect: Rect,
  panels: PanelId[] = [nodeId as PanelId],
  containerId = DOCK_CONTAINER_ID,
): GroupHit => ({ nodeId, containerId, rect, panels });

describe("computeLayout", () => {
  test("默认布局：三个组件矩形 + 两条分割线，按比例分配并扣掉间隙", () => {
    const layout = computeLayout(createDefaultDockRoot(), DOCK_CONTAINER_ID, dockRect);

    expect(layout.groups.map((item) => item.nodeId)).toHaveLength(3);
    expect(layout.splitters).toHaveLength(2);

    const [preview, properties, records] = layout.groups;
    const topHeight = (800 - 6) * 0.47;
    const topWidth = (1200 - 6) * 0.58;

    expect(preview.rect).toMatchObject({ x: 0, y: 0 });
    expect(preview.rect.height).toBeCloseTo(topHeight, 4);
    expect(properties.rect.x).toBeCloseTo(topWidth + 6, 4);
    expect(properties.rect.width).toBeCloseTo(1200 - 6 - topWidth, 4);
    expect(records.rect.y).toBeCloseTo(topHeight + 6, 4);
    expect(records.rect.height).toBeCloseTo(800 - 6 - topHeight, 4);
    expect(records.rect.width).toBeCloseTo(1200, 4);

    const rowSplitter = layout.splitters.find((item) => item.orientation === "row")!;
    expect(rowSplitter.rect).toMatchObject({ x: topWidth, y: 0, width: 6 });
    expect(rowSplitter.rect.height).toBeCloseTo(topHeight, 4);
    expect(rowSplitter.available).toBeCloseTo(1200, 4);

    const columnSplitter = layout.splitters.find(
      (item) => item.orientation === "column",
    )!;
    expect(columnSplitter.rect).toMatchObject({ x: 0, y: topHeight, width: 1200, height: 6 });
  });

  test("最大化：只返回目标组并铺满容器，没有分割线", () => {
    const layout = computeLayout(
      createDefaultDockRoot(),
      DOCK_CONTAINER_ID,
      dockRect,
      "properties",
    );

    expect(layout.groups).toHaveLength(1);
    expect(layout.groups[0].node.panels).toEqual(["properties"]);
    expect(layout.groups[0].rect).toEqual(dockRect);
    expect(layout.splitters).toHaveLength(0);
  });

  test("空树 / 未知容器返回空几何", () => {
    expect(computeLayout(null, DOCK_CONTAINER_ID, dockRect)).toEqual({
      groups: [],
      splitters: [],
    });
  });

  test("正文区在标题栏下方、边框以内", () => {
    expect(contentRectOf({ x: 10, y: 20, width: 300, height: 200 })).toEqual({
      x: 11,
      y: 50,
      width: 298,
      height: 169,
    });
    // 面板比标题栏还矮时高度夹到 0，不出现负数
    expect(contentRectOf({ x: 0, y: 0, width: 100, height: 20 }).height).toBe(0);
  });
});

describe("zoneFromPoint：四边 + 中心", () => {
  const rect: Rect = { x: 0, y: 0, width: 400, height: 300 };

  test("中间是合并区，四边是分割区", () => {
    expect(zoneFromPoint({ x: 200, y: 150 }, rect)).toBe("center");
    expect(zoneFromPoint({ x: 10, y: 150 }, rect)).toBe("left");
    expect(zoneFromPoint({ x: 390, y: 150 }, rect)).toBe("right");
    expect(zoneFromPoint({ x: 200, y: 10 }, rect)).toBe("top");
    expect(zoneFromPoint({ x: 200, y: 290 }, rect)).toBe("bottom");
    // 角落：按归一化距离更近的那条边
    expect(zoneFromPoint({ x: 5, y: 5 }, rect)).toBe("left");
  });

  test("边缘热区按 64px 折算，但在面板宽高的 12%–35% 之间", () => {
    // 很宽的面板：64px 不到 12% 宽度 → 至少 12%
    const wide: Rect = { x: 0, y: 0, width: 1000, height: 300 };
    expect(zoneFromPoint({ x: 100, y: 150 }, wide)).toBe("left");
    expect(zoneFromPoint({ x: 200, y: 150 }, wide)).toBe("center");

    // 很窄的面板：最多 35%，中间仍然留出 30% 的合并区
    const narrow: Rect = { x: 0, y: 0, width: 100, height: 300 };
    expect(zoneFromPoint({ x: 30, y: 150 }, narrow)).toBe("left");
    expect(zoneFromPoint({ x: 50, y: 150 }, narrow)).toBe("center");
  });

  test("指示器矩形：左/上各占一半，中心是整块", () => {
    expect(indicatorRectForZone(rect, "left")).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 300,
    });
    expect(indicatorRectForZone(rect, "top")).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 150,
    });
    expect(indicatorRectForZone(rect, "center")).toEqual(rect);
  });
});

describe("resolveDropTarget", () => {
  const previewGroup = group("preview", { x: 0, y: 0, width: 500, height: 300 });
  const propertiesGroup = group("properties", {
    x: 506,
    y: 0,
    width: 494,
    height: 300,
  });
  const dockGroups = [previewGroup, propertiesGroup];

  test("停靠区内：按指针相对目标的位置给四边/中心", () => {
    const center = resolveDropTarget({
      point: { x: 250, y: 150 },
      dockRect,
      groups: dockGroups,
      windows: [],
      draggingPanel: "records",
    });
    expect(center.outside).toBe(false);
    expect(center.target).toMatchObject({
      containerId: DOCK_CONTAINER_ID,
      nodeId: "preview",
      zone: "center",
    });
    expect(center.indicator).toEqual({ x: 0, y: 0, width: 500, height: 300 });

    const left = resolveDropTarget({
      point: { x: 10, y: 150 },
      dockRect,
      groups: dockGroups,
      windows: [],
      draggingPanel: "records",
    });
    expect(left.target?.zone).toBe("left");
    expect(left.indicator).toEqual({ x: 0, y: 0, width: 250, height: 300 });
  });

  test("停靠区外：outside=true（松手成为独立窗口）", () => {
    const resolved = resolveDropTarget({
      point: { x: 1500, y: 150 },
      dockRect,
      groups: dockGroups,
      windows: [],
      draggingPanel: "records",
    });
    expect(resolved.outside).toBe(true);
    expect(resolved.target).toBeNull();
    expect(resolved.indicator).toBeNull();
  });

  test("拖到自己单独占用的组上：无效目标，但不算拖出", () => {
    const resolved = resolveDropTarget({
      point: { x: 250, y: 150 },
      dockRect,
      groups: dockGroups,
      windows: [],
      draggingPanel: "preview",
    });
    expect(resolved.target).toBeNull();
    expect(resolved.outside).toBe(false);
  });

  test("主区域空了：给一个 nodeId=null 的目标，表示新建根组", () => {
    const resolved = resolveDropTarget({
      point: { x: 300, y: 300 },
      dockRect,
      groups: [],
      windows: [],
      draggingPanel: "preview",
    });
    expect(resolved.outside).toBe(false);
    expect(resolved.target).toMatchObject({
      containerId: DOCK_CONTAINER_ID,
      nodeId: null,
      zone: "center",
    });
  });

  test("独立窗口优先级高于主区域，且一律合并成页签", () => {
    const windowRect: Rect = { x: 100, y: 100, width: 300, height: 300 };
    const windowGroup = group("win-tab", windowRect, ["records"], "window-1");
    const resolved = resolveDropTarget({
      point: { x: 250, y: 250 },
      dockRect,
      groups: [...dockGroups, windowGroup],
      windows: [{ containerId: "window-1", rect: windowRect, z: 3 }],
      draggingPanel: "preview",
    });

    expect(resolved.outside).toBe(false);
    expect(resolved.target).toMatchObject({
      containerId: "window-1",
      nodeId: "win-tab",
      zone: "center",
    });
    expect(resolved.indicator).toEqual(windowRect);
  });

  test("落在两个组之间的缝隙里：退化为最近一组的中心，不制造浮窗", () => {
    const resolved = resolveDropTarget({
      point: { x: 502, y: 150 },
      dockRect,
      groups: dockGroups,
      windows: [],
      draggingPanel: "records",
    });
    expect(resolved.outside).toBe(false);
    expect(resolved.target?.nodeId).toBe("preview");
    expect(resolved.target?.zone).toBe("center");
  });
});

describe("独立窗口几何", () => {
  test("clampWindowRect：拉回表面内并保证最小尺寸", () => {
    expect(
      clampWindowRect({ x: -100, y: -50, width: 100, height: 100 }, surface),
    ).toEqual({ x: 0, y: 0, width: 320, height: 220 });

    expect(
      clampWindowRect({ x: 900, y: 500, width: 400, height: 300 }, surface),
    ).toEqual({ x: 800, y: 500, width: 400, height: 300 });

    expect(
      clampWindowRect({ x: 0, y: 0, width: 5000, height: 5000 }, surface),
    ).toEqual({ x: 0, y: 0, width: 1192, height: 792 });
  });

  test("nextWindowRect：围绕指针出现，夹进表面；无指针时居中", () => {
    expect(
      nextWindowRect(
        { width: 500, height: 400 },
        { x: 600, y: 300 },
        surface,
      ),
    ).toEqual({ x: 350, y: 278, width: 500, height: 400 });

    expect(nextWindowRect({ width: 500, height: 400 }, null, surface)).toEqual({
      x: 350,
      y: 200,
      width: 500,
      height: 400,
    });

    expect(
      nextWindowRect({ width: 500, height: 400 }, { x: 10, y: 10 }, surface),
    ).toEqual({ x: 0, y: 0, width: 500, height: 400 });
  });

  test("resizeWindowRect：拖边/角按方向改尺寸，且不小于最小值", () => {
    const start: Rect = { x: 100, y: 100, width: 500, height: 400 };

    expect(resizeWindowRect(start, "e", 50, 0, surface)).toEqual({
      x: 100,
      y: 100,
      width: 550,
      height: 400,
    });
    expect(resizeWindowRect(start, "w", 50, 0, surface)).toEqual({
      x: 150,
      y: 100,
      width: 450,
      height: 400,
    });
    expect(resizeWindowRect(start, "w", -1000, 0, surface)).toEqual({
      x: 0,
      y: 100,
      width: 600,
      height: 400,
    });
    expect(resizeWindowRect(start, "n", 0, -1000, surface)).toEqual({
      x: 100,
      y: 0,
      width: 500,
      height: 500,
    });
    expect(resizeWindowRect(start, "e", -1000, 0, surface)).toEqual({
      x: 100,
      y: 100,
      width: 320,
      height: 400,
    });
    expect(resizeWindowRect(start, "se", 5000, 5000, surface)).toEqual({
      x: 100,
      y: 100,
      width: 1100,
      height: 700,
    });
  });
});
