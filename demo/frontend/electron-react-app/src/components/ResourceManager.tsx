import React, { useState, useEffect } from "react";
import "./ResourceManager.css";
import ApiService from "../services/ApiService";
import { MyCharacter, Background, Audio, Portrait } from "../types";
import ResourceTabs from "./ResourceManager/ResourceTabs";

const ResourceManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "characters" | "backgrounds" | "audios"
  >("characters");
  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [audios, setAudios] = useState<Audio[]>([]);
  const [selectedCharacter, setSelectedCharacter] =
    useState<MyCharacter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchResources();
  }, []);

  const fetchResources = async () => {
    try {
      setIsLoading(true);
      const [charactersData, backgroundsData, audiosData] = await Promise.all([
        ApiService.getCharacters(),
        ApiService.getBackgrounds(),
        ApiService.getAudios(),
      ]);

      setCharacters(charactersData);
      setBackgrounds(backgroundsData);
      setAudios(audiosData);
    } catch (error) {
      console.error("获取资源失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const openResourceFolder = (
    resourceType: "characters" | "backgrounds" | "audios"
  ) => {
    // 这里需要调用Electron的API打开对应的资源文件夹
    // 例如: window.electron.openResourceFolder(resourceType);
    alert(`打开${resourceType}资源文件夹功能待实现`);
  };

  const filteredCharacters = characters.filter((character) =>
    character.characterName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBackgrounds = backgrounds.filter((background) =>
    background.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAudios = audios.filter((audio) =>
    audio.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderCharactersTab = () => {
    return (
      <div className="resource-tab">
        <div className="resource-actions">
          <input
            type="text"
            placeholder="搜索角色..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button onClick={() => openResourceFolder("characters")}>
            打开角色文件夹
          </button>
        </div>

        <div className="characters-grid">
          {filteredCharacters.map((character) => (
            <div
              key={character.characterID}
              className={`character-card ${
                selectedCharacter?.characterID === character.characterID
                  ? "selected"
                  : ""
              }`}
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
                <input
                  type="text"
                  value={selectedCharacter.characterID}
                  readOnly
                />
              </div>

              <div className="form-group">
                <label>角色名称</label>
                <input
                  type="text"
                  value={selectedCharacter.characterName}
                  readOnly
                />
              </div>

              <div className="form-group">
                <label>身高</label>
                <input
                  type="number"
                  value={selectedCharacter.height}
                  readOnly
                />
              </div>

              <div className="form-group">
                <label>阵营</label>
                <input type="text" value={selectedCharacter.faction} readOnly />
              </div>

              <div className="form-group">
                <label>文字颜色</label>
                <input
                  type="text"
                  value={selectedCharacter.colorText}
                  readOnly
                />
              </div>

              <div className="form-group">
                <label>背景颜色</label>
                <input type="text" value={selectedCharacter.colorBg} readOnly />
              </div>
            </div>

            <div className="portraits-section">
              <h3>立绘列表</h3>
              <div className="portraits-grid">
                {selectedCharacter.portraits.map((portrait) => (
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

  const renderBackgroundsTab = () => {
    return (
      <div className="resource-tab">
        <div className="resource-actions">
          <input
            type="text"
            placeholder="搜索背景..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button onClick={() => openResourceFolder("backgrounds")}>
            打开背景文件夹
          </button>
        </div>

        <div className="backgrounds-grid">
          {filteredBackgrounds.map((background) => (
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

  const renderAudiosTab = () => {
    return (
      <div className="resource-tab">
        <div className="resource-actions">
          <input
            type="text"
            placeholder="搜索音频..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button onClick={() => openResourceFolder("audios")}>
            打开音频文件夹
          </button>
        </div>

        <div className="audios-list">
          {filteredAudios.map((audio) => (
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

  if (isLoading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="resource-manager">
      {/* 使用 ResourceTabs 组件替换原来的标签按钮 */}
      <ResourceTabs activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="resource-content">
        {activeTab === "characters" && renderCharactersTab()}
        {activeTab === "backgrounds" && renderBackgroundsTab()}
        {activeTab === "audios" && renderAudiosTab()}
      </div>
    </div>
  );
};

export default ResourceManager;
