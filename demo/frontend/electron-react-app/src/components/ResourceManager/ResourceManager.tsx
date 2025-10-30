
import React, { useState, useEffect } from 'react';
import './ResourceManager.css';
import ApiService from '../../services/ApiService';
import { MyCharacter, Background, Audio, Emotion } from '../../types';
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
      
      // 使用假数据进行演示
      const mockCharacters: MyCharacter[] = [
        {
          characterID: "char001",
          characterName: "格里高尔",
          height: 180,
          faction: "辛迪加",
          tags: [],
          portraits: [
            {
              portraitID: "portrait001",
              characterID: "char001",
              imagePath: "/characters/gregory_normal.png",
              portName: "普通",
              emotion: Emotion.NORMAL,
              faceX: 100,
              faceY: 80,
              length: 150,
              adjX: 0,
              adjY: 0,
              thumbnailPath: "/characters/gregory_thumb.png"
            },
            {
              portraitID: "portrait002",
              characterID: "char001",
              imagePath: "/characters/gregory_happy.png",
              portName: "开心",
              emotion: Emotion.HAPPY,
              faceX: 100,
              faceY: 80,
              length: 150,
              adjX: 0,
              adjY: 0,
              thumbnailPath: "/characters/gregory_happy_thumb.png"
            }
          ],
          colorBg: "#2A5CAA",
          colorText: "#FFFFFF"
        },
        {
          characterID: "char002",
          characterName: "默尔索",
          height: 175,
          faction: "K公司",
          tags: [],
          portraits: [
            {
              portraitID: "portrait003",
              characterID: "char002",
              imagePath: "/characters/meursault_normal.png",
              portName: "普通",
              emotion: Emotion.NORMAL,
              faceX: 100,
              faceY: 80,
              length: 150,
              adjX: 0,
              adjY: 0,
              thumbnailPath: "/characters/meursault_thumb.png"
            }
          ],
          colorBg: "#E60012",
          colorText: "#FFFFFF"
        }
      ];
      
      const mockBackgrounds: Background[] = [
        {
          uuid: "bg001",
          name: "办公室",
          path: "/backgrounds/office.png",
          tags: ["室内", "工作"]
        },
        {
          uuid: "bg002",
          name: "街道",
          path: "/backgrounds/street.png",
          tags: ["室外", "城市"]
        }
      ];
      
      const mockAudios: Audio[] = [
        {
          uuid: "audio001",
          name: "背景音乐1",
          path: "/audio/bgm1.mp3",
          type: "BGM",
          tags: ["轻松", "日常"]
        },
        {
          uuid: "audio002",
          name: "脚步声",
          path: "/audio/footsteps.mp3",
          type: "SFX",
          tags: ["动作", "环境"]
        }
      ];
      
      setCharacters(mockCharacters);
      setBackgrounds(mockBackgrounds);
      setAudios(mockAudios);
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
