/**
 * @module 素材页签的批量选择控件
 *
 * 一个页签里只有两处 UI：
 * 1. {@link BatchSelectionBar}：顶部工具条（全选 / 已选计数 / 批量删除 / 取消选择）；
 * 2. {@link BatchCardCheckbox}：每张素材卡片左上角的勾选框。
 *
 * <p>「批量删除」按钮**只在选中了素材时出现**（未选中时工具条上只剩「全选」），
 * 这样它不会和卡片自带的单条「删除」按钮挤在一起，也不会让人误以为能空删。
 *
 * @see useBatchSelection 选中状态的唯一真源（每个页签一份）
 */
import React, { useEffect, useRef } from "react";
import "./BatchSelection.css";

/** 顶部批量操作条 */
export interface BatchSelectionBarProps {
  /** 素材名称（立绘 / 临时图片 / 背景 / 音效）：用于文案与无障碍名称 */
  label: string;
  /** 当前页签里素材总数 */
  total: number;
  /** 已选数量 */
  selectedCount: number;
  /** 全选 / 取消全选 */
  onToggleAll: () => void;
  /** 清空选中 */
  onClear: () => void;
  /** 批量删除（二次确认由调用方负责） */
  onDelete: () => void;
  /**
   * 「点卡片 = 预览定位」的提示文案。
   * 图片类页签（立绘 / 临时图片 / 背景）传，音效页签不传（不与预览联动）。
   */
  previewHint?: string;
}

/**
 * @component 批量操作条
 *
 * <p>「全选」用一个原生复选框表达三态：未选 / 半选（勾了一部分）/ 全选。
 * 半选态只能用 DOM 的 `indeterminate` 表达（JS 里没有对应属性），所以在 effect 里写。
 */
export const BatchSelectionBar: React.FC<BatchSelectionBarProps> = ({
  label,
  total,
  selectedCount,
  onToggleAll,
  onClear,
  onDelete,
  previewHint,
}) => {
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const allSelected = total > 0 && selectedCount === total;

  // 半选态：勾了一部分（全选/未选都不用 indeterminate）
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedCount > 0 && selectedCount < total;
    }
  }, [selectedCount, total]);

  return (
    <div className="batch-bar" role="group" aria-label={`${label}批量操作`}>
      <label
        className="batch-select-all"
        title={
          allSelected
            ? `取消全选（当前 ${total} 个${label}全部勾选）`
            : `全选当前列表里的 ${total} 个${label}`
        }
      >
        <input
          ref={selectAllRef}
          type="checkbox"
          checked={allSelected}
          disabled={total === 0}
          onChange={onToggleAll}
        />
        {allSelected ? "取消全选" : "全选"}
      </label>

      <span className="batch-count">
        已选 {selectedCount} / {total}
      </span>

      {previewHint && <span className="batch-hint">{previewHint}</span>}

      {selectedCount > 0 && (
        <button
          type="button"
          className="batch-delete-btn"
          onClick={onDelete}
          title={`删除勾选的 ${selectedCount} 个${label}（会先弹确认框）`}
        >
          🗑 批量删除（{selectedCount}）
        </button>
      )}

      {selectedCount > 0 && (
        <button
          type="button"
          className="batch-clear-btn"
          onClick={onClear}
          title="清空勾选，不影响素材本身"
        >
          取消选择
        </button>
      )}
    </div>
  );
};

/** 卡片左上角的批量勾选框 */
export interface BatchCardCheckboxProps {
  /** 是否已勾选 */
  checked: boolean;
  /** 无障碍名称（「选择立绘 1」），同时也是 title */
  label: string;
  /** 勾选 / 取消勾选 */
  onToggle: () => void;
}

/**
 * @component 素材卡片上的批量勾选框
 *
 * <p>点它**只改批量选择**，不触发卡片本身的"预览选中"：外层 `<span>` 拦住冒泡，
 * 同时带 `data-card-click-ignore`，即使冒泡到了卡片也会被
 * {@link isInteractiveClickTarget} 认出来。
 */
export const BatchCardCheckbox: React.FC<BatchCardCheckboxProps> = ({
  checked,
  label,
  onToggle,
}) => (
  <span
    className="batch-card-checkbox"
    data-card-click-ignore="1"
    onClick={(event) => event.stopPropagation()}
  >
    <input
      type="checkbox"
      checked={checked}
      aria-label={label}
      title={`${label}（勾选后可批量删除）`}
      onChange={onToggle}
    />
  </span>
);

export default BatchSelectionBar;
