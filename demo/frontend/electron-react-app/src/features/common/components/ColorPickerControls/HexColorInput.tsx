import React, { useEffect, useRef, useState } from "react";
import { normalizeHexColor } from "@features/common/utils/color";
import "./ColorPickerControls.css";

export interface HexColorInputProps {
  /** 当前生效的颜色（#RRGGBB 或 #RGB）；外部变化（拖动色板 / 取色器 / 切换记录）会覆盖输入草稿 */
  value: string;
  /** 输入了合法颜色时回调，参数已规范成大写 #RRGGBB */
  onCommit: (color: string) => void;
  /** 无障碍标签（读屏用），默认"十六进制颜色" */
  ariaLabel?: string;
  /** 追加的类名（输入框宽度等由所在面板的样式决定） */
  className?: string;
  /** 鼠标悬停提示 */
  title?: string;
  disabled?: boolean;
}

/**
 * @component 十六进制颜色输入框
 *
 * 用来在颜色面板里直接手输颜色编码（例如 `#FF8800`、`FF8800`、`#F80`）。
 * 输入过程中的提交时机是特意分开的：
 * - 6 位写法（#RRGGBB）一凑齐就立即提交，边输边在面板里看效果；
 * - 3 位简写（#RGB）虽然也是合法颜色，但它同时是 6 位输入的前缀，
 *   边输边提交会把「FF0」提前变成「#FF0000」，所以只在回车 / 失焦时提交；
 * - 其它中间状态（「#FF」、「#FFFFFFF」等）标红但不提交，失焦后回退到当前生效的颜色。
 */
const HexColorInput: React.FC<HexColorInputProps> = ({
  value,
  onCommit,
  ariaLabel = "十六进制颜色",
  className = "",
  title = "输入十六进制颜色，如 #FF8800",
  disabled = false,
}) => {
  // 正在输入的原文；null 表示没有草稿，直接显示外部颜色
  const [draft, setDraft] = useState<string | null>(null);
  // 草稿不是合法颜色时把输入框标红
  const [invalid, setInvalid] = useState(false);
  // 回车 / Esc 处理完之后紧接着会触发一次 blur，这个标记用来跳过那次重复处理
  const skipBlurRef = useRef(false);

  // 外部颜色变了（色板拖动、吸管取色、切换记录）就丢弃草稿，避免显示过期输入
  useEffect(() => {
    setDraft(null);
    setInvalid(false);
  }, [value]);

  const resetDraft = () => {
    setDraft(null);
    setInvalid(false);
  };

  /** 尝试提交一个颜色；不合法返回 false（调用方决定是回退还是继续等用户输入） */
  const commit = (raw: string): boolean => {
    const normalized = normalizeHexColor(raw);
    if (!normalized) return false;
    resetDraft();
    onCommit(normalized);
    return true;
  };

  const handleChange = (raw: string) => {
    setDraft(raw);

    const normalized = normalizeHexColor(raw);
    const digits = raw.trim().replace(/^#/, "");
    setInvalid(digits.length > 0 && !normalized);

    // 6 位完整写法边输边生效；3 位简写等回车 / 失焦再提交（见组件注释）
    if (normalized && digits.length === 6) {
      onCommit(normalized);
    }
  };

  const handleBlur = () => {
    // 回车 / Esc 已经处理过这次输入，紧接着触发的失焦不要再提交一遍
    // （Esc 的语义是"放弃草稿"，而 blur 里的 draft 还是旧值，不跳过就会把草稿又提交上去）
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    if (draft === null) return;
    // 失焦时：合法就提交，不合法就回退到当前生效的颜色
    if (!commit(draft)) {
      resetDraft();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (draft !== null && !commit(draft)) {
        resetDraft();
      }
      skipBlurRef.current = true;
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      resetDraft();
      skipBlurRef.current = true;
      event.currentTarget.blur();
    }
  };

  const displayValue = draft !== null ? draft : (value || "").toUpperCase();

  return (
    <input
      type="text"
      className={`hex-color-input${invalid ? " is-invalid" : ""}${
        className ? ` ${className}` : ""
      }`}
      value={displayValue}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      title={title}
      spellCheck={false}
      autoComplete="off"
      disabled={disabled}
    />
  );
};

export default HexColorInput;
