
import React, { useRef, ChangeEvent } from "react";
import { Background } from "../../../types";

interface BackgroundModalProps {
  isEditing: boolean;
  editingBackground: Background | null;
  backgroundPreview: string | null;
  onCancel: () => void;
  onSave: () => void;
  onBackgroundChange: (background: Background) => void;
  onFileSelect: () => void;
}

const BackgroundModal: React.FC<BackgroundModalProps> = ({
  isEditing,
  editingBackground,
  backgroundPreview,
  onCancel,
  onSave,
  onBackgroundChange,
  onFileSelect,
}) => {
  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!editingBackground) return;
    onBackgroundChange({
      ...editingBackground,
      name: e.target.value,
    });
  };

  const handlePathChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!editingBackground) return;
    onBackgroundChange({
      ...editingBackground,
      path: e.target.value,
    });
  };

  const handleTagsChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!editingBackground) return;
    onBackgroundChange({
      ...editingBackground,
      tags: e.target.value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    });
  };

  if (!editingBackground) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{isEditing ? "编辑背景" : "添加背景"}</h2>
          <button className="close-btn" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="modal-content">
          <div className="form-group">
            <label>背景名称</label>
            <input
              type="text"
              value={editingBackground.name || ""}
              onChange={handleNameChange}
            />
          </div>
          <div className="form-group">
            <label>背景路径</label>
            <div className="file-input-container">
              <input
                type="text"
                value={editingBackground.path || ""}
                onChange={handlePathChange}
                readOnly
              />
              <button className="file-select-btn" onClick={onFileSelect}>
                选择文件
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>标签</label>
            <input
              type="text"
              value={
                editingBackground.tags
                  ? editingBackground.tags.join(", ")
                  : ""
              }
              onChange={handleTagsChange}
              placeholder="用逗号分隔多个标签"
            />
          </div>

          {backgroundPreview && (
            <div className="form-group">
              <label>预览</label>
              <div className="image-preview">
                <img
                  src={backgroundPreview}
                  alt="预览"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "300px",
                    objectFit: "contain",
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button className="btn-primary" onClick={onSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackgroundModal;
