import React from 'react';
import { Record } from '../../types';
import './RecordEditor.css';

interface RecordListProps {
  records: Record[];
  selectedRecordIndex: number;
  setSelectedRecordIndex: (index: number) => void;
  createNewRecord: () => void;
  generateVideo: () => void;
  moveRecord: (index: number, direction: 'up' | 'down') => void;
  duplicateRecord: (index: number) => void;
  deleteRecord: (index: number) => void;
}

const RecordList: React.FC<RecordListProps> = ({
  records,
  selectedRecordIndex,
  setSelectedRecordIndex,
  createNewRecord,
  generateVideo,
  moveRecord,
  duplicateRecord,
  deleteRecord
}) => {
  return (
    <div className="record-list-container">
      <div className="record-list-header">
        <h3>剧情记录</h3>
        <div className="record-list-actions">
          <button onClick={createNewRecord}>添加记录</button>
          <button onClick={generateVideo}>生成视频</button>
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
                className={index === selectedRecordIndex ? 'selected' : ''}
                onClick={() => setSelectedRecordIndex(index)}
              >
                <td>{index + 1}</td>
                <td>{record.dialogue.speakerName || '旁白'}</td>
                <td>{record.dialogue.text.substring(0, 30) + (record.dialogue.text.length > 30 ? '...' : '')}</td>
           
                <td>
                  <button onClick={(e) => { e.stopPropagation(); moveRecord(index, 'up'); }} disabled={index === 0}>↑</button>
                  <button onClick={(e) => { e.stopPropagation(); moveRecord(index, 'down'); }} disabled={index === records.length - 1}>↓</button>
                  <button onClick={(e) => { e.stopPropagation(); duplicateRecord(index); }}>复制</button>
                  <button onClick={(e) => { e.stopPropagation(); deleteRecord(index); }}>删除</button>
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
