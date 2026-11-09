/**
 * 布局树 / 布局状态纯函数。
 *
 * 这些用例锁住停靠系统最核心的规则：
 * - 分割停靠的方向与顺序（左/上 = 新面板在前）；
 * - 合并页签、移除面板后的收尾（空组消失、单叉分栏提升）；
 * - 每个面板在整份状态里最多出现一次；
 * - 隐藏 = 不在任何布局树里；恢复/拖出/停靠的往返。
 */
import {
  createInitialDockState,
  detachPanelInState,
  dockPanelInState,
  dockWindowInState,
  closeWindowInState,
  hiddenPanelsOf,
  hidePanelInState,
  locatePanel,
  moveWindowInState,
  resizeWindowInState,
  raiseWindowInState,
  setActiveTabInState,
  setSplitSizesInState,
  showPanelInState,
  toggleMaximizeInState,
} from "./dockState";
import {
  collectPanels,
  collectTabNodes,
  createDefaultDockRoot,
  createSplitNode,
  createTabNode,
  findPanelTabNode,
  findTabNode,
  insertPanelIntoTab,
  minSizeOf,
  removePanelFromTree,
  splitFractions,
  splitPairSizes,
  splitTabWithPanel,
} from "./dockTree";
import { DOCK_CONTAINER_ID, DockState, SplitNode } from "./dockTypes";

const tab = (panels: Parameters<typeof createTabNode>[0], active?: Parameters<typeof createTabNode>[1], id?: string) =>
  createTabNode(panels, active, id);

const target = (
  state: DockState,
  panel: Parameters<typeof locatePanel>[1],
  zone: "left" | "right" | "top" | "bottom" | "center",
  rect = { x: 0, y: 0, width: 1000, height: 600 },
) => {
  const placement = locatePanel(state, panel);
  return {
    containerId: DOCK_CONTAINER_ID,
    nodeId: placement.kind === "hidden" ? null : placement.nodeId,
    zone,
    rect,
  } as const;
};

/* ===================== 布局树 ===================== */

describe("布局树：默认布局与查询", () => {
  test("默认布局是「上面左右分预览/属性，下面记录」", () => {
    const root = createDefaultDockRoot();

    expect(root.type).toBe("split");
    expect(root.orientation).toBe("column");
    expect(root.children).toHaveLength(2);

    const top = root.children[0].node as SplitNode;
    expect(top.orientation).toBe("row");
    expect(top.children).toHaveLength(2);

    const groups = collectTabNodes(root);
    expect(groups.map((group) => group.panels)).toEqual([
      ["preview"],
      ["properties"],
      ["records"],
    ]);
    expect(collectPanels(root)).toEqual(["preview", "properties", "records"]);
    expect(findPanelTabNode(root, "records")?.id).toBe(groups[2].id);
    expect(findTabNode(root, "nope")).toBeNull();
  });

  test("按面板最小尺寸累加：左右分栏加宽度、取高度最大值", () => {
    const root = createSplitNode("row", [
      { node: tab(["preview"], "preview") },
      { node: tab(["records"], "records") },
    ]);
    const size = minSizeOf(root);
    // preview 300×200、records 320×150，中间 6px 间隙
    expect(size).toEqual({ width: 300 + 320 + 6, height: 200 });
  });
});

describe("布局树：合并 / 移除", () => {
  test("合并成页签：加入目标组并切到新面板", () => {
    const root = createDefaultDockRoot();
    const withoutPreview = removePanelFromTree(root, "preview")!;
    const properties = findPanelTabNode(withoutPreview, "properties")!;

    const merged = insertPanelIntoTab(withoutPreview, properties.id, "preview");
    const group = findPanelTabNode(merged, "preview")!;

    expect(group.id).toBe(properties.id);
    expect(group.panels).toEqual(["properties", "preview"]);
    expect(group.activePanel).toBe("preview");
    expect(collectTabNodes(merged)).toHaveLength(2);
  });

  test("移除后空组消失、单叉分栏被提升，全部移除返回 null", () => {
    const root = createDefaultDockRoot();

    const withoutPreview = removePanelFromTree(root, "preview")!;
    expect(collectPanels(withoutPreview)).toEqual(["properties", "records"]);
    // 上面那层 row 分割只剩属性，应被提升成一个页签组
    expect((withoutPreview as SplitNode).children[0].node.type).toBe("tabs");

    const withoutBoth = removePanelFromTree(withoutPreview, "properties")!;
    expect(withoutBoth.type).toBe("tabs");
    expect(collectPanels(withoutBoth)).toEqual(["records"]);

    // 最后一块也移除 → 树空
    expect(removePanelFromTree(withoutBoth, "records")).toBeNull();
  });

  test("切换页签只改 activePanel，不重排面板", () => {
    const root = tab(["preview", "properties"], "preview", "group");
    const next = insertPanelIntoTab(root, "group", "preview");
    expect(next).toBe(root);
    const activated = insertPanelIntoTab(root, "group", "properties");
    expect((activated as ReturnType<typeof tab>).activePanel).toBe("properties");
    expect((activated as ReturnType<typeof tab>).panels).toEqual([
      "preview",
      "properties",
    ]);
  });
});

