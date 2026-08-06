import React from 'react';
import { HexColorPicker } from 'react-colorful';

interface ColorPickerProps {
  label: string;
  color: string;
  onChange: (color: string) => void;
  showPicker: boolean;
  onTogglePicker: () => void;
}

const ColorPicker: React.FC<ColorPickerProps> = ({
  label,
  color,
  onChange,
  showPicker,
  onTogglePicker
}) => {
  return (
    <div className="info-item">
      <label>{label}</label>
      <div className="color-picker-wrapper">
        <input
          type="text"
          value={color}
          onChange={(e) => onChange(e.target.value)}
        />
        <div
          className="color-preview-box"
          style={{ backgroundColor: color }}
          onClick={onTogglePicker}
        ></div>

        {showPicker && (
          <div className="color-picker-dropdown">
            <HexColorPicker color={color} onChange={onChange} />
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
