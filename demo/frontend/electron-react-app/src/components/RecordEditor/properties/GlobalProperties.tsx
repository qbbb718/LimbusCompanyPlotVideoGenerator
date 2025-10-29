
import React from 'react';
import { ProjectSettings } from '../../../types';
import '../RecordEditor.css';

interface GlobalPropertiesProps {
  projectSettings: ProjectSettings;
}

const GlobalProperties: React.FC<GlobalPropertiesProps> = ({ projectSettings }) => {
  return (
    <div className="global-properties">
      <h4>全局设置</h4>

      <div className="form-group">
        <label>项目名称</label>
        <input
          type="text"
          value={projectSettings.name}
          onChange={(e) => {
            // 这里应该更新项目设置
            alert('更新项目设置功能待实现');
          }}
        />
      </div>

      <div className="form-group">
        <label>剧情类型</label>
        <select
          value={projectSettings.storyType}
          onChange={(e) => {
            // 这里应该更新项目设置
            alert('更新项目设置功能待实现');
          }}
        >
          <option value="STORY">剧情</option>
          <option value="PERSONALITY">人格故事</option>
        </select>
      </div>

      <div className="form-group">
        <label>BGM音量</label>
        <input
          type="number"
          min="0"
          max="1"
          step="0.1"
          value={projectSettings.bgmVolume}
          onChange={(e) => {
            // 这里应该更新项目设置
            alert('更新项目设置功能待实现');
          }}
        />
      </div>

      <div className="form-group">
        <label>语音音量</label>
        <input
          type="number"
          min="0"
          max="1"
          step="0.1"
          value={projectSettings.voiceVolume}
          onChange={(e) => {
            // 这里应该更新项目设置
            alert('更新项目设置功能待实现');
          }}
        />
      </div>

      <div className="form-group">
        <label>音效音量</label>
        <input
          type="number"
          min="0"
          max="1"
          step="0.1"
          value={projectSettings.sfxVolume}
          onChange={(e) => {
            // 这里应该更新项目设置
            alert('更新项目设置功能待实现');
          }}
        />
      </div>

      <div className="form-group">
        <label>输出路径</label>
        <input
          type="text"
          value={projectSettings.outputPath}
          onChange={(e) => {
            // 这里应该更新项目设置
            alert('更新项目设置功能待实现');
          }}
        />
      </div>
    </div>
  );
};

export default GlobalProperties;
