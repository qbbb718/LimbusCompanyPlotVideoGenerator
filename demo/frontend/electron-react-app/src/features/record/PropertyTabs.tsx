import React from "react";
import type { PropertyTab } from "./useProjectWorkspace";
import "./RecordEditor.css";

interface PropertyTabsProps {
  activePropertyTab: PropertyTab;
  setActivePropertyTab: (tab: PropertyTab) => void;
}

/**
 * 属性页签定义：emoji 用于快速辨识（一眼分清文本/立绘/背景…），
 * label 是原有的中文名（同时也作为 title 提示，窄面板下被挤压时仍可读全称）。
 */
const PROPERTY_TABS: { key: PropertyTab; emoji: string; label: string }[] = [
  { key: "text", emoji: "📝", label: "文本" },
  { key: "characters", emoji: "👤", label: "立绘" },
  { key: "background", emoji: "🖼️", label: "背景" },
  { key: "effects", emoji: "✨", label: "特效" },
  { key: "audio", emoji: "🔊", label: "音效" },
  { key: "global", emoji: "⚙️", label: "全局设置" },
];

/**
 * 属性面板页签：一行铺满、每个页签等宽（flex: 1 1 0，见 RecordEditor.css 的 .property-tabs）。
 */
const PropertyTabs: React.FC<PropertyTabsProps> = ({
  activePropertyTab,
  setActivePropertyTab,
}) => {
  return (
    <div className="property-tabs" role="tablist">
      {PROPERTY_TABS.map(({ key, emoji, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          title={label}
          aria-selected={activePropertyTab === key}
          className={activePropertyTab === key ? "active" : ""}
          onClick={() => setActivePropertyTab(key)}
        >
          <span className="property-tab-emoji" aria-hidden="true">
            {emoji}
          </span>
          <span className="property-tab-label">{label}</span>
        </button>
      ))}
    </div>
  );
};

export default PropertyTabs;
