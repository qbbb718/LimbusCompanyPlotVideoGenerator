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
      <h2>项目设置</h2>

      <div className="settings-section">
        <h3>基本信息</h3>

        <div className="form-group">
          <label>项目名称</label>
          <input 
            type="text" 
            value={projectSettings.name}
            onChange={(e) => handleChange('name', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>剧情类型</label>
          <select 
            value={projectSettings.storyType}
            onChange={(e) => handleChange('storyType', e.target.value)}
          >
            <option value="STORY">剧情</option>
            <option value="PERSONALITY">人格故事</option>
          </select>
        </div>
      </div>

      <div className="settings-section">
        <h3>音频设置</h3>

        <div className="form-group">
          <label>BGM音量</label>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.1"
            value={projectSettings.bgmVolume}
            onChange={(e) => handleChange('bgmVolume', parseFloat(e.target.value))}
          />
          <span className="value-display">{projectSettings.bgmVolume}</span>
        </div>

        <div className="form-group">
          <label>语音音量</label>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.1"
            value={projectSettings.voiceVolume}
            onChange={(e) => handleChange('voiceVolume', parseFloat(e.target.value))}
          />
          <span className="value-display">{projectSettings.voiceVolume}</span>
        </div>

        <div className="form-group">
          <label>音效音量</label>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.1"
            value={projectSettings.sfxVolume}
            onChange={(e) => handleChange('sfxVolume', parseFloat(e.target.value))}
          />
          <span className="value-display">{projectSettings.sfxVolume}</span>
        </div>

        <div className="form-group">
          <label>BGM增益</label>
          <input 
            type="range" 
            min="0.5" 
            max="2" 
            step="0.1"
            value={projectSettings.bgmGain}
            onChange={(e) => handleChange('bgmGain', parseFloat(e.target.value))}
          />
          <span className="value-display">{projectSettings.bgmGain}</span>
        </div>

        <div className="form-group">
          <label>语音增益</label>
          <input 
            type="range" 
            min="0.5" 
            max="2" 
            step="0.1"
            value={projectSettings.voiceGain}
            onChange={(e) => handleChange('voiceGain', parseFloat(e.target.value))}
          />
          <span className="value-display">{projectSettings.voiceGain}</span>
        </div>

        <div className="form-group">
          <label>音效增益</label>
          <input 
            type="range" 
            min="0.5" 
            max="2" 
            step="0.1"
            value={projectSettings.sfxGain}
            onChange={(e) => handleChange('sfxGain', parseFloat(e.target.value))}
          />
          <span className="value-display">{projectSettings.sfxGain}</span>
        </div>
      </div>

      <div className="settings-section">
        <h3>输出设置</h3>

        <div className="form-group">
          <label>输出路径</label>
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

      <div className="settings-actions">
        <button className="save-button">保存设置</button>
        <button className="reset-button">重置为默认</button>
      </div>
    </div>
  );
};

export default Settings;
