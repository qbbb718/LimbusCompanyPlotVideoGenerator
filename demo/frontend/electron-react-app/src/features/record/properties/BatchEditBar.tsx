/**
 * @module 批量编辑的公共外壳（说明条 + 结果反馈）
 *
 * <p>「文本」和「特效」两个批量面板长得一样的第一屏：一枚「批量编辑」徽标、已选中多少条、
 * 一句"会改到什么"的说明，以及右侧的「只编辑当前记录」（= 退出批量）。
 * 每个动作的结果（"已修改 3 条" / "没有变化"）也显示在这里 —— 批量改动一次可能动几十条，
 * 没有反馈的话用户完全不知道点下去有没有生效。
 *
 * @see module:properties/BatchTextEditor
 * @see module:properties/BatchEffectsEditor
 */
import React, { useCallback, useState } from "react";

/** 一条操作结果反馈 */
export interface BatchEditStatus {
  /** success = 真的改了；info = 没有可改的（不是错误，用中性灰） */
  kind: "success" | "info";
  /** 给用户看的一句话 */
  text: string;
}

/** 顶部说明条 */
export interface BatchEditBarProps {
  /** 选中的记录条数 */
  count: number;
  /** 这批改动会写到哪几条上 / 算几步撤销 */
  hint: string;
  /** 额外的一行提示（比如"其中 2 条自由文本会被跳过"）；没有就不显示 */
  note?: string;
  /** 最近一次操作的结果 */
  status?: BatchEditStatus | null;
  /** 只编辑当前记录（退出批量） */
  onExit: () => void;
}

/**
 * @component 批量编辑说明条
 */
export const BatchEditBar: React.FC<BatchEditBarProps> = ({
  count,
  hint,
  note,
  status,
  onExit,
}) => (
  <div className="batch-edit-bar" role="group" aria-label="批量编辑">
    <div className="batch-edit-head">
      <span className="batch-edit-badge">批量编辑</span>
      <span className="batch-edit-count">已选中 {count} 条记录</span>
      <button
        type="button"
        className="batch-edit-exit"
        onClick={onExit}
        title="清掉多选，回到只编辑当前记录的面板"
      >
        只编辑当前记录
      </button>
    </div>
    <p className="batch-edit-hint">{hint}</p>
    {note && <p className="batch-edit-note">{note}</p>}
    {status && (
      <p className={`batch-edit-status ${status.kind}`} role="status">
        {status.text}
      </p>
    )}
  </div>
);

/**
 * @function 批量操作的结果反馈状态
 *
 * <p>只在本地留**最后一次**结果：不做自动消失的定时器（面板一换选中集合就整体重挂，
 * 旧结果自然作废），这样也不会有"卸载后还在 setState"的麻烦。
 *
 * @return 当前结果与一个上报函数
 */
export function useBatchEditStatus(): {
  status: BatchEditStatus | null;
  report: (text: string, kind?: BatchEditStatus["kind"]) => void;
} {
  const [status, setStatus] = useState<BatchEditStatus | null>(null);

  const report = useCallback(
    (text: string, kind: BatchEditStatus["kind"] = "success") => {
      setStatus({ kind, text });
    },
    [],
  );

  return { status, report };
}

export default BatchEditBar;