describe("布局树：分割停靠", () => {
  test("右侧分割：目标在前、新面板在后，方向为 row", () => {
    const root = tab(["preview"], "preview", "p");
    const next = splitTabWithPanel(root, "p", "records", "right", 1000) as SplitNode;

    expect(next.type).toBe("split");
    expect(next.orientation).toBe("row");
    expect(collectPanels(next)).toEqual(["preview", "records"]);
    expect(next.children[0].size).toBeCloseTo(0.5, 2);
    expect(next.children[1].size).toBeCloseTo(0.5, 2);
  });

  test("左侧分割：新面板在前；下侧分割方向为 column", () => {
    const root = tab(["preview"], "preview", "p");
    const left = splitTabWithPanel(root, "p", "records", "left", 1000) as SplitNode;
    expect(left.orientation).toBe("row");
    expect(collectPanels(left)).toEqual(["records", "preview"]);

    const below = splitTabWithPanel(root, "p", "properties", "bottom", 800) as SplitNode;
    expect(below.orientation).toBe("column");
    expect(collectPanels(below)).toEqual(["preview", "properties"]);
  });

  test("目标组里已经有这个面板时不做分割（调用方应先移除）", () => {
    const root = tab(["preview"], "preview", "p");
    expect(splitTabWithPanel(root, "p", "preview", "right", 1000)).toBe(root);
  });

  test("分割比例：默认一半；两边最小尺寸放不下时按最小尺寸比例分", () => {
    const preview = tab(["preview"], "preview");
    const records = tab(["records"], "records");

    expect(splitFractions("row", 1000, preview, records)).toEqual([0.5, 0.5]);

    const [a, b] = splitFractions("row", 500, preview, records);
    expect(a + b).toBeCloseTo(1, 5);
    // 300 : 320
    expect(a).toBeCloseTo(300 / 620, 3);
    expect(b).toBeCloseTo(320 / 620, 3);

    // 容器尺寸未知（0）时回落 50/50
    expect(splitFractions("column", 0, preview, records)).toEqual([0.5, 0.5]);
  });
});

describe("布局树：分割线尺寸", () => {
  const split = () =>
    createSplitNode(
      "row",
      [
        { node: tab(["preview"], "preview"), size: 0.5 },
        { node: tab(["properties"], "properties"), size: 0.5 },
      ],
      "split",
    );

  test("拖动时相邻两块重新分配，其余块不变，且不小于各自最小尺寸", () => {
    const root = split();
    // 容器 1000，内容区 994；两边最小 300
    const sizes = splitPairSizes(root, 0, -1000, 1000)!;
    expect(sizes[0]).toBeCloseTo(300 / 994, 3);
    expect(sizes[1]).toBeCloseTo(694 / 994, 3);
    expect(sizes.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 5);

    const forward = splitPairSizes(root, 0, 1000, 1000)!;
    expect(forward[0]).toBeCloseTo(694 / 994, 3);
    expect(forward[1]).toBeCloseTo(300 / 994, 3);
  });

  test("非法下标 / 区域太窄时返回 null，不破坏布局", () => {
    const root = split();
    expect(splitPairSizes(root, 1, 10, 1000)).toBeNull();
    expect(splitPairSizes(root, 0, 10, 0)).toBeNull();
    // 100px 放不下两个 300px 的最小尺寸
    expect(splitPairSizes(root, 0, 10, 100)).toBeNull();
  });
});

/* ===================== 布局状态 ===================== */

