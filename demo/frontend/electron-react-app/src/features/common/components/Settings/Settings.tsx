import React, { useCallback } from "react";
import "./Settings.css";
import { ProjectSettings, DEFAULT_PROJECT_SETTINGS, SETTINGS_STORAGE_KEY } from "@types";
import BasicInfoSection from "./sections/BasicInfoSection";
import AudioSection from "./sections/AudioSection";
import OutputSection from "./sections/OutputSection";
import InterfaceSection from "./sections/InterfaceSection";
import ApiService from "@services/ApiService";

interface SettingsProps {
  projectSettings: ProjectSettings;
  setProjectSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
}

/** 从 localStorage 加载设置，失败时返回默认值 */
export const loadSettings = (): ProjectSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 深度合并，确保新增字段有默认值
      return { ...DEFAULT_PROJECT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn("加载项目设置失败，使用默认设置:", e);
  }
  return { ...DEFAULT_PROJECT_SETTINGS };
};

/** 持久化设置到 localStorage */
export const saveSettings = (settings: ProjectSettings): void => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("保存项目设置失败:", e);
  }
};

const Settings: React.FC<SettingsProps> = ({
  projectSettings,
  setProjectSettings,
}) => {
  const handleChange = (field: keyof ProjectSettings, value: any) => {
    setProjectSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveSettings = useCallback(() => {
    saveSettings(projectSettings);
    // 同步视频输出路径到后端数据库
    if (projectSettings.outputPath) {
      ApiService.updateSettings({ videoOutputPath: projectSettings.outputPath })
        .catch(err => console.warn("同步设置到后端失败:", err));
    }
    alert("设置已保存！");
  }, [projectSettings]);

  const handleResetSettings = useCallback(() => {
    if (!window.confirm("确定要重置所有设置为默认值吗？此操作不可撤销。")) return;
    setProjectSettings({ ...DEFAULT_PROJECT_SETTINGS });
  }, [setProjectSettings]);

  return (
    <div className="settings-container">
      <h2>项目设置</h2>

      <BasicInfoSection
        projectSettings={projectSettings}
        handleChange={handleChange}
      />

      <AudioSection
        projectSettings={projectSettings}
        handleChange={handleChange}
      />

      <OutputSection
        projectSettings={projectSettings}
        handleChange={handleChange}
      />

      <InterfaceSection
        projectSettings={projectSettings}
        handleChange={handleChange}
      />

      <div className="settings-actions">
        <button className="save-button" onClick={handleSaveSettings}>
          保存设置
        </button>
        <button className="reset-button" onClick={handleResetSettings}>
          重置为默认
        </button>
      </div>
    </div>
  );
};

export default Settings;
