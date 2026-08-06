import React, { useState, useEffect } from "react";
import "./App_electron.css";
import { Settings as ProjectSettingsUI } from "@features/settings";
import RecordEditor from "@features/record";
import { ResourceManager } from "@features/resource";
import { TextToRecords } from "@features/text-to-records";
import { ProjectSettings as IProjectSettings, Record } from "@types";
import ApiService from "@services/ApiService";
import log from "electron-log";

function AppElectron() {
  const [activeTab, setActiveTab] = useState<
    "editor" | "resources" | "settings" | "textToRecords"
  >("textToRecords");
  const [appInitialized, setAppInitialized] = useState(false);
  const [parsedRecords, setParsedRecords] = useState<Record[] | undefined>(
    undefined,
  );
  const [projectSettings, setProjectSettings] = useState<IProjectSettings>({
    name: "新项目",
    bgmVolume: 0.7,
    voiceVolume: 0.8,
    sfxVolume: 0.7,
    bgmGain: 1.0,
    voiceGain: 1.0,
    sfxGain: 1.0,
    outputPath: "",
    theme: "default",
    storyType: "STORY",
  });

  useEffect(() => {
    const initializeApp = async () => {
      try {
        log.info("开始应用初始化");
        try {
          await ApiService.healthCheck();
          log.info("后端连接成功");
        } catch (error) {
          log.warn("后端连接失败，将使用模拟数据:", error);
        }

        await ApiService.initAudio();
        log.info("应用初始化完成");
        setAppInitialized(true);
      } catch (error) {
        log.error("应用初始化失败:", error);
        setAppInitialized(true);
      }
    };

    initializeApp();
  }, []);

  const isElectron =
    window.navigator.userAgent.toLowerCase().indexOf("electron") > -1;

  useEffect(() => {
    if (isElectron && window.electronAPI) {
      const handleNewProject = () => setActiveTab("settings");
      const handleOpenProject = () => {
        if (window.electronAPI.openFile) {
          window.electronAPI.openFile().then((result: any) => {
            if (!result.canceled && result.filePaths.length > 0) {
              console.log("打开项目文件:", result.filePaths[0]);
            }
          });
        }
      };

      const handleSaveProject = () => {
        if (window.electronAPI.saveFile) {
          const projectData = JSON.stringify(projectSettings);
          window.electronAPI
            .saveFile(`${projectSettings.name}.json`, projectData)
            .then((result: any) => {
              if (!result.canceled) {
                console.log("项目已保存到:", result.filePath);
              }
            });
        }
      };

      const handleExportVideo = () => console.log("导出视频");
      const handleAbout = () => {
        if (window.electronAPI.getAppVersion) {
          window.electronAPI.getAppVersion().then((version: string) => {
            alert(`LimbusCompany Plot Video Generator\n版本: ${version}`);
          });
        }
      };

      window.electronAPI.onMenuNewProject(handleNewProject);
      window.electronAPI.onMenuOpenProject(handleOpenProject);
      window.electronAPI.onMenuSaveProject(handleSaveProject);
      window.electronAPI.onMenuExportVideo(handleExportVideo);
      window.electronAPI.onMenuAbout(handleAbout);

      return () => {
        window.electronAPI.removeAllListeners("menu-new-project");
        window.electronAPI.removeAllListeners("menu-open-project");
        window.electronAPI.removeAllListeners("menu-save-project");
        window.electronAPI.removeAllListeners("menu-export-video");
        window.electronAPI.removeAllListeners("menu-about");
      };
    }
  }, [isElectron, projectSettings]);

  const handleParsedRecords = (records: Record[]) => {
    log.info("[App_electron] 收到转换后的记录，数量:", records.length);
    log.info(
      "[App_electron] 第一条记录预览:",
      JSON.stringify(records[0], null, 2),
    );

    // 保存记录到状态中，以便在编辑器中使用
    setParsedRecords(records);
    log.info("[App_electron] 已保存转换后的记录到状态");

    // 跳转到编辑器页面
    log.info("[App_electron] 准备跳转到编辑器页面");
    setActiveTab("editor");
    log.info("[App_electron] 已跳转到编辑器页面");
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "editor":
        log.info(
          "[App_electron] 渲染编辑器页面，parsedRecords:",
          parsedRecords?.length || 0,
        );
        return (
          <RecordEditor
            projectSettings={projectSettings}
            initialRecords={parsedRecords}
          />
        );
      case "resources":
        return <ResourceManager />;
      case "settings":
        return (
          <ProjectSettingsUI
            projectSettings={projectSettings}
            setProjectSettings={setProjectSettings}
          />
        );
      case "textToRecords":
        return <TextToRecords onParsedRecords={handleParsedRecords} />;
      default:
        return <TextToRecords onParsedRecords={handleParsedRecords} />;
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
    <div className="App">
      <header className="app-header">
        <div className="app-title">
          <h1>LimbusCompany Plot Video Generator</h1>
        </div>

        <div className="tab-navigation">
          <button
            className={activeTab === "textToRecords" ? "active" : ""}
            onClick={() => setActiveTab("textToRecords")}
          >
            文本转记录
          </button>
          <button
            className={activeTab === "editor" ? "active" : ""}
            onClick={() => setActiveTab("editor")}
          >
            剧情编辑
          </button>
          <button
            className={activeTab === "resources" ? "active" : ""}
            onClick={() => setActiveTab("resources")}
          >
            资源管理
          </button>
          <button
            className={activeTab === "settings" ? "active" : ""}
            onClick={() => setActiveTab("settings")}
          >
            设置
          </button>
        </div>
      </header>

      <main className="app-main">{renderActiveTab()}</main>
    </div>
  );
}

export default AppElectron;
