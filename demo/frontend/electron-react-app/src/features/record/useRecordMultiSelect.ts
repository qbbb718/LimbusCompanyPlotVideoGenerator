/**
 * @module 剧情列表的多选（Ctrl / ⌘ 追加、Shift 连选）
 *
 * 剧情列表的"选中多条"有两个用途，所以状态**不能只留在列表组件里**：
 * 1. 一起拖动（放到某个分组 / 列表最前最后）；
 * 2. 一起改内容（「文本」「特效」页签的批量编辑）。
 *
 * <p>因此选中态由编辑器层（`RecordEditor`）持有，本模块是这个状态的唯一真源：
 * {@link useRecordMultiSelect} 既管"点一行该怎么选"，也管两条容易写歪的同步规则：
 * <ul>
 *   <li><b>跟随当前记录</b>：从预览 / 时间轴 / 导入工程改了"当前记录"时，如果它不在选中集合里，
 *       就把选中集合收成它自己（否则会出现"列表里选着 A/B/C，属性面板在编辑 D"）；</li>
 *   <li><b>丢掉失效的 uuid</b>：记录被删除 / 工程被替换后，选中集合里不能留下已经不存在的 uuid。</li>
 * </ul>
 *
 * <p>选中项的**数量**才是"要不要进批量编辑"的依据：1 条（或 0 条）= 原来的单条编辑，
 * 2 条以上才切到批量面板（见 `properties/BatchTextEditor` 与 `properties/BatchEffectsEditor`）。
 *
 * @see module:record/RecordList 行点击 / 拖动把手把事件转给这里
 * @see module:record/RecordEditor 持有状态并分发给列表与属性页签
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Record } from "@types";

/**
 * @model 一次行点击带的修饰键
 *
 * <p>只取这三个布尔值而不是整个 `React.MouseEvent`：列表的行点击处理与单测里手造的
 * 事件对象都能直接传，不必依赖事件的真实类型。
 */
export interface RecordRowClickModifiers {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/**
 * @model 剧情列表的选中集合
 *
 * <p>`uuids` 是渲染与批量操作唯一读取的数据；`has()` 只是 `includes` 的便捷包装
 * （每行都要问一次，避免在列表里反复 `includes` 长数组）。
 */
export interface RecordMultiSelection {
  /** 已选中的记录 uuid（顺序 = 选中的先后 / Shift 连选时的列表顺序） */
  uuids: string[];
  /** 已选中多少条 */
  count: number;
  /** 这一条在选中集合里吗 */
  has: (uuid: string) => boolean;
  /** 当前列表是否全部选中 */
  allSelected: boolean;
  /**
   * @function 点了一行
   *
   * <p>单击 = 只选它；`Ctrl/⌘` = 追加（已选中则取消）；`Shift` = 从锚点连选到这一行。
   * 三种情况都会把这一行设为"当前记录"（预览与单条属性面板跟着走）。
   */
  clickRow: (
    modifiers: RecordRowClickModifiers,
    record: Record,
    index: number,
  ) => void;
  /** 只选中某一条（批量面板的「只编辑当前记录」、外部同步用） */
  selectOnly: (uuid: string) => void;
  /** 全选 / 取消全选（已经全选时清空） */
  toggleAll: () => void;
  /** 清空选中集合（不影响"当前记录"） */
  clear: () => void;
}

/**
 * @function 剧情列表的多选状态
 *
 * @param records              当前工程的记录（删除 / 导入后据此丢掉失效 uuid）
 * @param selectedRecordIndex  当前记录下标
 * @param setSelectedRecordIndex 改"当前记录"（点行时同步预览与属性面板）
 * @return 选中集合与操作
 */
export function useRecordMultiSelect(
  records: Record[],
  selectedRecordIndex: number,
  setSelectedRecordIndex: (index: number) => void,
): RecordMultiSelection {
  const [uuids, setUuids] = useState<string[]>([]);
  /**
   * Shift 连选的锚点。
   *
   * <p>用 ref 而不是 state：锚点变化不需要重渲染，且 `clickRow` 里要同步读到最新值
   * （state 要等下一轮渲染才更新，连点两下会用到旧锚点）。
   */
  const anchorRef = useRef<string | null>(null);
  /** 最新一次渲染的 records（点行时才需要，避免每次记录变化都重建回调） */
  const recordsRef = useRef<Record[]>(records);
  recordsRef.current = records;

  // 外部切换当前记录（点时间轴、导入工程…）时，让列表的多选跟随它
  const selectedUuid = records?.[selectedRecordIndex]?.uuid;
  useEffect(() => {
    if (!selectedUuid) return;
    setUuids((previous) =>
      previous.includes(selectedUuid) ? previous : [selectedUuid],
    );
  }, [selectedUuid]);

  // 记录被删除 / 替换后，把已经不存在的 uuid 从选择里清掉
  useEffect(() => {
    const valid = new Set((records || []).map((record) => record.uuid));
    setUuids((previous) => {
      const next = previous.filter((uuid) => valid.has(uuid));
      return next.length === previous.length ? previous : next;
    });
  }, [records]);

  const clickRow = useCallback(
    (modifiers: RecordRowClickModifiers, record: Record, index: number) => {
      const current = recordsRef.current || [];

      if (modifiers.shiftKey) {
        // 锚点不在当前选择里（比如刚点过时间轴）时，从当前记录开始连选
        const anchorIndex =
          anchorRef.current && uuids.includes(anchorRef.current)
            ? current.findIndex((item) => item.uuid === anchorRef.current)
            : selectedRecordIndex;
        if (anchorIndex >= 0) {
          const from = Math.min(anchorIndex, index);
          const to = Math.max(anchorIndex, index);
          setUuids(current.slice(from, to + 1).map((item) => item.uuid));
          setSelectedRecordIndex(index);
          return;
        }
      }

      if (modifiers.ctrlKey || modifiers.metaKey) {
        // 追加 / 取消：Ctrl 再点一次已选中的行 = 把它从批量里摘出去。
        // 例外：它是**唯一**选中的一条时不摘——那等于"一条都没选"，
        // 而列表里始终有一条"当前记录"（预览/属性面板在编辑它），空集合只会让人以为卡住了；
        // 想全部取消用列表标题旁的「取消选择」。
        setUuids((previous) => {
          if (!previous.includes(record.uuid)) return [...previous, record.uuid];
          if (previous.length === 1) return previous;
          return previous.filter((uuid) => uuid !== record.uuid);
        });
        anchorRef.current = record.uuid;
        setSelectedRecordIndex(index);
        return;
      }

      setUuids([record.uuid]);
      anchorRef.current = record.uuid;
      setSelectedRecordIndex(index);
    },
    [uuids, selectedRecordIndex, setSelectedRecordIndex],
  );

  const selectOnly = useCallback((uuid: string) => {
    anchorRef.current = uuid;
    setUuids([uuid]);
  }, []);

  const clear = useCallback(() => setUuids([]), []);

  const toggleAll = useCallback(() => {
    const all = recordsRef.current || [];
    setUuids((previous) =>
      previous.length === all.length && all.length > 0
        ? []
        : all.map((record) => record.uuid),
    );
  }, []);

  return {
    uuids,
    count: uuids.length,
    has: useCallback((uuid: string) => uuids.includes(uuid), [uuids]),
    allSelected: (records || []).length > 0 && uuids.length === (records || []).length,
    clickRow,
    selectOnly,
    toggleAll,
    clear,
  };
}
