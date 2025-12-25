
import React from 'react';
import { Record } from '../../types';
import './RecordEditor.css';

interface RecordPreviewProps {
  selectedRecord: Record;
}

const RecordPreview: React.FC<RecordPreviewProps> = ({ selectedRecord }) => {
  return (
    <div className="preview-container">
      {/* <div className="preview-header">
        <h3>预览</h3>
      </div> */}
      <div className="preview-image">
        {/* 这里应该显示当前记录的预览图 */}
        <div className="preview-placeholder">预览图区域</div>
      </div>
      <div className="preview-timeline">
        {/* 这里应该显示类似视频进度条的东西 */}
        <div className="timeline-placeholder">时间轴</div>
      </div>
    </div>
  );
};

export default RecordPreview;
