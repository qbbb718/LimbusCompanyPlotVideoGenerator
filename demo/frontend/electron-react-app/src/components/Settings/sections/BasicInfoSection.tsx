
import React from 'react';
import { ProjectSettings } from '../../../types';
import '../Settings.css';

interface BasicInfoSectionProps {
  projectSettings: ProjectSettings;
  handleChange: (field: keyof ProjectSettings, value: any) => void;
}

const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({ projectSettings, handleChange }) => {
  return (
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
  );
};

export default BasicInfoSection;