describe("布局状态：停靠 / 拖出 / 隐藏", () => {
  test("中心停靠 = 合并成页签，记录被移除后又插回属性组", () => {
    const initial = createInitialDockState();
    const properties = locatePanel(initial, "properties");
    if (properties.kind === "hidden") throw new Error("属性面板应在停靠区");

    const next = dockPanelInState(
      initial,
      "records",
      target(initial, "properties", "center"),
    );

    const records = locatePanel(next, "records");
    expect(records).toEqual({
      kind: "docked",
      nodeId: properties.nodeId,
      active: true,
    });
    expect(hiddenPanelsOf(next)).toEqual([]);
    expect(collectTabNodes(next.dockRoot!)).toHaveLength(2);
  });

  test("左侧停靠：新面板插到目标左侧，目标组仍是独立页签组", () => {
    const initial = createInitialDockState();
    const next = dockPanelInState(
      initial,
      "records",
      target(initial, "preview", "left", { x: 0, y: 0, width: 800, height: 600 }),
    );

    const root = next.dockRoot as SplitNode;
    expect(root.orientation).toBe("row");
    const leftSplit = root.children[0].node as SplitNode;
    expect(leftSplit.orientation).toBe("row");
    expect(collectPanels(leftSplit)).toEqual(["records", "preview"]);
  });

  test("拖出成独立窗口：窗口出现在松手位置并沿用内容尺寸", () => {
    const initial = createInitialDockState();
    const next = detachPanelInState(
      initial,
      "preview",
      { width: 500, height: 400 },
      { x: 600, y: 300 },
      { width: 1200, height: 800 },
    );

    expect(next.windows).toHaveLength(1);
    const window = next.windows[0];
    expect(window.x).toBe(350);
    expect(window.y).toBe(278);
    expect(window.width).toBe(500);
    expect(window.height).toBe(400);
    expect(window.node.panels).toEqual(["preview"]);
    expect(locatePanel(next, "preview")).toEqual({
      kind: "floating",
      windowId: window.id,
      nodeId: window.node.id,
      active: true,
    });
    expect(collectPanels(next.dockRoot!)).toEqual(["properties", "records"]);
    expect(hiddenPanelsOf(next)).toEqual([]);
  });

  test("独立窗口可以停靠回主区域；关闭窗口 = 面板收进隐藏列表", () => {
    const initial = createInitialDockState();
    const detached = detachPanelInState(
      initial,
      "preview",
      { width: 500, height: 400 },
      null,
      { width: 1200, height: 800 },
    );
    const windowId = detached.windows[0].id;

    const docked = dockWindowInState(detached, windowId);
    expect(docked.windows).toHaveLength(0);
    expect(locatePanel(docked, "preview").kind).toBe("docked");
    expect(collectPanels(docked.dockRoot!).sort()).toEqual([
      "preview",
      "properties",
      "records",
    ]);

    const closed = closeWindowInState(detached, windowId);
    expect(closed.windows).toHaveLength(0);
    expect(hiddenPanelsOf(closed)).toEqual(["preview"]);
    expect(locatePanel(closed, "preview")).toEqual({ kind: "hidden" });
  });

  test("隐藏与恢复：恢复后回到主区域，再也不是隐藏状态", () => {
    const initial = createInitialDockState();
    const hidden = hidePanelInState(initial, "records");
    expect(hiddenPanelsOf(hidden)).toEqual(["records"]);
    expect(locatePanel(hidden, "records")).toEqual({ kind: "hidden" });

    const shown = showPanelInState(hidden, "records");
    expect(hiddenPanelsOf(shown)).toEqual([]);
    expect(locatePanel(shown, "records").kind).toBe("docked");
    expect(collectPanels(shown.dockRoot!).sort()).toEqual([
      "preview",
      "properties",
      "records",
    ]);
  });

  test("隐藏最后一个主区域面板 → dockRoot 为 null（页面显示空状态）", () => {
    let state = createInitialDockState();
    state = hidePanelInState(state, "preview");
    state = hidePanelInState(state, "properties");
    state = hidePanelInState(state, "records");

    expect(state.dockRoot).toBeNull();
    expect(hiddenPanelsOf(state)).toEqual(["preview", "properties", "records"]);

    const restored = showPanelInState(state, "properties");
    expect(restored.dockRoot).not.toBeNull();
    expect(hiddenPanelsOf(restored)).toEqual(["preview", "records"]);
  });

  test("浮窗与主区域之间往返：每个面板在整份状态里只出现一次", () => {
    const initial = createInitialDockState();
    const detached = detachPanelInState(
      initial,
      "records",
      { width: 480, height: 320 },
      { x: 200, y: 100 },
      { width: 1200, height: 800 },
    );
    const windowId = detached.windows[0].id;

    const dockedBack = dockPanelInState(detached, "records", target(initial, "preview", "center"));
    expect(dockedBack.windows).toHaveLength(0);

    const panels = [
      ...collectPanels(dockedBack.dockRoot),
      ...dockedBack.windows.flatMap((window) => window.node.panels),
    ];
    expect(panels.sort()).toEqual(["preview", "properties", "records"]);
    expect(windowId).toBeTruthy();
  });
});

