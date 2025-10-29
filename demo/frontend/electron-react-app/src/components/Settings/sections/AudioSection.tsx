
import React from 'react';
import { ProjectSettings } from '../../../types';
import '../Settings.css';

interface AudioSectionProps {
  projectSettings: ProjectSettings;
  handleChange: (field: keyof ProjectSettings, value: any) => void;
}

const AudioSection: React.FC<AudioSectionProps> = ({ projectSettings, handleChange }) => {
  return (
    <div className="settings-section">
      <h3>音频设置</h3>

      <div className="form-row">
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
      </div>

      <div className="form-row">
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
      </div>

      <div className="form-row">
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
    </div>
  );
};

export default AudioSection;
