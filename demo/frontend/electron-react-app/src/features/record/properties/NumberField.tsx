import React, { useState } from "react";

interface NumberFieldProps {
  /** 当前值（父组件状态） */
  value: number;
  /** 能解析成数字时立即回调；空串 / "-" / "2." 这类中间态不会回写 */
  onChange: (value: number) => void;
  /** 最小值（含）；缺省表示不限制 */
  min?: number;
  /** 最大值（含）；缺省表示不限制 */
  max?: number;
  /** 是否只允许整数（坐标用 true，缩放用 false） */
  integer?: boolean;
  className?: string;
  ariaLabel?: string;
  title?: string;
}

/** 按约束归一化：先取整（如需），再夹到 [min, max] */
const normalizeValue = (
  raw: number,
  { min, max, integer }: Pick<NumberFieldProps, "min" | "max" | "integer">,
): number => {
  let next = integer ? Math.round(raw) : raw;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
};

/**
 * 受控数字输入框（缩放 / X、Y 坐标用）。
 *
 * <p>为什么用 text 而不是 number：
 * <ul>
 *   <li>{@code input[type=number]} 会把 "-"、"2." 这类输入中间态净化成空串，
 *       受控组件每次都按净化后的值重渲染，于是负数和小数根本敲不进去
 *       （只剩滑杆能调，而背景位置要求能输入任意大的负偏移）；</li>
 *   <li>这里在编辑期间保留用户的原始文本（draft），只在能解析成数字时把值回写给父组件，
 *       失焦时再按约束归一化一次并清掉 draft，重新显示父组件的权威值。</li>
 * </ul>
 * 因此粘贴 / 手输小数、负数、超出滑杆范围的位置都没问题；数字增减由旁边的滑杆负责。
 */
const NumberField: React.FC<NumberFieldProps> = ({
  value,
  onChange,
  min,
  max,
  integer = false,
  className,
  ariaLabel,
  title,
}) => {
  // null 表示"没有正在编辑的草稿"，此时显示父组件的值
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft ?? String(value);

  /** 把输入框文本提交给父组件（无法解析的中间态直接忽略） */
  const commitText = (text: string) => {
    if (text.trim() === "") return;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return;

    const next = normalizeValue(parsed, { min, max, integer });
    if (next !== value) onChange(next);
  };

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      autoComplete="off"
      className={className}
      value={displayValue}
      aria-label={ariaLabel}
      title={title}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        commitText(text);
      }}
      onBlur={() => {
        if (draft !== null) commitText(draft);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        // 回车等同失焦：归一化并结束编辑，方便连续输入
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
};

export default NumberField;
