import React, { useState, useEffect } from "react";
import { Record, Background, BackgroundVisual } from "@types";
import ApiService from "@services/ApiService";
import "../RecordEditor.css";
import "./BackgroundProperties.css";

interface BackgroundPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
}

/**
 * 解析背景缩略图只需要 path / thumbnailPath 两个字段：
 * 资源管理里的 Background 和记录里内嵌的背景快照都满足（记录快照没有 tags）。
 */
type BackgroundSource = Pick<Background, "path" | "thumbnailPath">;

/**
 * 背景缩略图地址：优先用后端裁剪好的缩略图，没有（老数据）就退回原图。
 * @param background 背景资源（或记录里的背景快照）
 */
const thumbnailSrc = (background: BackgroundSource): string =>
  ApiService.getBackgroundThumbnailUrl(background.thumbnailPath || background.path);

/**
 * 缩略图加载失败 → 退回原图。
 * 老数据的 thumbnailPath 可能指向已删掉的文件、或干脆只有文件名（拼出来的缩略图地址是猜的），
 * 这一层兜底保证列表里不会出现破图；原图也失败时保留灰底空框，不会反复触发。
 * @param event 图片的 error 事件
 * @param background 该缩略图对应的背景资源
 */
const handleThumbnailError = (
  event: React.SyntheticEvent<HTMLImageElement>,
  background: BackgroundSource,
): void => {
  const img = event.currentTarget;
  const fallbackSrc = ApiService.getBackgroundUrl(background.path);
  if (img.src !== fallbackSrc) img.src = fallbackSrc;
};

const BackgroundProperties: React.FC<BackgroundPropertiesProps> = ({
  selectedRecord,
  selectedRecordIndex,
  updateRecord,
}) => {
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [showSelector, setShowSelector] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBackground, setSelectedBackground] =
    useState<Background | null>(null);
  const [filteredBackgrounds, setFilteredBackgrounds] = useState<Background[]>(
    [],
  );

  useEffect(() => {
    fetchBackgrounds();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === "") setFilteredBackgrounds(backgrounds);
    else
      setFilteredBackgrounds(
        backgrounds.filter(
          (bg) =>
            bg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bg.path.toLowerCase().includes(searchTerm.toLowerCase()),
        ),
      );
  }, [searchTerm, backgrounds]);

  const currentBackgrounds = selectedRecord.bg || [];

  const fetchBackgrounds = async () => {
    try {
      const data = await ApiService.getBackgrounds();
      setBackgrounds(data);
      setFilteredBackgrounds(data);
    } catch (error) {
      console.error("获取背景列表失败", error);
    }
  };

  const addBackground = (background?: Background) => {
    const target = background || selectedBackground;
    if (!target) {
      alert("请选择背景");
      return;
    }
    const newBackground: BackgroundVisual = {
      background: target,
      posX: 0,
      posY: 0,
      scale: 1,
      visible: true,
    };
    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      bg: [...currentBackgrounds, newBackground],
    });
    setSelectedBackground(null);
    setShowSelector(false);
  };

  // 双击直接添加背景，无需再点“确认添加”
  const handleBackgroundDoubleClick = (bg: Background) => {
    setSelectedBackground(bg);
    addBackground(bg);
  };

  const updateBackground = (index: number, field: string, value: any) => {
    const updatedBgs = [...currentBackgrounds];
    updatedBgs[index] = { ...updatedBgs[index], [field]: value };
    updateRecord(selectedRecordIndex, { ...selectedRecord, bg: updatedBgs });
  };

  const deleteBackground = (index: number) => {
    const updatedBgs = currentBackgrounds.filter((_, i) => i !== index);
    updateRecord(selectedRecordIndex, { ...selectedRecord, bg: updatedBgs });
  };

  return (
    <>
      <div className="background-properties">
        <h4>背景设置</h4>
        <div className="backgrounds-list">
          {currentBackgrounds.map((bg, index) => (
            <div key={index} className="background-item">
              <div className="background-header">
                {/* 缩略图 + 名称：不看名字也能一眼认出是哪张背景 */}
                <div className="background-item-info">
                  <div className="background-item-thumb">
                    <img
                      src={thumbnailSrc(bg.background)}
                      alt={bg.background.name}
                      onError={(e) => handleThumbnailError(e, bg.background)}
                    />
                  </div>
                  <h5 title={bg.background.name}>{bg.background.name}</h5>
                </div>
                <button onClick={() => deleteBackground(index)}>删除</button>
              </div>
            </div>
          ))}
          <button
            className="add-background-btn"
            onClick={() => setShowSelector(true)}
          >
            添加背景
          </button>
        </div>
      </div>

      {showSelector && (
        <div className="background-selector">
          <div className="background-selector-content">
            <div className="background-selector-header">
              <h3>选择背景</h3>
              <button
                className="cancel-btn"
                onClick={() => setShowSelector(false)}
              >
                取消
              </button>
            </div>
            <div className="background-selector-body">
              <div className="background-search">
                <input
                  placeholder="搜索背景名称或文件路径..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="background-grid">
                {filteredBackgrounds.map((bg) => (
                  <div
                    key={bg.uuid}
                    className={`background-item ${selectedBackground?.uuid === bg.uuid ? "selected" : ""}`}
                    onClick={() => setSelectedBackground(bg)}
                    onDoubleClick={() => handleBackgroundDoubleClick(bg)}
                    title="双击直接添加该背景"
                  >
                    <div className="background-thumbnail">
                      <img
                        src={thumbnailSrc(bg)}
                        alt={bg.name}
                        onError={(e) => handleThumbnailError(e, bg)}
                      />
                    </div>
                    <div className="background-name">{bg.name}</div>
                    <div className="background-path">{bg.path}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="background-selector-footer">
              <span className="background-selector-hint">
                双击缩略图可直接添加
              </span>
              <button
                className="confirm-btn"
                onClick={() => addBackground()}
                disabled={!selectedBackground}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BackgroundProperties;
