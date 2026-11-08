import React from "react";
import "./ResourceManager.css";

/** 资源管理的子页面；新增子页面时**只改这里**（联合类型 + 一个按钮） */
export type ResourceTabKey = "characters" | "backgrounds" | "audios" | "animation-clips";

interface ResourceTabsProps {
  activeTab: ResourceTabKey;
  setActiveTab: (tab: ResourceTabKey) => void;
}

const ResourceTabs: React.FC<ResourceTabsProps> = ({
  activeTab,
  setActiveTab,
}) => {
  return (
    <div className="resource-tabs">
      <button
        className={activeTab === "characters" ? "active" : ""}
        onClick={() => setActiveTab("characters")}
      >
        角色
      </button>
      <button
        className={activeTab === "backgrounds" ? "active" : ""}
        onClick={() => setActiveTab("backgrounds")}
      >
        背景
      </button>
      <button
        className={activeTab === "audios" ? "active" : ""}
        onClick={() => setActiveTab("audios")}
      >
        音效
      </button>
      <button
        className={activeTab === "animation-clips" ? "active" : ""}
        onClick={() => setActiveTab("animation-clips")}
        title="序列帧动画：导入帧序列、摆好缩略图，供剧情编辑里的立绘选用"
      >
        序列帧动画
      </button>
    </div>
  );
};

export default ResourceTabs;
