
import React from 'react';
import './ResourceManager.css';

interface ResourceTabsProps {
  activeTab: 'characters' | 'backgrounds' | 'audios';
  setActiveTab: (tab: 'characters' | 'backgrounds' | 'audios') => void;
}

const ResourceTabs: React.FC<ResourceTabsProps> = ({ activeTab, setActiveTab }) => {
  return (
    <div className="resource-tabs">
      <button
        className={activeTab === 'characters' ? 'active' : ''}
        onClick={() => setActiveTab('characters')}
      >
        角色
      </button>
      <button
        className={activeTab === 'backgrounds' ? 'active' : ''}
        onClick={() => setActiveTab('backgrounds')}
      >
        背景
      </button>
      <button
        className={activeTab === 'audios' ? 'active' : ''}
        onClick={() => setActiveTab('audios')}
      >
        音效
      </button>
    </div>
  );
};

export default ResourceTabs;
