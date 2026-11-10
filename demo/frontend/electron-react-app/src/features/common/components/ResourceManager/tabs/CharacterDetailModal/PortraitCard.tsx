import React from "react";
import { Portrait } from "@types";
import PortraitThumbnail from "./PortraitThumbnail";
import { getEmotionLabel } from "../../../../utils/emotionMapper";

interface PortraitCardProps {
  portrait: Portrait;
  characterId: string;
  isDefault: boolean;
  /**
   * 这张立绘的缩略图代次：裁剪 / 换图后父组件给它 +1。
   *
   * <p>缩略图文件名固定，后端只覆盖内容，所以只能靠这个代次换一个 `?t=` 重新取图。
   */
  thumbnailVersion?: number;
  onEdit: (portrait: Portrait) => void;
  onSetDefault: (portraitId: string) => void;
  onDelete: (portraitId: string) => void;
}

const PortraitCard: React.FC<PortraitCardProps> = ({
  portrait,
  characterId,
  isDefault,
  thumbnailVersion = 0,
  onEdit,
  onSetDefault,
  onDelete,
}) => {
  const handleImageError = (portraitId: string, error: any) => {
    console.error("[PortraitCard] 缩略图加载失败", {
      portraitId,
      error,
    });
  };

  const handleImageLoad = (portraitId: string, url: string) => {
    console.log("[PortraitCard] 缩略图加载成功", {
      portraitId,
      url,
    });
  };

  return (
    <div className="portrait-card">
      <div className="portrait-thumbnail">
        <PortraitThumbnail
          portrait={portrait}
          characterId={characterId}
          cacheBust={thumbnailVersion}
          onLoadComplete={handleImageLoad}
          onError={handleImageError}
        />
      </div>
      <div className="portrait-info">
        <h4>{portrait.portName}</h4>
        {/* 情绪统一显示中文关键词，后端返回的 happy / 旧数据的 HAPPY 都归一化 */}
        <p>情绪: {getEmotionLabel(portrait.emotion)}</p>
        {isDefault && <p className="default-portrait-indicator">默认立绘</p>}
        <div className="portrait-actions">
          <button className="btn-primary" onClick={() => onEdit(portrait)}>
            编辑
          </button>
          {!isDefault && (
            <button
              className="btn-secondary"
              onClick={() => onSetDefault(portrait.portraitID)}
            >
              设为默认
            </button>
          )}
          <button
            className="btn-danger"
            onClick={() => onDelete(portrait.portraitID)}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
};

export default PortraitCard;
