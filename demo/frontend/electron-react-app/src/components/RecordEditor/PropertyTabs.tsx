
import React from 'react';
import './RecordEditor.css';

interface PropertyTabsProps {
  activePropertyTab: 'text' | 'characters' | 'background' | 'effects' | 'audio' | 'global';
  setActivePropertyTab: (tab: 'text' | 'characters' | 'background' | 'effects' | 'audio' | 'global') => void;
}

const PropertyTabs: React.FC<PropertyTabsProps> = ({ activePropertyTab, setActivePropertyTab }) => {
  return (
    <div className="property-tabs">
      <button
        className={activePropertyTab === 'text' ? 'active' : ''}
        onClick={() => setActivePropertyTab('text')}
      >
        文本
      </button>
      <button
        className={activePropertyTab === 'characters' ? 'active' : ''}
        onClick={() => setActivePropertyTab('characters')}
      >
        立绘
      </button>
      <button
        className={activePropertyTab === 'background' ? 'active' : ''}
        onClick={() => setActivePropertyTab('background')}
      >
        背景
      </button>
      <button
        className={activePropertyTab === 'effects' ? 'active' : ''}
        onClick={() => setActivePropertyTab('effects')}
      >
        特效
      </button>
      <button
        className={activePropertyTab === 'audio' ? 'active' : ''}
        onClick={() => setActivePropertyTab('audio')}
      >
        音效
      </button>
      <button
        className={activePropertyTab === 'global' ? 'active' : ''}
        onClick={() => setActivePropertyTab('global')}
      >
        全局设置
      </button>
    </div>
  );
};

export default PropertyTabs;
