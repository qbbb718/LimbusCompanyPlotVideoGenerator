import React, { useState, useEffect } from 'react';
import './App_electron.css';
import ProjectSettings from './components/Settings';
import RecordEditor from './components/RecordEditor';
import ResourceManager from './components/ResourceManager/ResourceManager';
import TextToRecords from './components/TextToRecords';
import { ProjectSettings as IProjectSettings } from './types';

/**
 * 应用程序主组件
 * 负责管理应用状态和视图切换，处理 Electron 环境下的菜单事件
 */
function App() {
  // 状态管理：当前视图
  const [activeTab, setActiveTab] = useState<'editor' | 'resources' | 'settings' | 'textToRecords'>('textToRecords');
  // 状态管理：项目设置
  // 状态管理：应用是否已初始化
  const [appInitialized, setAppInitialized] = useState(false);
  // 状态管理：项目设置
  const [projectSettings, setProjectSettings] = useState<IProjectSettings>({
    name: '新项目',                    // 项目名称
    bgmVolume: 0.7,                  // 背景音乐音量
    voiceVolume: 0.8,                // 人声音量
    sfxVolume: 0.7,                  // 音效音量
    bgmGain: 1.0,                    // 背景音乐增益
    voiceGain: 1.0,                  // 人声增益
    sfxGain: 1.0,                    // 音效增益
    outputPath: '',                  // 输出路径
    theme: 'default',                // 主题
    storyType: 'STORY'               // 故事类型
  });

  // 初始化应用
  useEffect(() => {
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

  // 检测是否在 Electron 环境中运行
  const isElectron = window.navigator.userAgent.toLowerCase().indexOf('electron') > -1;

  // 副作用：处理 Electron 环境下的事件监听
  useEffect(() => {
    // 如果在 Electron 环境中，设置事件监听器
    if (isElectron && window.electronAPI) {
      // 菜单事件处理：新建项目
      const handleNewProject = () => {
        setActiveTab('settings');
      };

      // 菜单事件处理：打开项目
      const handleOpenProject = () => {
        // 打开文件对话框
        if (window.electronAPI.openFile) {
          window.electronAPI.openFile().then((result: any) => {
            if (!result.canceled && result.filePaths.length > 0) {
              // 加载项目文件
              console.log('打开项目文件:', result.filePaths[0]);
              // 这里可以添加加载项目文件的逻辑
            }
          });
        }
      };

      // 菜单事件处理：保存项目
      const handleSaveProject = () => {
        // 保存项目
        if (window.electronAPI.saveFile) {
          const projectData = JSON.stringify(projectSettings);
          window.electronAPI.saveFile(`${projectSettings.name}.json`, projectData)
            .then((result: any) => {
              if (!result.canceled) {
                console.log('项目已保存到:', result.filePath);
              }
            });
        }
      };

      // 菜单事件处理：导出视频
      const handleExportVideo = () => {
        // 导出视频
        console.log('导出视频');
      };

      // 菜单事件处理：关于信息
      const handleAbout = () => {
        // 显示关于信息
        if (window.electronAPI.getAppVersion) {
          window.electronAPI.getAppVersion().then((version: string) => {
            alert(`LimbusCompany Plot Video Generator
版本: ${version}`);
          });
        }
      };

      // 注册事件监听器
      window.electronAPI.onMenuNewProject(handleNewProject);
      window.electronAPI.onMenuOpenProject(handleOpenProject);
      window.electronAPI.onMenuSaveProject(handleSaveProject);
      window.electronAPI.onMenuExportVideo(handleExportVideo);
      window.electronAPI.onMenuAbout(handleAbout);

      // 清理函数：组件卸载时移除所有事件监听器
      return () => {
        window.electronAPI.removeAllListeners('menu-new-project');
        window.electronAPI.removeAllListeners('menu-open-project');
        window.electronAPI.removeAllListeners('menu-save-project');
        window.electronAPI.removeAllListeners('menu-export-video');
        window.electronAPI.removeAllListeners('menu-about');
      };
    }
  }, [isElectron, projectSettings]);

  // 渲染当前激活的标签页内容
  const renderActiveTab = () => {
    switch (activeTab) {
      case 'editor':
        return <RecordEditor projectSettings={projectSettings} />;
      case 'resources':
        return <ResourceManager />;
      case 'settings':
        return <ProjectSettings
                  projectSettings={projectSettings}
                  setProjectSettings={setProjectSettings}
                />;
      case 'textToRecords':
        return <TextToRecords />;
      default:
        return <TextToRecords />;
    }
  };

  // 如果应用未初始化，显示加载界面
  if (!appInitialized) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>正在初始化应用...</p>
      </div>
    );
  }

  // 渲染应用界面
  return (
    <div className="App">
      {/* 应用头部 */}
      <header className="app-header">
        <div className="app-title">
          <h1>LimbusCompany Plot Video Generator</h1>

        </div>
        
        {/* 标签导航 */}
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

      {/* 应用主体内容 */}
      <main className="app-main">
        {renderActiveTab()}
      </main>
    </div>
  );
}

export default App;
