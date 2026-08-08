import React, { useState } from "react";
import { Record } from "@types";
import "./RecordEditor.css";

interface RecordListProps {
  records: Record[];
  selectedRecordIndex: number;
  setSelectedRecordIndex: (index: number) => void;
  createNewRecord: () => void;
  generateVideo: (layerTypes: string[]) => void;
  moveRecord: (index: number, direction: "up" | "down") => void;
  duplicateRecord: (index: number) => void;
  deleteRecord: (index: number) => void;
  exportRecords: () => void;
  importRecords: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isGenerating?: boolean;
}

/** 视频分层导出选项 */
const LAYER_OPTIONS = [
  { key: "FULL", label: "导出完整视频" },
  { key: "UI_ONLY", label: "导出仅UI(含文本)视频" },
  { key: "BG_CHARACTERS", label: "导出背景与立绘视频" },
  { key: "BACKGROUND_ONLY", label: "导出仅背景视频" },
  { key: "CHARACTERS_ONLY", label: "导出仅立绘视频" },
];

const RecordList: React.FC<RecordListProps> = ({
  records,
  selectedRecordIndex,
  setSelectedRecordIndex,
  createNewRecord,
  generateVideo,
  moveRecord,
  duplicateRecord,
  deleteRecord,
  exportRecords,
  importRecords,
  isGenerating,
}) => {
  const [showLayerPopup, setShowLayerPopup] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(
    new Set(["FULL"]),
  );

  const toggleLayer = (key: string) => {
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleGenerateClick = () => {
    setShowLayerPopup(true);
  };

  const handleConfirmExport = () => {
    if (selectedLayers.size === 0) {
      alert("请至少选择一个导出分层");
      return;
    }
    setShowLayerPopup(false);
    generateVideo(Array.from(selectedLayers));
  };

  const handleCancelExport = () => {
    setShowLayerPopup(false);
  };

  return (
    <div className="record-list-container">
      {/* 分层导出弹窗 */}
      {showLayerPopup && (
        <div className="layer-popup-overlay" onClick={handleCancelExport}>
          <div className="layer-popup" onClick={(e) => e.stopPropagation()}>
            <h4>选择导出视频分层</h4>
            <div className="layer-popup-options">
              {LAYER_OPTIONS.map((opt) => (
                <label key={opt.key} className="layer-popup-option">
                  <input
                    type="checkbox"
                    checked={selectedLayers.has(opt.key)}
                    onChange={() => toggleLayer(opt.key)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <div className="layer-popup-actions">
              <button onClick={handleCancelExport}>取消</button>
              <button onClick={handleConfirmExport} className="primary-btn">
                确认导出
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="record-list-header">
        <h3>剧情记录</h3>
        <div className="record-list-actions">
          <button onClick={createNewRecord}>添加记录</button>
          <button onClick={exportRecords}>导出项目</button>
          <label className="import-button">
            导入项目
            <input
              type="file"
              accept=".json"
              onChange={importRecords}
              style={{ display: "none" }}
            />
          </label>
          <button onClick={handleGenerateClick} disabled={isGenerating}>
            {isGenerating ? "生成中..." : "生成视频"}
          </button>
        </div>
      </div>

      <div className="record-list">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>说话人</th>
              <th>对话内容</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr
                key={record.uuid}
                className={index === selectedRecordIndex ? "selected" : ""}
                onClick={() => setSelectedRecordIndex(index)}
              >
                <td>{index + 1}</td>
                <td>{record.dialogue.speakerName || "旁白"}</td>
                <td>
                  {record.dialogue.text.substring(0, 30) +
                    (record.dialogue.text.length > 30 ? "..." : "")}
                </td>
                <td>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveRecord(index, "up");
                    }}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveRecord(index, "down");
                    }}
                    disabled={index === records.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateRecord(index);
                    }}
                  >
                    复制
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRecord(index);
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecordList;
