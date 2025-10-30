import React, { useState, useEffect } from 'react';
import './App.css';
import RecordEditor from './components/RecordEditor';
import ResourceManager from './components/ResourceManager';
import Settings from './components/Settings';
import TextToRecords from './components/TextToRecords';
import ApiService from './services/ApiService';
import { ProjectSettings } from './types';

function App() {
  const [activeTab, setActiveTab] = useState<'editor' | 'resources' | 'settings' | 'textToRecords'>('textToRecords');
  const [appInitialized, setAppInitialized] = useState(false);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    name: '新项目',
    bgmVolume: 0.7,
    voiceVolume: 1.0,
    sfxVolume: 0.8,
    bgmGain: 1.2,
    voiceGain: 1.0,
    sfxGain: 1.5,
    outputPath: './output',
    theme: 'light',
    storyType: 'STORY'
  });

  useEffect(() => {
    // 初始化应用
    const initializeApp = async () => {
      try {
        // 检查后端连接
        // await ApiService.healthCheck();

        // 初始化音频系统
        // await ApiService.initAudio();
        
        console.log("跳过后端初始化检查，直接启动应用");
        setAppInitialized(true);
      } catch (error) {
        console.error('应用初始化失败:', error);
        // 可以在这里添加错误提示UI
        setAppInitialized(true); // 即使出错也继续启动应用
      }
    };

    initializeApp();
  }, []);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'editor':
        return <RecordEditor projectSettings={projectSettings} />;
      case 'resources':
        return <ResourceManager />;
      case 'settings':
        return <Settings 
                  projectSettings={projectSettings} 
                  setProjectSettings={setProjectSettings} 
                />;
      case 'textToRecords':
        return <TextToRecords />;
      default:
        return <TextToRecords />;
    }
  };

  if (!appInitialized) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>正在初始化应用...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        {/* <h1>LimbusCompany 剧情视频生成器</h1> */}
        <div className="tab-navigation">
          <button 
            className={activeTab === 'textToRecords' ? 'active' : ''}
            onClick={() => setActiveTab('textToRecords')}
          >
            文本转记录
          </button>
          <button 
            className={activeTab === 'editor' ? 'active' : ''}
            onClick={() => setActiveTab('editor')}
          >
            剧情编辑
          </button>
          <button 
            className={activeTab === 'resources' ? 'active' : ''}
            onClick={() => setActiveTab('resources')}
          >
            资源管理
          </button>
          <button 
            className={activeTab === 'settings' ? 'active' : ''}
            onClick={() => setActiveTab('settings')}
          >
            设置
          </button>
        </div>
      </header>

      <main className="app-main" >
        {renderActiveTab()}
      </main>
    </div>
  );
}

export default App;


