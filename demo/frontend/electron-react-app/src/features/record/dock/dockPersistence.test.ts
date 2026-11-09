/**
 * 布局持久化：正常往返、坏数据清理、版本不符回落默认。
 */
import {
  DOCK_STORAGE_VERSION,
  DockStorage,
  loadDockState,
  parseDockState,
  saveDockState,
  serializeDockState,
} from "./dockPersistence";
import {
  createInitialDockState,
  detachPanelInState,
  hiddenPanelsOf,
  hidePanelInState,
} from "./dockState";
import { collectPanels } from "./dockTree";
import type { SplitNode } from "./dockTypes";

const memoryStorage = (): DockStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
};

describe("serialize / parse", () => {
  test("默认布局可以原样往返", () => {
    const state = createInitialDockState();
    const raw = JSON.parse(JSON.stringify(serializeDockState(state))) as unknown;
    expect(parseDockState(raw)).toEqual(state);
  });

  test("独立窗口 + 隐藏面板可以原样往返", () => {
    const state = hidePanelInState(createInitialDockState(), "records");
    const detached = detachPanelInState(
      state,
      "preview",
      { width: 500, height: 400 },
      { x: 300, y: 200 },
      { width: 1200, height: 800 },
    );

    const raw = JSON.parse(JSON.stringify(serializeDockState(detached))) as unknown;
    const parsed = parseDockState(raw)!;

    expect(parsed).toEqual(detached);
    expect(hiddenPanelsOf(parsed)).toEqual(["records"]);
    expect(collectPanels(parsed.dockRoot!)).toEqual(["properties"]);
  });

  test("版本不符 / 非对象 / 坏值直接返回 null", () => {
    expect(parseDockState(null)).toBeNull();
    expect(parseDockState("nope")).toBeNull();
    expect(parseDockState({})).toBeNull();
    expect(
      parseDockState({
        version: DOCK_STORAGE_VERSION + 1,
        dockRoot: null,
        windows: [],
        maximized: null,
      }),
    ).toBeNull();
  });

  test("全部面板都隐藏也是合法状态（不应回落默认布局）", () => {
    const parsed = parseDockState({
      version: DOCK_STORAGE_VERSION,
      dockRoot: null,
      windows: [],
      maximized: null,
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.dockRoot).toBeNull();
    expect(hiddenPanelsOf(parsed!)).toEqual(["preview", "properties", "records"]);
  });
});

describe("坏数据清理", () => {
  test("未知面板、重复面板、空页签组都被清掉，第一个出现的保留", () => {
    const parsed = parseDockState({
      version: DOCK_STORAGE_VERSION,
      dockRoot: {
        type: "tabs",
        id: "t1",
        panels: ["preview", "preview", "bogus"],
        activePanel: "bogus",
      },
      windows: [
        {
          id: "w1",
          node: {
            type: "tabs",
            id: "t2",
            panels: ["preview", "records"],
            activePanel: "records",
          },
          x: 10,
          y: 20,
          width: 500,
          height: 400,
          z: 9,
        },
        { id: "w2", node: { type: "tabs", id: "t3", panels: ["records"] } },
      ],
      maximized: "records",
    })!;

    expect(parsed.dockRoot).toMatchObject({
      type: "tabs",
      panels: ["preview"],
      activePanel: "preview",
    });
    // 窗口 1 里 preview 已被占用 → 只剩 records；窗口 2 的 records 也重复 → 整窗丢弃
    expect(parsed.windows).toHaveLength(1);
    expect(parsed.windows[0].node.panels).toEqual(["records"]);
    expect(parsed.windows[0].z).toBe(1);
    // 最大化面板在浮窗里 → 清掉
    expect(parsed.maximized).toBeNull();
  });

  test("单叉分栏被提升，未知方向/空 children 的节点被丢弃", () => {
    const parsed = parseDockState({
      version: DOCK_STORAGE_VERSION,
      dockRoot: {
        type: "split",
        id: "s1",
        orientation: "row",
        children: [
          {
            id: "c1",
            size: 1,
            node: { type: "tabs", id: "t1", panels: ["preview"] },
          },
          {
            id: "c2",
            size: 1,
            node: {
              type: "split",
              id: "bad",
              orientation: "diagonal",
              children: [],
            },
          },
        ],
      },
      windows: [],
      maximized: "preview",
    })!;

    expect(parsed.dockRoot).toMatchObject({
      type: "tabs",
      panels: ["preview"],
    });
    expect(parsed.maximized).toBe("preview");
  });

  test("重复的节点 id 会被重新分配（避免 React key / 命中矩形打架）", () => {
    const parsed = parseDockState({
      version: DOCK_STORAGE_VERSION,
      dockRoot: {
        type: "split",
        id: "same-split",
        orientation: "row",
        children: [
          {
            id: "same-cell",
            size: 0.5,
            node: { type: "tabs", id: "same-tab", panels: ["preview"] },
          },
          {
            id: "same-cell",
            size: 0.5,
            node: { type: "tabs", id: "same-tab", panels: ["properties"] },
          },
        ],
      },
      windows: [],
      maximized: null,
    })!;

    const root = parsed.dockRoot as SplitNode;
    expect(root.children[0].id).not.toBe(root.children[1].id);
    expect(root.children[0].node.id).not.toBe(root.children[1].node.id);
  });

  test("独立窗口里的分割节点会被摊平成一个页签组", () => {    const parsed = parseDockState({
      version: DOCK_STORAGE_VERSION,
      dockRoot: null,
      windows: [
        {
          id: "w1",
          node: {
            type: "split",
            id: "s",
            orientation: "row",
            children: [
              {
                id: "c1",
                size: 0.5,
                node: { type: "tabs", id: "t1", panels: ["preview"] },
              },
              {
                id: "c2",
                size: 0.5,
                node: {
                  type: "tabs",
                  id: "t2",
                  panels: ["properties"],
                  activePanel: "properties",
                },
              },
            ],
          },
          x: 0,
          y: 0,
          width: 600,
          height: 400,
          z: 2,
        },
      ],
      maximized: null,
    })!;

    expect(parsed.windows).toHaveLength(1);
    expect(parsed.windows[0].node.type).toBe("tabs");
    expect(parsed.windows[0].node.panels).toEqual(["preview", "properties"]);
  });
});

describe("load / save", () => {
  test("写入后能读回；坏 JSON 返回 null", () => {
    const storage = memoryStorage();
    const state = createInitialDockState();

    saveDockState(storage, "k", state);
    expect(loadDockState(storage, "k")).toEqual(state);

    storage.data.set("k", "{not-json");
    expect(loadDockState(storage, "k")).toBeNull();

    expect(loadDockState(null, "k")).toBeNull();
  });

  test("没有存过 / 版本不符时返回 null（交给调用方用默认布局）", () => {
    const storage = memoryStorage();
    expect(loadDockState(storage, "missing")).toBeNull();

    storage.data.set(
      "old",
      JSON.stringify({ version: 0, dockRoot: null, windows: [], maximized: null }),
    );
    expect(loadDockState(storage, "old")).toBeNull();
  });
});
