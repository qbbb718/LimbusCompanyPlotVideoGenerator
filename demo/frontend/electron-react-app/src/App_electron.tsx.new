import React, { useState, useEffect } from 'react';
import './App.css';
import ProjectSettings from './components/Settings';
import RecordEditor from './components/RecordEditor';
import { ProjectSettings as IProjectSettings } from './types';

function App() {
  const [currentView, setCurrentView] = useState<'settings' | 'editor'>('settings');
  const [projectSettings, setProjectSettings] = useState<IProjectSettings>({
    name: '新项目',
    bgmVolume: 0.7,
    voiceVolume: 0.8,
    sfxVolume: 0.7,
    bgmGain: 1.0,
    voiceGain: 1.0,
    sfxGain: 1.0,
    outputPath: '',
    theme: 'default',
    storyType: 'STORY'
  });

  // 检测是否在 Electron 环境中运行
  const isElectron = window.navigator.userAgent.toLowerCase().indexOf('electron') > -1;

  useEffect(() => {
    // 如果在 Electron 环境中，设置事件监听器
    if (isElectron && window.electronAPI) {
      // 菜单事件处理
      const handleNewProject = () => {
        setCurrentView('settings');
      };

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

      const handleExportVideo = () => {
        // 导出视频
        console.log('导出视频');
      };

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

      // 清理函数
      return () => {
        window.electronAPI.removeAllListeners('menu-new-project');
        window.electronAPI.removeAllListeners('menu-open-project');
        window.electronAPI.removeAllListeners('menu-save-project');
        window.electronAPI.removeAllListeners('menu-export-video');
        window.electronAPI.removeAllListeners('menu-about');
      };
    }
  }, [isElectron, projectSettings]);

  const handleProjectSettingsSubmit = (settings: IProjectSettings) => {
    setProjectSettings(settings);
    setCurrentView('editor');
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>LimbusCompany Plot Video Generator</h1>
        {isElectron && (
          <div className="window-controls">
            <button onClick={() => window.electronAPI.minimizeWindow()}>_</button>
            <button onClick={() => window.electronAPI.maximizeWindow()}>□</button>
            <button onClick={() => window.electronAPI.closeWindow()}>✕</button>
          </div>
        )}
      </header>

      <main className="app-main">
        {currentView === 'settings' ? (
          <ProjectSettings
            projectSettings={projectSettings}
            setProjectSettings={setProjectSettings}
          />
        ) : (
          <RecordEditor projectSettings={projectSettings} />
        )}
      </main>
    </div>
  );
}

export default App;
