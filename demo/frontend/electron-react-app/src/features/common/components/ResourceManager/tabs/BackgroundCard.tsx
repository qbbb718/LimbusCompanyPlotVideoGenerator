import React from "react";
import { Background } from "@types";
import ApiService from "@services/ApiService";
import "./BackgroundsTab.css";

interface BackgroundCardProps {
  background: Background;
  isSelected: boolean;
  onSelect: (background: Background) => void;
  onEdit: (background: Background) => void;
  onDelete: (backgroundId: string) => void;
}

const BackgroundCard: React.FC<BackgroundCardProps> = ({
  background,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}) => {
  const resolveSrc = (src?: string) => {
    if (!src) return undefined;
    return ApiService.getBackgroundThumbnailUrl(src) ||
      ApiService.getBackgroundUrl(src) ||
      undefined;
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`确定删除背景「${background.name}」吗？\n（默认将同时删除相关图片文件）`)) {
      onDelete(background.uuid);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(background);
  };

  return (
    <div
      className={`background-card ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(background)}
      onDoubleClick={() => onEdit(background)}
    >
      <div className="background-actions">
        <button
          className="bg-action-btn bg-edit-btn"
          title="编辑"
          onClick={handleEditClick}
        >
          ✏ 编辑
        </button>
        <button
          className="bg-action-btn bg-delete-btn"
          title="删除"
          onClick={handleDeleteClick}
        >
          🗑 删除
        </button>
      </div>
      <div className="background-preview">
        {background.thumbnailPath && !background.thumbnailPath.startsWith("blob:") ? (
          <img
            src={resolveSrc(background.thumbnailPath)}
            alt={background.name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "cover",
            }}
            onError={(e) => {
              // 缩略图加载失败时，降级使用原图
              (e.currentTarget as HTMLImageElement).style.display = "none";
              const sibling = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLImageElement | null;
              if (sibling && sibling.tagName === "IMG") {
                sibling.style.display = "block";
              }
            }}
          />
        ) : null}
        {background.path ? (
          <img
            src={ApiService.getBackgroundUrl(background.path)}
            alt={background.name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display:
                background.thumbnailPath && !background.thumbnailPath.startsWith("blob:")
                  ? "none"
                  : "block",
            }}
          />
        ) : (
          !background.thumbnailPath && (
            <div className="preview-placeholder">预览图</div>
          )
        )}
      </div>
      <div className="background-info">
        <h3 title={background.name}>{background.name}</h3>
        <p className="bg-tags">
          标签: {background.tags && background.tags.length > 0
            ? background.tags.join(", ")
            : "无标签"}
        </p>
      </div>
    </div>
  );
};

export default BackgroundCard;
