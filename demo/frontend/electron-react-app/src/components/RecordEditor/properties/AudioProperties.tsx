
import React from 'react';
import { Record } from '../../../types';
import '../RecordEditor.css';

interface AudioPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
}

const AudioProperties: React.FC<AudioPropertiesProps> = ({ 
  selectedRecord, 
  selectedRecordIndex, 
  updateRecord 
}) => {
  const updateAudio = (index: number, field: string, value: any) => {
    const updatedAudios = [...selectedRecord.audioCommands];
    updatedAudios[index] = {
      ...updatedAudios[index],
      [field]: value
    };

    const updatedRecord = {
      ...selectedRecord,
      audioCommands: updatedAudios
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  const deleteAudio = (index: number) => {
    const updatedAudios = selectedRecord.audioCommands.filter((_, i) => i !== index);
    const updatedRecord = {
      ...selectedRecord,
      audioCommands: updatedAudios
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  return (
    <div className="audio-properties">
      <h4>音效设置</h4>
      <div className="audio-list">
        {selectedRecord.audioCommands.map((audio, index) => (
          <div key={index} className="audio-item">
            <div className="audio-header">
              <h5>{audio.type}: {audio.path}</h5>
              <button onClick={() => deleteAudio(index)}>删除</button>
            </div>

            <div className="audio-details">
              <div className="form-group">
                <label>类型</label>
                <select
                  value={audio.type}
                  onChange={(e) => updateAudio(index, 'type', e.target.value)}
                >
                  <option value="BGM">背景音乐</option>
                  <option value="VOICE">语音</option>
                  <option value="SFX">音效</option>
                </select>
              </div>

              <div className="form-group">
                <label>文件路径</label>
                <input
                  type="text"
                  value={audio.path}
                  onChange={(e) => updateAudio(index, 'path', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>音量</label>
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={audio.volume}
                  onChange={(e) => updateAudio(index, 'volume', parseFloat(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>开始时间(秒)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={audio.startTime}
                  onChange={(e) => updateAudio(index, 'startTime', parseFloat(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label>持续时间(秒)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={audio.duration}
                  onChange={(e) => updateAudio(index, 'duration', parseFloat(e.target.value))}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          className="add-audio-btn"
          onClick={() => {
            // 这里应该打开一个对话框，让用户选择音频
            alert('添加音频功能待实现');
          }}
        >
          添加音频
        </button>
      </div>
    </div>
  );
};

export default AudioProperties;
