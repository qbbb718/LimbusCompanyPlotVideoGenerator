
import React from 'react';
import { MyCharacter } from '../../../types';
import '../ResourceManager.css';

interface CharactersTabProps {
  characters: MyCharacter[];
  selectedCharacter: MyCharacter | null;
  setSelectedCharacter: (character: MyCharacter | null) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (resourceType: 'characters' | 'backgrounds' | 'audios') => void;
}

const CharactersTab: React.FC<CharactersTabProps> = ({
  characters,
  selectedCharacter,
  setSelectedCharacter,
  searchTerm,
  setSearchTerm,
  openResourceFolder
}) => {
  return (
    <div className="resource-tab">
      <div className="resource-actions">
        <input
          type="text"
          placeholder="搜索角色..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button onClick={() => openResourceFolder('characters')}>打开角色文件夹</button>
      </div>

      <div className="characters-grid">
        {characters.map(character => (
          <div
            key={character.characterID}
            className={`character-card ${selectedCharacter?.characterID === character.characterID ? 'selected' : ''}`}
            onClick={() => setSelectedCharacter(character)}
          >
            <div className="character-avatar">
              {/* 这里应该显示角色头像 */}
              <div className="avatar-placeholder">头像</div>
            </div>
            <div className="character-info">
              <h3>{character.characterName}</h3>
              <p>阵营: {character.faction}</p>
              <p>立绘数量: {character.portraits.length}</p>
            </div>
          </div>
        ))}
      </div>

      {selectedCharacter && (
        <div className="character-details">
          <h2>{selectedCharacter.characterName} - 详细信息</h2>

          <div className="character-form">
            <div className="form-group">
              <label>角色ID</label>
              <input type="text" value={selectedCharacter.characterID} readOnly />
            </div>

            <div className="form-group">
              <label>角色名称</label>
              <input type="text" value={selectedCharacter.characterName} readOnly />
            </div>

            <div className="form-group">
              <label>身高</label>
              <input type="number" value={selectedCharacter.height} readOnly />
            </div>

            <div className="form-group">
              <label>阵营</label>
              <input type="text" value={selectedCharacter.faction} readOnly />
            </div>

            <div className="form-group">
              <label>文字颜色</label>
              <input type="text" value={selectedCharacter.colorText} readOnly />
            </div>

            <div className="form-group">
              <label>背景颜色</label>
              <input type="text" value={selectedCharacter.colorBg} readOnly />
            </div>
          </div>

          <div className="portraits-section">
            <h3>立绘列表</h3>
            <div className="portraits-grid">
              {selectedCharacter.portraits.map(portrait => (
                <div key={portrait.portraitID} className="portrait-card">
                  <div className="portrait-thumbnail">
                    {/* 这里应该显示立绘缩略图 */}
                    <div className="thumbnail-placeholder">缩略图</div>
                  </div>
                  <div className="portrait-info">
                    <h4>{portrait.portName}</h4>
                    <p>情绪: {portrait.emotion}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharactersTab;
