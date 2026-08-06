import React from "react";
import "./Settings.css";
import { ProjectSettings } from "@types";
import BasicInfoSection from "./sections/BasicInfoSection";
import AudioSection from "./sections/AudioSection";
import OutputSection from "./sections/OutputSection";
import InterfaceSection from "./sections/InterfaceSection";

interface SettingsProps {
  projectSettings: ProjectSettings;
  setProjectSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
}

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

  const handleSaveSettings = () => {
    // 这里应该实现保存设置到文件或后端
    alert("保存设置功能待实现");
  };

  const handleResetSettings = () => {
    // 这里应该实现重置为默认设置
    alert("重置设置功能待实现");
  };

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
