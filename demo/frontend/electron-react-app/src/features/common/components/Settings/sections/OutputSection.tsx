
import React from 'react';
import { ProjectSettings } from '../../../types';
import '../Settings.css';

const VIDEO_SIZE_OPTIONS = [
  { label: '640 × 360', width: 640, height: 360 },
  { label: '854 × 480', width: 854, height: 480 },
  { label: '1280 × 720', width: 1280, height: 720 },
  { label: '1920 × 1080', width: 1920, height: 1080 },
];

interface OutputSectionProps {
  projectSettings: ProjectSettings;
  handleChange: (field: keyof ProjectSettings, value: any) => void;
}

const OutputSection: React.FC<OutputSectionProps> = ({ projectSettings, handleChange }) => {
  const handleOutputPathChange = () => {
    alert('选择输出路径功能待实现');
  };

  const currentSizeKey = `${projectSettings.videoWidth}x${projectSettings.videoHeight}`;

  const handleVideoSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [w, h] = e.target.value.split('x').map(Number);
    handleChange('videoWidth', w);
    handleChange('videoHeight', h);
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
    </div>
  );
};

export default OutputSection;
