import React, { useState } from "react";
import { Record } from "@types";
import "./RecordEditor.css";

interface RecordListProps {
  records: Record[];
  selectedRecordIndex: number;
  setSelectedRecordIndex: (index: number) => void;
  createNewRecord: () => void;
  generateVideo: (layerTypes: string[], keepTempFiles: boolean) => void;
  moveRecord: (index: number, direction: "up" | "down") => void;
  duplicateRecord: (index: number) => void;
  deleteRecord: (index: number) => void;
  /** 保存工程（与 Ctrl+S 相同：已关联文件则更新，否则先选保存位置） */
  onSaveProject: () => void;
  /** 导入工程：从工程文件载入记录 */
  onImportProject: (file?: File) => void;
  /** 当前工程已关联的文件名；未保存到文件时为 null */
  projectFileName?: string | null;
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
  onSaveProject,
  onImportProject,
  projectFileName,
  isGenerating,
}) => {
  const [showLayerPopup, setShowLayerPopup] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(
    new Set(["FULL"]),
  );
  const [keepTempFiles, setKeepTempFiles] = useState(false);

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
    generateVideo(Array.from(selectedLayers), keepTempFiles);
  };

  const handleCancelExport = () => {
    setShowLayerPopup(false);
  };

  /**
   * @function 选择工程文件后交给上层导入
   * 取到 File 后立即清空 input 的值，这样同一个文件可以再次选择（否则 onChange 不触发）。
   */
  const handleImportChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      onImportProject(file);
    }
  };

  const saveHint = projectFileName
    ? `保存工程（Ctrl+S 更新 ${projectFileName}）`
    : "保存工程（Ctrl+S 首次保存会先让选择保存位置与名称）";

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
            <div className="layer-popup-divider" />
            <div className="layer-popup-options">
              <label className="layer-popup-option">
                <input
                  type="checkbox"
                  checked={keepTempFiles}
                  onChange={(e) => setKeepTempFiles(e.target.checked)}
                />
                保留中间文件，下次导出更快
              </label>
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
        {/* 标题与"添加记录"按钮放在一起：添加记录是列表自身的操作，靠左更顺手 */}
        <div className="record-list-title">
          <h3>剧情记录</h3>
          <button
            className="add-record-btn"
            onClick={createNewRecord}
            title="添加记录"
            aria-label="添加记录"
          >
            +
          </button>
        </div>
        <div className="record-list-actions">
          <label
            className="plain-button"
            title="从工程文件载入记录（导入后 Ctrl+S 可直接更新该文件）"
          >
            导入工程
            <input
              type="file"
              accept=".json"
              onChange={handleImportChange}
              style={{ display: "none" }}
            />
          </label>

          <button
            className="plain-button"
            onClick={onSaveProject}
            title={saveHint}
          >
            保存工程
          </button>

          <button
            className="import-button"
            onClick={handleGenerateClick}
            disabled={isGenerating}
          >
            {isGenerating ? "导出中..." : "导出视频"}
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
