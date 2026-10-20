import React, { useState } from "react";
import { pickScreenColor } from "@features/common/utils/screenColorPicker";
import "./ColorPickerControls.css";

export interface ScreenColorPickerButtonProps {
  /** 吸到颜色时回调（大写 #RRGGBB） */
  onPicked: (color: string) => void;
  /** 默认"屏幕取色（可吸取软件窗口以外的颜色）" */
  title?: string;
  /** 追加的类名（不同面板里的尺寸微调） */
  className?: string;
  disabled?: boolean;
}

/**
 * @component 屏幕取色按钮（吸管）
 *
 * 点击后由主进程打开铺满所有显示器的取色遮罩（`public/color-picker.js`），
 * 可以吸取屏幕上任意位置的颜色，包括本软件窗口以外的区域。
 * 遮罩里单击拾取、Esc / 右键取消；取色期间按钮置灰，避免重复打开。
 */
const ScreenColorPickerButton: React.FC<ScreenColorPickerButtonProps> = ({
  onPicked,
  title = "屏幕取色（可吸取软件窗口以外的颜色）",
  className = "",
  disabled = false,
}) => {
  // 遮罩开着的时候按钮保持"取色中"，防止连点叠出多层遮罩
  const [picking, setPicking] = useState(false);

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (picking) return;

    setPicking(true);
    try {
      const color = await pickScreenColor();
      if (color) {
        onPicked(color);
      }
    } catch (error) {
      console.error("[ScreenColorPickerButton] 屏幕取色失败", error);
      window.alert(
        error instanceof Error ? error.message : "屏幕取色失败，请重试",
      );
    } finally {
      setPicking(false);
    }
  };

  return (
    <button
      type="button"
      className={`screen-color-picker-button${
        picking ? " is-picking" : ""
      }${className ? ` ${className}` : ""}`}
      title={picking ? "取色中…（Esc 或右键取消）" : title}
      aria-label={title}
      aria-busy={picking || undefined}
      disabled={disabled || picking}
      onClick={handleClick}
    >
      {picking ? (
        <span className="screen-color-picker-spinner" aria-hidden="true" />
      ) : (
        <svg
          className="screen-color-picker-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m2 22 1-1h3l9-9" />
          <path d="M3 21v-3l9-9" />
          <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
        </svg>
      )}
    </button>
  );
};

export default ScreenColorPickerButton;
