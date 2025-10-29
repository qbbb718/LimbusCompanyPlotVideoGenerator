
import React from 'react';
import { Record } from '../../../types';
import '../RecordEditor.css';

interface CharactersPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
}

const CharactersProperties: React.FC<CharactersPropertiesProps> = ({ 
  selectedRecord, 
  selectedRecordIndex, 
  updateRecord 
}) => {
  const updateCharacter = (index: number, field: string, value: any) => {
    const updatedChars = [...selectedRecord.chars];
    updatedChars[index] = {
      ...updatedChars[index],
      [field]: value
    };

    const updatedRecord = {
      ...selectedRecord,
      chars: updatedChars
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  const deleteCharacter = (index: number) => {
    const updatedChars = selectedRecord.chars.filter((_, i) => i !== index);
    const updatedRecord = {
      ...selectedRecord,
      chars: updatedChars
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  return (
    <div className="characters-properties">
      <h4>角色立绘</h4>
      <div className="characters-list">
        {selectedRecord.chars.map((char, index) => (
          <div key={index} className="character-item">
            <div className="character-header">
              <h5>{char.chara.characterName}</h5>
              <button onClick={() => deleteCharacter(index)}>删除</button>
            </div>

            <div className="character-details">
              <div className="form-group">
                <label>立绘</label>
                <select>
                  {/* 这里应该从后端获取该角色的所有立绘 */}
                  <option value={char.portrait.portraitID}>{char.portrait.portName}</option>
                </select>
              </div>

              <div className="form-group">
                <label>X坐标</label>
                <input
                  type="number"
                  value={char.posX}
                  onChange={(e) => updateCharacter(index, 'posX', parseInt(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>Y坐标</label>
                <input
                  type="number"
                  value={char.posY}
                  onChange={(e) => updateCharacter(index, 'posY', parseInt(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>X偏移</label>
                <input
                  type="number"
                  value={char.adjX}
                  onChange={(e) => updateCharacter(index, 'adjX', parseInt(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>Y偏移</label>
                <input
                  type="number"
                  value={char.adjY}
                  onChange={(e) => updateCharacter(index, 'adjY', parseInt(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={char.dim}
                    onChange={(e) => updateCharacter(index, 'dim', e.target.checked)}
                  />
                  压暗
                </label>
              </div>
            </div>
          </div>
        ))}

        <button
          className="add-character-btn"
          onClick={() => {
            // 这里应该打开一个对话框，让用户选择角色和立绘
            alert('添加角色功能待实现');
          }}
        >
          添加角色
        </button>
      </div>
    </div>
  );
};

export default CharactersProperties;
