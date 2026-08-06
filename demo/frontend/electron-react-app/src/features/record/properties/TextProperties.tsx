import React from "react";
import { Record } from "@types";
import "../RecordEditor.css";
import "./TextProperties.css";

interface TextPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
}

const TextProperties: React.FC<TextPropertiesProps> = ({
  selectedRecord,
  selectedRecordIndex,
  updateRecord,
}) => {
  const updateDialogue = (
    field: keyof typeof selectedRecord.dialogue,
    value: any,
  ) => {
    const updatedRecord = {
      ...selectedRecord,
      dialogue: { ...selectedRecord.dialogue, [field]: value },
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  return (
    <div className="text-properties">
      <div className="form-row">
        <div className="form-group half-width">
          <label>说话人</label>
          <input
            type="text"
            value={selectedRecord.dialogue.speakerName}
            onChange={(e) => updateDialogue("speakerName", e.target.value)}
          />
        </div>
        <div className="form-group half-width">
          <label>阵营</label>
          <input
            type="text"
            value={selectedRecord.dialogue.faction}
            onChange={(e) => updateDialogue("faction", e.target.value)}
          />
        </div>
      </div>
      <div className="form-group">
        <label>对话内容</label>
        <textarea
          value={selectedRecord.dialogue.text}
          onChange={(e) => updateDialogue("text", e.target.value)}
          rows={5}
        />
      </div>
      <div className="form-group">
        <label>场景</label>
        <input
          type="text"
          value={selectedRecord.dialogue.location}
          onChange={(e) => updateDialogue("location", e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>显示速度</label>
        <input
          type="range"
          min="1"
          max="6"
          step="1"
          value={selectedRecord.dialogue.speed}
          onChange={(e) => updateDialogue("speed", parseInt(e.target.value))}
        />
        <div className="speed-indicator">{selectedRecord.dialogue.speed}</div>
      </div>
    </div>
  );
};

export default TextProperties;
