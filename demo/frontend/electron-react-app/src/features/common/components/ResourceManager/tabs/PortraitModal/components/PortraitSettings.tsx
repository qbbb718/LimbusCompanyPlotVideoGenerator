import React, { useState } from "react";
import { Portrait } from "@types";
import { BASE_URL } from "@services/ApiService";
import {
  mapEmotion,
  getStandardEmotions,
} from "../../../../../utils/emotionMapper";
import createLogger from "../utils/logger";

const log = createLogger("PortraitSettings");

interface PortraitSettingsProps {
  currentPortrait: Portrait;
  emotionInput: string;
  setEmotionInput: (value: string) => void;
  setEditingPortrait: (portrait: Portrait) => void;
}

const PortraitSettings: React.FC<PortraitSettingsProps> = ({
  currentPortrait,
  emotionInput,
  setEmotionInput,
  setEditingPortrait,
}) => {
  const [showEmotionSuggestions, setShowEmotionSuggestions] = useState(false);

  // 获取标准情绪列表
  const standardEmotions = getStandardEmotions();

  return (
    <div className="portrait-settings">
      <div className="form-group">
        <label>立绘名称</label>
        <input
          type="text"
          value={currentPortrait.portName}
          onChange={(e) =>
            setEditingPortrait({ ...currentPortrait, portName: e.target.value })
          }
        />
      </div>

      <div className="form-group emotion-input-group">
        <label>情绪</label>
        <div className="emotion-input-container">
          <input
            type="text"
            value={emotionInput}
            onChange={(e) => {
              const value = e.target.value;
              setEmotionInput(value);
              setShowEmotionSuggestions(value.length > 0);
            }}
            onFocus={() => setShowEmotionSuggestions(true)}
            placeholder="输入情绪，如：开心、悲伤、惊讶等"
          />
          {showEmotionSuggestions && (
            <div className="emotion-suggestions">
              {Object.entries(standardEmotions).map(([value, label]) => (
                <div
                  key={value}
                  className="emotion-suggestion"
                  onClick={() => {
                    setEmotionInput(label);
                    setShowEmotionSuggestions(false);

                    // 映射到标准情绪
                    const standardEmotion = mapEmotion(label);

                    // 更新立绘的情绪
                    setEditingPortrait({
                      ...currentPortrait,
                      emotion: standardEmotion as unknown as any,
                    });
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="emotion-info">系统将自动匹配最接近的标准情绪</div>
      </div>

      <div className="form-group">
        <label>调整位置</label>
        <div className="form-row">
          <div className="form-row-item">
            <label className="form-row-label">X</label>
            <input
              type="number"
              value={currentPortrait.adjX}
              onChange={(e) =>
                setEditingPortrait({
                  ...currentPortrait,
                  adjX: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
          <div className="form-row-item">
            <label className="form-row-label">Y</label>
            <input
              type="number"
              value={currentPortrait.adjY}
              onChange={(e) =>
                setEditingPortrait({
                  ...currentPortrait,
                  adjY: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="form-group crop-hint">
        <p className="crop-hint-text">
          请从下巴框选至头顶（不含头发厚度）
          <br />
          裁剪区域将用于计算缩放比例
        </p>
        <img
          className="crop-hint-image"
          src={`${BASE_URL}/assets/guides/head-crop-guideline.png`}
          alt="头部裁剪区域示例"
        />
      </div>
    </div>
  );
};

export default PortraitSettings;
