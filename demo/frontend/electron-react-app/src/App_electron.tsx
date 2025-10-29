import React, { useState, useEffect } from 'react';
import './App_electron.css';
import ProjectSettings from './components/Settings';
import RecordEditor from './components/RecordEditor';
import { ProjectSettings as IProjectSettings } from './types';

/**
 * 应用程序主组件
 * 负责管理应用状态和视图切换，处理 Electron 环境下的菜单事件
 */
function App() {
  // 状态管理：当前视图（设置或编辑器）
  const [currentView, setCurrentView] = useState<'settings' | 'editor'>('settings');
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

  // 检测是否在 Electron 环境中运行
  const isElectron = window.navigator.userAgent.toLowerCase().indexOf('electron') > -1;

  // 副作用：处理 Electron 环境下的事件监听
  useEffect(() => {
    // 如果在 Electron 环境中，设置事件监听器
    if (isElectron && window.electronAPI) {
      // 菜单事件处理：新建项目
      const handleNewProject = () => {
        setCurrentView('settings');
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

  // 处理项目设置提交
  const handleProjectSettingsSubmit = (settings: IProjectSettings) => {
    setProjectSettings(settings);
    setCurrentView('editor');
  };

  // 渲染应用界面
  return (
    <div className="App">
      {/* 应用头部 */}
      <header className="app-header">
        <h1>LimbusCompany Plot Video Generator</h1>
      </header>

      {/* 应用主体内容 */}
      <main className="app-main">
        {/* 根据当前视图渲染设置或编辑器 */}
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