describe("布局状态：页签 / 窗口 / 最大化 / 分割", () => {
  test("切换页签会改 activePanel；浮窗会被置顶", () => {
    const initial = createInitialDockState();
    const detached = detachPanelInState(
      initial,
      "preview",
      { width: 480, height: 320 },
      null,
      { width: 1200, height: 800 },
    );
    const windowId = detached.windows[0].id;
    const lowered = resizeWindowInState(detached, windowId, {
      x: 10,
      y: 10,
      width: 480,
      height: 320,
    });
    // 再加一个窗口，让第一个窗口不再是最上层
    const second = detachPanelInState(
      lowered,
      "properties",
      { width: 480, height: 320 },
      null,
      { width: 1200, height: 800 },
    );
    const loweredFirst = second.windows.find((window) => window.id === windowId)!;
    expect(loweredFirst.z).toBe(1);

    // 点页签（即使是当前页签）也要把窗口提到最前
    const raisedByTab = setActiveTabInState(
      second,
      loweredFirst.node.id,
      "preview",
    );
    expect(
      raisedByTab.windows.find((window) => window.id === windowId)!.z,
    ).toBe(Math.max(...raisedByTab.windows.map((window) => window.z)));

    const raised = raiseWindowInState(second, windowId);
    expect(raised.windows.find((window) => window.id === windowId)!.z).toBeGreaterThan(
      raised.windows.find((window) => window.id !== windowId)!.z,
    );

    const activated = setActiveTabInState(
      raised,
      raised.windows.find((window) => window.id === windowId)!.node.id,
      "preview",
    );
    expect(activated.windows.find((window) => window.id === windowId)!.z).toBe(
      Math.max(...activated.windows.map((window) => window.z)),
    );
  });

  test("移动 / 缩放窗口只改位置尺寸", () => {
    const initial = createInitialDockState();
    const detached = detachPanelInState(
      initial,
      "preview",
      { width: 480, height: 320 },
      null,
      { width: 1200, height: 800 },
    );
    const windowId = detached.windows[0].id;

    const moved = moveWindowInState(detached, windowId, 120, 90);
    expect(moved.windows[0]).toMatchObject({ x: 120, y: 90 });

    const resized = resizeWindowInState(moved, windowId, {
      x: 120,
      y: 90,
      width: 640,
      height: 420,
    });
    expect(resized.windows[0]).toMatchObject({
      x: 120,
      y: 90,
      width: 640,
      height: 420,
    });
    expect(resized.windows[0].node.panels).toEqual(["preview"]);
  });

  test("最大化只对主区域面板生效；隐藏/拖出会清掉最大化", () => {
    const initial = createInitialDockState();
    const maximized = toggleMaximizeInState(initial, "preview");
    expect(maximized.maximized).toBe("preview");
    expect(toggleMaximizeInState(maximized, "preview").maximized).toBeNull();

    // 最大化状态下切到另一个面板：最大化目标跟随
    const switched = toggleMaximizeInState(maximized, "records");
    expect(switched.maximized).toBe("records");

    const hidden = hidePanelInState(switched, "records");
    expect(hidden.maximized).toBeNull();

    const detached = detachPanelInState(
      maximized,
      "preview",
      { width: 480, height: 320 },
      null,
      { width: 1200, height: 800 },
    );
    expect(detached.maximized).toBeNull();

    // 浮窗里的面板不能被最大化
    expect(toggleMaximizeInState(detached, "preview").maximized).toBeNull();
  });

  test("分割线尺寸可以写回，非法长度不生效", () => {
    const initial = createInitialDockState();
    const splitId = (initial.dockRoot as SplitNode).id;

    const next = setSplitSizesInState(initial, splitId, [0.3, 0.7]);
    expect((next.dockRoot as SplitNode).children.map((child) => child.size)).toEqual([
      0.3, 0.7,
    ]);

    expect(setSplitSizesInState(initial, splitId, [1])).toBe(initial);
  });
});
