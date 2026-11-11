/**
 * @module 素材页签的批量选择（立绘 / 临时图片 / 背景 / 音效共用）
 *
 * 四个素材页签的批量删除交互完全一样：卡片左上角勾选 → 顶部「全选」→「批量删除」。
 * 这里收口三件容易写歪的小事：
 * 1. **选中态只存下标**，删除后必须清空——下标会整体前移，留着旧下标等于选中了"下一张"；
 * 2. **批量选择与预览选中是两套状态**：勾复选框只改这里，点卡片只改 RecordEditor 的
 *    previewSelection（见 {@link isInteractiveClickTarget} 的说明），互不影响；
 * 3. 换记录 / 列表变短时把越界下标丢掉，避免渲染到一个已经不存在的位置。
 */
import { useCallback, useEffect, useState } from "react";

/**
 * 卡片里"吃掉点击"的元素。
 *
 * <p>卡片本身的 onClick 用来做"预览选中"，但这些控件必须保留原行为：
 * 点删除按钮不能顺手选中预览、拖滑杆、改数值、勾批量删除复选框都不该触发它。
 * `[data-card-click-ignore]` 给没有原生语义的自定义控件留一个口子。
 */
const INTERACTIVE_SELECTOR =
  "button, input, select, textarea, a, [data-card-click-ignore]";

/** 批量选择状态（四个素材页签的卡片都读它） */
export interface BatchSelection {
  /** 已选中的下标（升序；渲染、删除都用这份） */
  indexes: number[];
  /** 已选数量（= indexes.length，写文案方便） */
  count: number;
  /** 这一项被勾选了吗 */
  has: (index: number) => boolean;
  /** 勾上 / 取消某一项 */
  toggle: (index: number) => void;
  /** 全选 / 取消全选（已经全选时清空，否则选中全部） */
  toggleAll: () => void;
  /** 清空选中（删除完成、换记录时调用） */
  clear: () => void;
  /** 当前列表是否全选 */
  allSelected: boolean;
  /** 选了但没全选：给「全选」复选框的半选态用 */
  partiallySelected: boolean;
}

/** 0..total-1 的全部下标 */
const allIndexesOf = (total: number): number[] =>
  Array.from({ length: Math.max(0, total) }, (_, index) => index);

/**
 * @function 批量选择状态
 * @param total    当前页签里素材的总数（列表变短时自动丢掉越界下标）
 * @param resetKey 换记录的标识（记录 uuid）；变化时清空选中
 * @return 选中态与操作
 */
export function useBatchSelection(
  total: number,
  resetKey?: string,
): BatchSelection {
  const [indexes, setIndexes] = useState<number[]>([]);

  // 换记录 = 换了一份素材列表：旧的选中下标没有任何意义
  useEffect(() => {
    setIndexes((previous) => (previous.length === 0 ? previous : []));
  }, [resetKey]);

  // 删掉一条之后 total 变小：越界下标要丢掉，否则会"选中"到别的素材上
  useEffect(() => {
    setIndexes((previous) => {
      const next = previous.filter((index) => index >= 0 && index < total);
      return next.length === previous.length ? previous : next;
    });
  }, [total]);

  const has = useCallback(
    (index: number) => indexes.includes(index),
    [indexes],
  );

  const toggle = useCallback((index: number) => {
    setIndexes((previous) => {
      if (previous.includes(index)) {
        return previous.filter((item) => item !== index);
      }
      return [...previous, index].sort((a, b) => a - b);
    });
  }, []);

  const clear = useCallback(() => setIndexes([]), []);

  const toggleAll = useCallback(() => {
    setIndexes((previous) =>
      previous.length === total && total > 0 ? [] : allIndexesOf(total),
    );
  }, [total]);

  return {
    indexes,
    count: indexes.length,
    has,
    toggle,
    toggleAll,
    clear,
    allSelected: total > 0 && indexes.length === total,
    partiallySelected: indexes.length > 0 && indexes.length < total,
  };
}

/**
 * @function 把要删除的下标收干净
 * @param indexes 用户给出的下标（可能有重复 / 越界 / 小数）
 * @param total   列表长度
 * @return 去重、升序、全部落在 [0, total) 内的下标
 */
export function normalizeIndexes(indexes: number[], total: number): number[] {
  return Array.from(new Set(indexes))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < total)
    .sort((a, b) => a - b);
}

/**
 * @function 这次点击是不是落在卡片里的可交互控件上
 *
 * <p>「点击卡片 = 在预览里选中它」只在卡片本体的空白 / 标题上生效；
 * 卡片里全是编辑器控件（删除按钮、滑杆、数值框、立绘选择、勾选框），
 * 点它们必须保持原有行为，不能被顺手当成"选预览"。
 *
 * @param target 事件目标（React 事件的 event.target）
 * @returns true = 是控件，卡片不要接管这次点击
 */
export function isInteractiveClickTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== "function") return false;
  return element.closest(INTERACTIVE_SELECTOR) !== null;
}

/** 素材卡片可选的"预览选中"联动属性（音效页签不需要，不实现即可） */
export interface VisualPanelLinkProps {
  /**
   * 预览里当前选中的素材下标；null = 本页签没有选中项。
   * 卡片据此画选中态（与批量删除的勾选态分开）。
   */
  activeIndex?: number | null;
  /** 点卡片：请求预览选中这一项并保证可见（见 RecordPreview 的 revealRequest） */
  onSelectVisual?: (index: number) => void;
  /** 删除完成：把删掉的下标告诉上层，让它清掉 / 前移预览选中态 */
  onVisualsRemoved?: (indexes: number[]) => void;
}
