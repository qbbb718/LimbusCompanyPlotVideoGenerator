
import React from 'react';
import { ProjectSettings } from '../../../types';
import '../Settings.css';

interface InterfaceSectionProps {
  projectSettings: ProjectSettings;
  handleChange: (field: keyof ProjectSettings, value: any) => void;
}

const InterfaceSection: React.FC<InterfaceSectionProps> = ({ projectSettings, handleChange }) => {
  return (
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
  );
};

export default InterfaceSection;
