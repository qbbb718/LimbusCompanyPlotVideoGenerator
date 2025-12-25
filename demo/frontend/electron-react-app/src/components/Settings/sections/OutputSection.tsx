
import React from 'react';
import { ProjectSettings } from '../../../types';
import '../Settings.css';

interface OutputSectionProps {
  projectSettings: ProjectSettings;
  handleChange: (field: keyof ProjectSettings, value: any) => void;
}

const OutputSection: React.FC<OutputSectionProps> = ({ projectSettings, handleChange }) => {
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
  );
};

export default OutputSection;
