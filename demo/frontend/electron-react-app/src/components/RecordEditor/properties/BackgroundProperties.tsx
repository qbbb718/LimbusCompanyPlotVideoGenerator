
import React from 'react';
import { Record } from '../../../types';
import '../RecordEditor.css';

interface BackgroundPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
}

const BackgroundProperties: React.FC<BackgroundPropertiesProps> = ({ 
  selectedRecord, 
  selectedRecordIndex, 
  updateRecord 
}) => {
  const updateBackground = (index: number, field: string, value: any) => {
    const updatedBgs = [...selectedRecord.bg];
    updatedBgs[index] = {
      ...updatedBgs[index],
      [field]: value
    };

    const updatedRecord = {
      ...selectedRecord,
      bg: updatedBgs
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  const deleteBackground = (index: number) => {
    const updatedBgs = selectedRecord.bg.filter((_, i) => i !== index);
    const updatedRecord = {
      ...selectedRecord,
      bg: updatedBgs
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  return (
    <div className="background-properties">
      <h4>背景设置</h4>
      <div className="backgrounds-list">
        {selectedRecord.bg.map((bg, index) => (
          <div key={index} className="background-item">
            <div className="background-header">
              <h5>{bg.background.name}</h5>
              <button onClick={() => deleteBackground(index)}>删除</button>
            </div>

            <div className="background-details">
              <div className="form-group">
                <label>背景</label>
                <select>
                  {/* 这里应该从后端获取所有背景 */}
                  <option value={bg.background.uuid}>{bg.background.name}</option>
                </select>
              </div>

              <div className="form-group">
                <label>X坐标</label>
                <input
                  type="number"
                  value={bg.posX}
                  onChange={(e) => updateBackground(index, 'posX', parseInt(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>Y坐标</label>
                <input
                  type="number"
                  value={bg.posY}
                  onChange={(e) => updateBackground(index, 'posY', parseInt(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>缩放</label>
                <input
                  type="number"
                  min="0.1"
                  max="3"
                  step="0.1"
                  value={bg.scale}
                  onChange={(e) => updateBackground(index, 'scale', parseFloat(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={bg.visible}
                    onChange={(e) => updateBackground(index, 'visible', e.target.checked)}
                  />
                  可见
                </label>
              </div>
            </div>
          </div>
        ))}

        <button
          className="add-background-btn"
          onClick={() => {
            // 这里应该打开一个对话框，让用户选择背景
            alert('添加背景功能待实现');
          }}
        >
          添加背景
        </button>
      </div>
    </div>
  );
};

export default BackgroundProperties;
