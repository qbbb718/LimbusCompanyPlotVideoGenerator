import React from "react";
import { HexColorPicker } from "react-colorful";
import {
  HexColorInput,
  ScreenColorPickerButton,
} from "@features/common/components/ColorPickerControls";
import { normalizeHexColor } from "@features/common/utils/color";

interface ColorPickerProps {
  label: string;
  color: string;
  onChange: (color: string) => void;
  showPicker: boolean;
  onTogglePicker: () => void;
}

/**
 * 颜色选择器解析不了颜色时的兜底色（例如库里存了旧格式的 "R,G,B" 字符串）。
 * react-colorful 直接拿到非法颜色会算出一堆 NaN，色板就点不动了。
 */
const FALLBACK_PICKER_COLOR = "#FFFFFF";

/**
 * @component 名片颜色面板
 * 角色编辑里的"名片文字颜色 / 名片背景颜色"共用，包含：
 * - 十六进制输入框（#RGB / #RRGGBB，输入合法值立即生效）
 * - 色块（点开色板）
 * - 吸管（吸取屏幕上任意位置的颜色，包括软件窗口以外）
 */
const ColorPicker: React.FC<ColorPickerProps> = ({
  label,
  color,
  onChange,
  showPicker,
  onTogglePicker,
}) => {
  // 色板只认合法的 #RGB / #RRGGBB；库里存了别的写法时用兜底色，避免色板失效。
  // 旧数据里可能有 #RRGGBBAA（带透明度），截掉 alpha 让色板至少显示正确的 RGB。
  const pickerColor =
    normalizeHexColor(color) ||
    normalizeHexColor((color || "").slice(0, 7)) ||
    FALLBACK_PICKER_COLOR;

  return (
    <div className="info-item">
      <label>{label}</label>
      <div className="color-picker-wrapper">
        <HexColorInput
          className="color-picker-hex-input"
          value={color}
          onCommit={onChange}
          ariaLabel={`${label}的十六进制编码`}
          title="输入十六进制颜色，如 #FF8800（支持 #RGB / #RRGGBB）"
        />
        <div
          className="color-preview-box"
          style={{ backgroundColor: color }}
          title="打开颜色面板"
          aria-label="打开颜色面板"
          onClick={onTogglePicker}
        ></div>
        <ScreenColorPickerButton
          onPicked={onChange}
          title="屏幕取色：吸取屏幕上任意位置的颜色（包括软件窗口以外）"
        />

        {showPicker && (
          <div className="color-picker-dropdown">
            <HexColorPicker color={pickerColor} onChange={onChange} />
            <div className="color-picker-actions">
              <button
                className="btn-small btn-primary"
                onClick={onTogglePicker}
              >
                确定
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ColorPicker;
