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

  const addBackground = () => {
    if (!selectedBackground) {
      alert("请选择背景");
      return;
    }
    const newBackground: BackgroundVisual = {
      background: selectedBackground,
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
                <h5>{bg.background.name}</h5>
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
                  >
                    <div className="background-thumbnail">
                      <img
                        src={ApiService.getBackgroundThumbnailUrl(
                          bg.thumbnailPath || bg.path
                        )}
                        alt={bg.name}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          // 缩略图加载失败时，尝试用原图
                          const fallbackSrc = ApiService.getBackgroundUrl(bg.path);
                          if (target.src !== fallbackSrc) {
                            target.src = fallbackSrc;
                          }
                        }}
                      />
                    </div>
                    <div className="background-name">{bg.name}</div>
                    <div className="background-path">{bg.path}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="background-selector-footer">
              <button onClick={addBackground} disabled={!selectedBackground}>
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
