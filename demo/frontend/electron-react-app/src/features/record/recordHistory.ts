/**
 * @module 撤销 / 重做历史（工程快照栈）
 *
 * 维护"每次改动之前的记录 + 分组"，供 Ctrl+Z 回退、Ctrl+Y 前进。
 *
 * <h3>四个约定</h3>
 * <ul>
 *   <li><b>快照是整份工程</b>（记录数组 + 分组定义）：编辑器的所有改动都走不可变更新
 *       （换数组、换记录对象），所以保存引用就够了，不需要深拷贝；
 *       分组也一起存——否则撤销"解散分组"会留下记录仍带 groupId、分组却已消失的错位状态；</li>
 *   <li><b>连续编辑合并成一步</b>：打字、拖滑杆会在一秒内产生几十次改动，
 *       每次都压栈会让 Ctrl+Z 变成"逐字符撤销"。这里用时间窗口合并——
 *       距离上一次压栈不足 {@link UNDO_COALESCE_MS} 的连续编辑只保留最早那个快照；</li>
 *   <li><b>结构性改动不合并</b>：增删记录、拖排序、分组操作各自成一步；</li>
 *   <li><b>新改动清空重做栈</b>：撤销之后又改了东西，说明已经分叉，"前进"就没有意义了。</li>
 * </ul>
 *
 * <p>结构体 + 纯函数，方便单测；编辑器里用一个 ref 持有 {@link HistoryState}。
 */
import type { Record as PlotRecord } from "@types";
import type { RecordGroup } from "./recordGroups";

/** 一份可回退 / 可重做的工程状态 */
export interface EditorSnapshot {
  records: PlotRecord[];
  groups: RecordGroup[];
}

/** 最多保留多少步（撤销栈与重做栈各自计算） */
export const UNDO_LIMIT = 50;

/**
 * 连续编辑的合并窗口（毫秒）。
 *
 * <p>窗口内多次改动只压一次栈；窗口外的改动各自成一步。
 * 取 500ms 是因为正常打字/拖动的间隔都小于它，而"停下来想一想再改"通常大于它。
 */
export const UNDO_COALESCE_MS = 500;

export interface HistoryState {
  /** 撤销栈：每个元素是"某次改动之前的工程" */
  stack: EditorSnapshot[];
  /** 重做栈：每次撤销时把"撤销之前的样子"压进来，供 Ctrl+Y 前进 */
  redoStack: EditorSnapshot[];
  /** 上一次压栈的时间（用于合并连续编辑） */
  lastPushAt: number;
}

export const createHistory = (): HistoryState => ({
  stack: [],
  redoStack: [],
  lastPushAt: 0,
});

/**
 * 压入一份"改动前"的快照。
 *
 * @param state    当前历史
 * @param snapshot 改动之前的工程状态
 * @param now      当前时间戳（调用方传，方便测试）
 * @param coalesce true = 允许与上一次压栈合并（连续编辑）
 * @returns 新的历史状态（原对象不改动）
 */
export function pushHistory(
  state: HistoryState,
  snapshot: EditorSnapshot | undefined,
  now: number,
  coalesce = false,
): HistoryState {
  // 空工程不压栈：撤销出一个"一条记录都没有"的工程只会让人更困惑
  if (!snapshot || snapshot.records.length === 0) return state;

  // 连续编辑：窗口内已经有了上一步，就沿用那一步之前的状态。
  // 但**任何新改动都会让重做失效**（已经分叉），所以重做栈照样清空。
  if (
    coalesce &&
    state.stack.length > 0 &&
    now - state.lastPushAt < UNDO_COALESCE_MS
  ) {
    return { stack: state.stack, redoStack: [], lastPushAt: now };
  }

  const stack = [...state.stack, snapshot];
  if (stack.length > UNDO_LIMIT) stack.shift();
  return { stack, redoStack: [], lastPushAt: now };
}

/**
 * 撤销：弹出最近一步快照。
 *
 * @param current 撤销**之前**的工程状态；传了才会进重做栈（Ctrl+Y 才能回来）
 * @returns 新的历史状态与要恢复的工程；栈为空时 `snapshot` 为 null
 */
export function popHistory(
  state: HistoryState,
  current?: EditorSnapshot,
): {
  state: HistoryState;
  snapshot: EditorSnapshot | null;
} {
  if (state.stack.length === 0) {
    return { state, snapshot: null };
  }
  const redoStack = current
    ? [...state.redoStack, current].slice(-UNDO_LIMIT)
    : state.redoStack;
  return {
    state: {
      stack: state.stack.slice(0, -1),
      redoStack,
      lastPushAt: 0,
    },
    snapshot: state.stack[state.stack.length - 1],
  };
}

/**
 * 重做：把最近撤销掉的那一步恢复回来。
 *
 * @param current 重做**之前**的工程状态；传了才会回到撤销栈（之后还能再 Ctrl+Z）
 * @returns 新的历史状态与要恢复的工程；重做栈为空时 `snapshot` 为 null
 */
export function popRedo(
  state: HistoryState,
  current?: EditorSnapshot,
): {
  state: HistoryState;
  snapshot: EditorSnapshot | null;
} {
  if (state.redoStack.length === 0) {
    return { state, snapshot: null };
  }
  const stack = current ? [...state.stack, current] : state.stack;
  return {
    state: {
      stack: stack.length > UNDO_LIMIT ? stack.slice(-UNDO_LIMIT) : stack,
      redoStack: state.redoStack.slice(0, -1),
      lastPushAt: 0,
    },
    snapshot: state.redoStack[state.redoStack.length - 1],
  };
}

/**
 * 丢掉最近一步撤销快照。
 *
 * <p>用于"已经手动还原过"的场景：例如拖拽按 Esc 取消，编辑器已经写回了拖动起点，
 * 栈顶那份快照就等于当前状态，留着会让下一次 Ctrl+Z 变成空操作。
 * 重做栈不受影响（手动还原也属于"改动"之外的操作）。
 */
export function dropLastHistory(state: HistoryState): HistoryState {
  if (state.stack.length === 0) return state;
  return { stack: state.stack.slice(0, -1), redoStack: state.redoStack, lastPushAt: 0 };
}

/** 当前可撤销的步数 */
export const historyDepth = (state: HistoryState): number => state.stack.length;

/** 当前可重做的步数 */
export const redoDepth = (state: HistoryState): number => state.redoStack.length;
