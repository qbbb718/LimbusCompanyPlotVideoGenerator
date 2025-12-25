
import React from "react";
import { Background } from "../../../types";

interface BackgroundCardProps {
  background: Background;
  isSelected: boolean;
  onSelect: (background: Background) => void;
  onEdit: (background: Background) => void;
}

const BackgroundCard: React.FC<BackgroundCardProps> = ({
  background,
  isSelected,
  onSelect,
  onEdit,
}) => {
  return (
    <div
      className={`background-card ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(background)}
      onDoubleClick={() => onEdit(background)}
    >
      <div className="background-preview">
        {background.thumbnailPath ? (
          <img
            src={background.thumbnailPath}
            alt={background.name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "cover",
            }}
          />
        ) : background.path ? (
          <img
            src={background.path}
            alt={background.name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
          />
        ) : (
          <div className="preview-placeholder">预览图</div>
        )}
      </div>
      <div className="background-info">
        <h3>{background.name}</h3>
        <p>路径: {background.path}</p>
        <p>标签: {background.tags ? background.tags.join(", ") : "无标签"}</p>
      </div>
    </div>
  );
};

export default BackgroundCard;
