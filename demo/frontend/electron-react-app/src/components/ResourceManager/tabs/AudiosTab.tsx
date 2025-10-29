
import React from 'react';
import { Audio } from '../../../types';
import '../ResourceManager.css';

interface AudiosTabProps {
  audios: Audio[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (resourceType: 'characters' | 'backgrounds' | 'audios') => void;
}

const AudiosTab: React.FC<AudiosTabProps> = ({
  audios,
  searchTerm,
  setSearchTerm,
  openResourceFolder
}) => {
  return (
    <div className="resource-tab">
      <div className="resource-actions">
        <input
          type="text"
          placeholder="搜索音频..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={() => openResourceFolder('audios')}>打开音频文件夹</button>
      </div>

      <div className="audios-list">
        {audios.map(audio => (
          <div key={audio.uuid} className="audio-item">
            <div className="audio-info">
              <h3>{audio.name}</h3>
              <p>类型: {audio.type}</p>
              <p>路径: {audio.path}</p>
            </div>
            <div className="audio-controls">
              {/* 这里应该添加音频播放控件 */}
              <button>播放</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AudiosTab;
