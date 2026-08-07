import React, { useState, useEffect } from "react";
import { Record, DialogueAlign, Emotion, MyCharacter, CharacterRef } from "../../../types";
import ApiService from "../../../ApiService";
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
  const [characters, setCharacters] = useState<MyCharacter[]>([]);

  useEffect(() => {
    ApiService.getCharacters()
      .then(setCharacters)
      .catch(() => setCharacters([]));
  }, []);

  const updateDialogue = (
    field: keyof typeof selectedRecord.dialogue,
    value: any,
  ) => {
    const updatedDialogue = {
      ...selectedRecord.dialogue,
      [field]: value,
    };
    // 手动编辑 speakerName 或 faction 时清除 speakerC，
    // 让后端根据 Dialogue 的 speakerName/faction 生成临时名片
    if (field === "speakerName" || field === "faction") {
      updatedDialogue.speakerC = [];
      console.log(
        `[TextProperties] 手动更改 ${field}="${value}"，已清除 speakerC → 后端将使用临时名片`,
      );
    }
    const updatedRecord = {
      ...selectedRecord,
      dialogue: updatedDialogue,
    };
    console.log(
      `[TextProperties] updateDialogue: ${field}=${value}`,
      `speakerC.length=${updatedDialogue.speakerC.length}`,
    );
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  const handleCharacterSelect = (characterID: string) => {
    if (!characterID) return;
    const chara = characters.find((c) => c.characterID === characterID);
    if (!chara) return;

    const ref: CharacterRef = {
      characterID: chara.characterID,
      characterName: chara.characterName,
      height: chara.height,
      faction: chara.faction,
      colorBg: chara.colorBg,
      colorText: chara.colorText,
    };

    console.log(
      `[TextProperties] 下拉选择角色: ${chara.characterName} (${chara.characterID})`,
      `faction=${chara.faction}, speakerC=[${ref.characterName}]`,
    );

    const updatedRecord = {
      ...selectedRecord,
      dialogue: {
        ...selectedRecord.dialogue,
        speakerName: chara.characterName,
        faction: chara.faction,
        speakerC: [ref],
      },
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  const currentSpeaker = selectedRecord.dialogue.speakerC?.[0];

  return (
    <div className="text-properties">
      <div className="form-row">
        <div className="form-group half-width">
          <label>说话人</label>
          <select
            value={currentSpeaker?.characterID || ""}
            onChange={(e) => handleCharacterSelect(e.target.value)}
          >
            <option value="">-- 选择或手动输入 --</option>
            {characters.map((c) => (
              <option key={c.characterID} value={c.characterID}>
                {c.characterName}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={selectedRecord.dialogue.speakerName}
            onChange={(e) => updateDialogue("speakerName", e.target.value)}
            placeholder="或手动输入说话人名称"
            style={{ marginTop: 4 }}
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
        <label>场景名称</label>
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
