import React, { useState, useEffect } from "react";
import "./App.css";
import RecordEditor, { ProjectToast, useProjectWorkspace } from "@features/record";
import { ResourceManager } from "@features/resource";
import { Settings } from "@features/settings";
import { TextToRecords } from "@features/text-to-records";
import { ProjectSettings } from "./types";
import { Record } from "@types";

function App() {
  const [activeTab, setActiveTab] = useState<
    "editor" | "resources" | "settings" | "textToRecords"
  >("textToRecords");
  const [appInitialized, setAppInitialized] = useState(false);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    name: "新项目",
    bgmVolume: 0.7,
    voiceVolume: 1.0,
    sfxVolume: 0.8,
    bgmGain: 1.2,
    voiceGain: 1.0,
    sfxGain: 1.5,
    outputPath: "./output",
    theme: "light",
    storyType: "STORY",
    videoWidth: 1920,
    videoHeight: 1080,
  });

  // 当前工程由 App 层持有，切换页面（资源管理/设置…）不丢编辑内容；详见 useProjectWorkspace.ts
  const workspace = useProjectWorkspace(projectSettings.name);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log("跳过后端初始化检查，直接启动应用");
        setAppInitialized(true);
      } catch (error) {
        console.error("应用初始化失败:", error);
        setAppInitialized(true);
      }
    };

    initializeApp();
  }, []);

  const handleParsedRecords = (records: Record[]) => {
    console.log("[App] handleParsedRecords 被调用");
    console.log(`[App] 接收到的记录数: ${records.length}`);
    console.log("[App] 记录预览:", JSON.stringify(records, null, 2));

    workspace.adoptParsedRecords(records);
    console.log("[App] 已把解析结果接入当前工程");

    setActiveTab("editor");
    console.log("[App] 已切换到 editor 标签页");
  };

  const renderActiveTab = () => {
    switch (activeTab) {
      case "editor":
        return (
          <RecordEditor
            projectSettings={projectSettings}
            workspace={workspace}
          />
        );
      case "resources":
        return <ResourceManager />;
      case "settings":
        return (
          <Settings
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
    <div className="app-container">
      <header className="app-header">
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

      {/* 保存/导入工程的文字提示（非弹窗） */}
      <ProjectToast toast={workspace.toast} onDismiss={workspace.dismissToast} />
    </div>
  );
}

export default App;
