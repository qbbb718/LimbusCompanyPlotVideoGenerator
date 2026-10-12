import React from 'react';
import { ProjectSettings } from '../../../types';
import {
  VIDEO_SIZE_OPTIONS,
  parseVideoSizeKey,
  pickOutputDirectory,
  videoSizeKey,
} from '@features/common/utils/projectSettings';
import '../Settings.css';

interface OutputSectionProps {
  projectSettings: ProjectSettings;
  handleChange: (field: keyof ProjectSettings, value: any) => void;
}

const OutputSection: React.FC<OutputSectionProps> = ({ projectSettings, handleChange }) => {
  const handleOutputPathChange = async () => {
    try {
      const path = await pickOutputDirectory(projectSettings.outputPath);
      if (path) {
        handleChange('outputPath', path);
      }
    } catch (error) {
      console.error('选择输出路径失败:', error);
      alert('无法打开目录选择对话框，请手动输入路径');
    }
  };

  const currentSizeKey = videoSizeKey(
    projectSettings.videoWidth,
    projectSettings.videoHeight,
  );

  const handleVideoSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const size = parseVideoSizeKey(e.target.value);
    if (!size) return;
    handleChange('videoWidth', size.width);
    handleChange('videoHeight', size.height);
  };

  return (
    <div className="settings-section">
      <h3>输出与界面</h3>

      <div className="form-group">
        <label>输出路径</label>
        <div className="path-input-group">
          <input
            type="text"
            value={projectSettings.outputPath}
            onChange={(e) => handleChange('outputPath', e.target.value)}
            placeholder="选择或输入视频导出目录..."
          />
          <button onClick={handleOutputPathChange}>浏览</button>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>视频尺寸</label>
          <select value={currentSizeKey} onChange={handleVideoSizeChange}>
            {VIDEO_SIZE_OPTIONS.map((opt) => (
              <option key={opt.label} value={`${opt.width}x${opt.height}`}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
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

export default OutputSection;
