import React from "react";
import { Portrait } from "@types";
import {
  StandardEmotion,
  getEmotionOptions,
  mapEmotion,
} from "../../../../../utils/emotionMapper";
// 示例图跟着前端一起打包：它只是界面上的说明图，不是用户素材。
// 以前拼 `${BASE_URL}/assets/guides/...` 从数据目录取，那个文件从来没进过安装包，
// 实际一直是裂图（换台机器/新装也一样）。
import headCropGuideline from "../assets/head-crop-guideline.png";

interface PortraitSettingsProps {
  currentPortrait: Portrait;
  setEditingPortrait: (portrait: Portrait) => void;
}

const PortraitSettings: React.FC<PortraitSettingsProps> = ({
  currentPortrait,
  setEditingPortrait,
}) => {
  // 下拉框选项全部是中文关键词（正常 / 开心 / 悲伤 …），value 仍是标准情绪
  const emotionOptions = getEmotionOptions();
  // 后端返回的是小写 code，历史数据里可能有 "NORMAL" 这种大写枚举名，
  // 统一归一化后再绑定到下拉框，避免框里露出英文。
  const selectedEmotion = mapEmotion(currentPortrait.emotion);

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
        <label htmlFor="portrait-emotion-select">情绪</label>
        <select
          id="portrait-emotion-select"
          className="emotion-select"
          value={selectedEmotion}
          onChange={(e) => {
            const emotion = e.target.value as StandardEmotion;
            setEditingPortrait({
              ...currentPortrait,
              emotion: emotion as unknown as Portrait["emotion"],
            });
          }}
        >
          {emotionOptions.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="emotion-info">
          <div>下拉框显示中文关键词；选择立绘文件时会按文件名自动识别情绪。</div>
          <div>
            中文/英文关键词均可，如：罗佳-face_happy_L.png → 开心、罗佳-悲伤.png → 悲伤
          </div>
        </div>
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
          <br />
          拖动裁剪框可改位置；滚轮 / 拖动框外只缩放平移画面，框跟立绘走、不改裁剪值
          <br />
          对不准头的大小？点裁剪框下方「按截图校准」，用一张游戏截图反推
        </p>
        <img
          className="crop-hint-image"
          src={headCropGuideline}
          alt="头部裁剪区域示例"
        />
      </div>
    </div>
  );
};

export default PortraitSettings;
