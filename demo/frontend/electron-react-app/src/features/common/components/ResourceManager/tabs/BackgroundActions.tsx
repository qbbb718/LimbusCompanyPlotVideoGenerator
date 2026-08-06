
import React from "react";

interface BackgroundActionsProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  openResourceFolder: (resourceType: "characters" | "backgrounds" | "audios") => void;
  onAddBackground: () => void;
}

const BackgroundActions: React.FC<BackgroundActionsProps> = ({
  searchTerm,
  setSearchTerm,
  openResourceFolder,
  onAddBackground,
}) => {
  return (
    <div className="resource-actions">
      <input
        type="text"
        placeholder="搜索背景..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <button onClick={() => openResourceFolder("backgrounds")}>
        打开背景文件夹
      </button>
      <button className="btn-primary" onClick={onAddBackground}>
        添加背景
      </button>
    </div>
  );
};

export default BackgroundActions;
