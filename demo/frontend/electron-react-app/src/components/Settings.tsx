import React from 'react';
import './Settings.css';
import { ProjectSettings } from '../types';

interface SettingsProps {
  projectSettings: ProjectSettings;
  setProjectSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
}

const Settings: React.FC<SettingsProps> = ({ projectSettings, setProjectSettings }) => {
  const handleChange = (field: keyof ProjectSettings, value: any) => {
    setProjectSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleOutputPathChange = () => {
    // 这里需要调用Electron的API打开文件夹选择对话框
    // 例如: window.electron.selectFolder().then(path => {
    //   if (path) {
    //     handleChange('outputPath', path);
    //   }
    // });
    alert('选择输出路径功能待实现');
  };

  return (
    <div className="settings-container">
      <h2>设置</h2>

      <div className="settings-section">
        <h3>输出设置</h3>

        <div className="form-group">
          <label>默认输出路径</label>
          <div className="path-input-group">
            <input 
              type="text" 
              value={projectSettings.outputPath}
              onChange={(e) => handleChange('outputPath', e.target.value)}
              readOnly
            />
            <button onClick={handleOutputPathChange}>浏览</button>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>界面设置</h3>

        <div className="form-group">
          <label>主题</label>
          <select 
            value={projectSettings.theme}
            onChange={(e) => handleChange('theme', e.target.value)}
          >
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
      </div>

    </div>
  );
};

export default Settings;
