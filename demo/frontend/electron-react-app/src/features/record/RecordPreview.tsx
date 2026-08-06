import React from "react";
import { Record } from "@types";
import "./RecordEditor.css";

interface RecordPreviewProps {
  selectedRecord: Record;
}

const RecordPreview: React.FC<RecordPreviewProps> = ({ selectedRecord }) => {
  return (
    <div className="preview-container">
      <div className="preview-image">
        <div className="preview-placeholder">预览图区域</div>
      </div>
      <div className="preview-timeline">
        <div className="timeline-placeholder">时间轴</div>
      </div>
    </div>
  );
};

export default RecordPreview;
