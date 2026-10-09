import React, { useState, useEffect } from "react";
import "./App_electron.css";
import { Settings as ProjectSettingsUI } from "@features/settings";
import RecordEditor from "@features/record";
import { ResourceManager } from "@features/resource";
import { TextToRecords } from "@features/text-to-records";
import { ProjectSettings as IProjectSettings, Record } from "@types";
import ApiService from "@services/ApiService";
import { loadSettings, saveSettings } from "@features/common/components/Settings/Settings";
import log from "electron-log";

function AppElectron() {
  const [activeTab, setActiveTab] = useState<
    "editor" | "resources" | "settings" | "textToRecords"
  >("textToRecords");
  const [appInitialized, setAppInitialized] = useState(false);
  const [parsedRecords, setParsedRecords] = useState<Record[] | undefined>(
    undefined,
  );
  const [projectSettings, setProjectSettings] = useState<IProjectSettings>(() =>
    loadSettings(),
  );

  useEffect(() => {
    const initializeApp = async () => {
      try {
        log.info("开始应用初始化");
        try {
          await ApiService.healthCheck();
          log.info("后端连接成功");

          // 从后端数据库加载持久化设置，与本地（localStorage）设置对齐
          try {
            const backendSettings = await ApiService.getSettings();
            log.info("从后端加载设置:", backendSettings);

            // localStorage 是用户最近一次的选择，数据库只是备份：
            // 旧实现无条件用后端值覆盖本地值，只要有一次保存没能同步到后端
            // （后端没启动、请求失败等），下次启动就会被数据库里的旧路径盖回去，
            // 表现为"改过输出路径，下次打开又变回原来的"。
            const localPath = (loadSettings().outputPath || "").trim();
            const backendPath = (backendSettings?.videoOutputPath || "").trim();

            if (localPath) {
              // 本地有设置：以本地为准，并把数据库里的旧值刷新过来
              if (localPath !== backendPath) {
                ApiService.updateSettings({ videoOutputPath: localPath }).catch((err) =>
                  log.warn("把本地输出路径同步到后端失败:", err),
                );
              }
            } else if (backendPath) {
              // 本地没有（首次运行、换机器、清过缓存）：采用数据库里的备份值
              const merged = { ...loadSettings(), outputPath: backendPath };
              saveSettings(merged);
              setProjectSettings((prev) => ({ ...prev, outputPath: backendPath }));
            }
          } catch (settingsErr) {
            log.warn("加载后端设置失败，使用本地设置:", settingsErr);
          }
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

  // 设置改动即持久化：用户改完输出路径（或其它设置）不用记得点"保存设置"，
  // 关掉软件重开还是上次改的值。
  useEffect(() => {
    saveSettings(projectSettings);
  }, [projectSettings]);

  // 输出路径变化后同步到后端数据库（防抖，避免在输入框里打字时每敲一个字符发一次请求）。
  // 数据库只是备份：即使后端没启动，localStorage 里的值也能保证下次启动不丢。
  useEffect(() => {
    const path = (projectSettings.outputPath || "").trim();
    if (!path) return;

    const timer = setTimeout(() => {
      ApiService.updateSettings({ videoOutputPath: path }).catch((err) =>
        log.warn("同步输出路径到后端失败:", err),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [projectSettings.outputPath]);

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
