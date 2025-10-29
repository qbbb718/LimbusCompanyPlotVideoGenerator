
import React from 'react';
import { Background } from '../../../types';
import '../ResourceManager.css';

interface BackgroundsTabProps {
  backgrounds: Background[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (resourceType: 'characters' | 'backgrounds' | 'audios') => void;
}

const BackgroundsTab: React.FC<BackgroundsTabProps> = ({
  backgrounds,
  searchTerm,
  setSearchTerm,
  openResourceFolder
}) => {
  return (
    <div className="resource-tab">
      <div className="resource-actions">
        <input
          type="text"
          placeholder="搜索背景..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={() => openResourceFolder('backgrounds')}>打开背景文件夹</button>
      </div>

      <div className="backgrounds-grid">
        {backgrounds.map(background => (
          <div key={background.uuid} className="background-card">
            <div className="background-preview">
              {/* 这里应该显示背景预览图 */}
              <div className="preview-placeholder">预览图</div>
            </div>
            <div className="background-info">
              <h3>{background.name}</h3>
              <p>路径: {background.path}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BackgroundsTab;
