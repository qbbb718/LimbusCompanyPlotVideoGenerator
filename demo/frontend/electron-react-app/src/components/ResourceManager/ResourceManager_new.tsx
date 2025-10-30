import React, { useState, useEffect } from 'react';
import './ResourceManager.css';
import ApiService from '../../services/ApiService';
import { MyCharacter, Background, Audio } from '../../types';
import ResourceTabs from './ResourceTabs';
import CharactersTab from './tabs/CharactersTab';
import BackgroundsTab from './tabs/BackgroundsTab';
import AudiosTab from './tabs/AudiosTab';

const ResourceManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'characters' | 'backgrounds' | 'audios'>('characters');
  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [audios, setAudios] = useState<Audio[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<MyCharacter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchResources();
  }, []);

  const fetchResources = async () => {
    try {
      setIsLoading(true);
      const [charactersData, backgroundsData, audiosData] = await Promise.all([
        ApiService.getCharacters(),
        ApiService.getBackgrounds(),
        ApiService.getAudios()
      ]);

      setCharacters(charactersData);
      setBackgrounds(backgroundsData);
      setAudios(audiosData);
    } catch (error) {
      console.error('获取资源失败:', error);
      // 即使获取失败也继续显示界面
    } finally {
      setIsLoading(false);
    }
  };

  const openResourceFolder = (resourceType: 'characters' | 'backgrounds' | 'audios') => {
    // 这里需要调用Electron的API打开对应的资源文件夹
    // 例如: window.electron.openResourceFolder(resourceType);
    alert(`打开${resourceType}资源文件夹功能待实现`);
  };

  const filteredCharacters = characters.filter(character => 
    character.characterName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBackgrounds = backgrounds.filter(background => 
    background.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAudios = audios.filter(audio => 
    audio.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="resource-manager">
      <ResourceTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <div className="resource-content">
        {activeTab === 'characters' && (
          <CharactersTab
            characters={filteredCharacters}
            selectedCharacter={selectedCharacter}
            setSelectedCharacter={setSelectedCharacter}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            openResourceFolder={openResourceFolder}
            setCharacters={setCharacters}
          />
        )}
        {activeTab === 'backgrounds' && (
          <BackgroundsTab
            backgrounds={filteredBackgrounds}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            openResourceFolder={openResourceFolder}
            setBackgrounds={setBackgrounds}
          />
        )}
        {activeTab === 'audios' && (
          <AudiosTab
            audios={filteredAudios}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            openResourceFolder={openResourceFolder}
            setAudios={setAudios}
          />
        )}
      </div>
    </div>
  );
};

export default ResourceManager;
