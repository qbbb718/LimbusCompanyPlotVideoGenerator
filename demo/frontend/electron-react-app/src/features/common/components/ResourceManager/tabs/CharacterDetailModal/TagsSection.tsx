import React, { useState } from "react";
import { MyCharacter } from "@types";

interface TagsSectionProps {
  character: MyCharacter;
  onCharacterUpdate: (character: MyCharacter) => void;
}

const TagsSection: React.FC<TagsSectionProps> = ({
  character,
  onCharacterUpdate,
}) => {
  const [newTagInput, setNewTagInput] = useState("");

  const handleAddTag = () => {
    if (!newTagInput.trim()) return;

    const tag = newTagInput.trim();
    if (character.tags?.includes(tag)) {
      alert("该标签已存在");
      return;
    }

    onCharacterUpdate({
      ...character,
      tags: [...(character.tags || []), tag],
    });
    setNewTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onCharacterUpdate({
      ...character,
      tags: character.tags?.filter((tag) => tag !== tagToRemove) || [],
    });
  };

  return (
    <div className="tags-section">
      <label>角色标签</label>
      <div className="tags-container">
        {character.tags?.map((tag) => (
          <div key={tag} className="tag">
            {tag}
            <span className="tag-remove" onClick={() => handleRemoveTag(tag)}>
              ×
            </span>
          </div>
        ))}
      </div>
      <div className="tag-input-container">
        <input
          type="text"
          className="tag-input"
          placeholder="添加新标签"
          value={newTagInput}
          onChange={(e) => setNewTagInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
        />
        <button onClick={handleAddTag}>添加</button>
      </div>
    </div>
  );
};

export default TagsSection;
