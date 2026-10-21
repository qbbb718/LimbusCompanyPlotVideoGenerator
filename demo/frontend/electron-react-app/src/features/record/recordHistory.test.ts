/**
 * 撤销 / 重做历史单测：只锁"什么时候压栈、什么时候合并、弹的是哪一份、重做何时失效"。
 */
import type { Record as PlotRecord } from "@types";
import {
  UNDO_COALESCE_MS,
  UNDO_LIMIT,
  createHistory,
  dropLastHistory,
  historyDepth,
  popHistory,
  popRedo,
  pushHistory,
  redoDepth,
} from "./recordHistory";
import type { EditorSnapshot } from "./recordHistory";

const snap = (tag: string, groups: string[] = []): EditorSnapshot => ({
  records: [{ uuid: tag } as unknown as PlotRecord],
  groups: groups.map((id) => ({ id, name: id, collapsed: false })),
});

const tagOf = (snapshot: EditorSnapshot | null) => snapshot?.records[0].uuid;

describe("撤销历史", () => {
  test("压栈后可以弹回上一步，弹空后返回 null", () => {
    let state = createHistory();
    state = pushHistory(state, snap("A"), 1000);
    state = pushHistory(state, snap("B"), 2000, false);

    const first = popHistory(state);
    expect(tagOf(first.snapshot)).toBe("B");
    state = first.state;

    const second = popHistory(state);
    expect(tagOf(second.snapshot)).toBe("A");
    expect(popHistory(second.state).snapshot).toBeNull();
  });

  test("快照连分组一起存（撤销解散分组不会留下错位状态）", () => {
    let state = createHistory();
    state = pushHistory(state, snap("A", ["g1"]), 1000, false);
    expect(popHistory(state).snapshot?.groups[0].id).toBe("g1");
  });

  test("连续编辑（窗口内）只保留最早那份快照：一次 Ctrl+Z 回到开始编辑前", () => {
    let state = createHistory();
    // 打字：1000 时的快照是"没打字之前"，之后 300ms 内又改了两次
    state = pushHistory(state, snap("before"), 1000, true);
    state = pushHistory(state, snap("typing-1"), 1200, true);
    state = pushHistory(state, snap("typing-2"), 1400, true);

    expect(historyDepth(state)).toBe(1);
    expect(tagOf(popHistory(state).snapshot)).toBe("before");
  });

  test("超过合并窗口后各自成一步", () => {
    let state = createHistory();
    state = pushHistory(state, snap("A"), 1000, true);
    state = pushHistory(state, snap("B"), 1000 + UNDO_COALESCE_MS + 1, true);
    expect(historyDepth(state)).toBe(2);
  });

  test("结构性改动（不合并）永远各自成一步", () => {
    let state = createHistory();
    state = pushHistory(state, snap("A"), 1000, false);
    state = pushHistory(state, snap("B"), 1001, false);
    expect(historyDepth(state)).toBe(2);
  });

  test("空记录 / 未加载不压栈（避免撤销出空白工程）", () => {
    let state = createHistory();
    state = pushHistory(state, { records: [], groups: [] }, 1000);
    state = pushHistory(state, undefined, 2000);
    expect(historyDepth(state)).toBe(0);
  });

  test("超过上限时丢掉最老的快照", () => {
    let state = createHistory();
    for (let i = 0; i < UNDO_LIMIT + 5; i++) {
      state = pushHistory(state, snap(`S${i}`), 1000 + i * 1000, false);
    }
    expect(historyDepth(state)).toBe(UNDO_LIMIT);
    expect(tagOf(popHistory(state).snapshot)).toBe(`S${UNDO_LIMIT + 4}`);
  });

  test("dropLastHistory 用于「已经手动还原」的场景（拖拽 Esc）", () => {
    let state = createHistory();
    state = pushHistory(state, snap("A"), 1000, false);
    expect(historyDepth(dropLastHistory(state))).toBe(0);
    expect(historyDepth(dropLastHistory(createHistory()))).toBe(0);
  });
});

describe("重做（Ctrl+Y）", () => {
  test("撤销再重做，来回都回到正确的状态", () => {
    let state = createHistory();
    state = pushHistory(state, snap("A"), 1000, false); // 改动前 A
    // 当前是 B
    const undo1 = popHistory(state, snap("B"));
    expect(tagOf(undo1.snapshot)).toBe("A");
    state = undo1.state;
    expect(redoDepth(state)).toBe(1);

    const redo1 = popRedo(state, snap("A"));
    expect(tagOf(redo1.snapshot)).toBe("B");
    state = redo1.state;
    expect(redoDepth(state)).toBe(0);
    // 重做之后又能撤销回来
    expect(historyDepth(state)).toBe(1);
  });

  test("连续撤销两步再连续重做两步，顺序正确", () => {
    let state = createHistory();
    state = pushHistory(state, snap("A"), 1000, false);
    state = pushHistory(state, snap("B"), 2000, false);
    // 当前 C
    let step = popHistory(state, snap("C"));
    state = step.state;
    expect(tagOf(step.snapshot)).toBe("B");
    step = popHistory(state, snap("B"));
    state = step.state;
    expect(tagOf(step.snapshot)).toBe("A");

    let back = popRedo(state, snap("A"));
    state = back.state;
    expect(tagOf(back.snapshot)).toBe("B");
    back = popRedo(state, snap("B"));
    state = back.state;
    expect(tagOf(back.snapshot)).toBe("C");
    expect(redoDepth(state)).toBe(0);
  });

  test("撤销之后一旦有新改动，重做栈清空（已经分叉）", () => {
    let state = createHistory();
    state = pushHistory(state, snap("A"), 1000, false);
    state = popHistory(state, snap("B")).state;
    expect(redoDepth(state)).toBe(1);

    // 新改动：结构性（不合并）与连续编辑（合并）都要清空重做
    const structural = pushHistory(state, snap("A"), 5000, false);
    expect(redoDepth(structural)).toBe(0);

    const coalesced = pushHistory(state, snap("A"), 5001, true);
    expect(redoDepth(coalesced)).toBe(0);
  });

  test("没有可重做的内容时返回 null 且状态不变", () => {
    const state = createHistory();
    const result = popRedo(state, snap("X"));
    expect(result.snapshot).toBeNull();
    expect(result.state).toBe(state);
  });

  test("不传 current 时只弹栈、不产生重做项（兼容旧调用）", () => {
    let state = createHistory();
    state = pushHistory(state, snap("A"), 1000, false);
    const undo = popHistory(state);
    expect(tagOf(undo.snapshot)).toBe("A");
    expect(redoDepth(undo.state)).toBe(0);
  });
});
