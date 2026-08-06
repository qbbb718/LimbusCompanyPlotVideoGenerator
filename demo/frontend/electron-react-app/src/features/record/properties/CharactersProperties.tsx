import React, { useState, useEffect } from "react";
import {
  Record,
  MyCharacter,
  CharacterVisual,
  Portrait,
  Emotion,
} from "@types";
import ApiService from "@services/ApiService";
import "../RecordEditor.css";
import "./CharactersProperties.css";

interface CharactersPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
}

const CharactersProperties: React.FC<CharactersPropertiesProps> = ({
  selectedRecord,
  selectedRecordIndex,
  updateRecord,
}) => {
  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [videoWidth] = useState(1280);
  const [newChara, setNewChara] = useState<any | null>(null);
  const [newPortrait, setNewPortrait] = useState<Portrait | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchCharacters();
  }, []);

  const fetchCharacters = async () => {
    try {
      const data = await ApiService.getCharacters();
      setCharacters(data);
    } catch (error) {
      console.error("获取角色失败", error);
    }
  };

  const currentCharacters = selectedRecord.chars || [];

  const updateCharacter = (index: number, field: string, value: any) => {
    const updatedChars = [...currentCharacters];
    updatedChars[index] = { ...updatedChars[index], [field]: value };
    const updatedRecord = { ...selectedRecord, chars: updatedChars };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  const deleteCharacter = (index: number) => {
    const updatedChars = currentCharacters.filter((_, i) => i !== index);
    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      chars: updatedChars,
    });
  };

  const addCharacter = () => {
    if (!newChara || !newPortrait) {
      alert("请选择角色和立绘");
      return;
    }
    const newCharacter: CharacterVisual = {
      chara: newChara,
      portrait: newPortrait,
      posX: videoWidth / 2,
      posY: 0,
      adjX: 0,
      adjY: 0,
      dim: false,
    };
    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      chars: [...currentCharacters, newCharacter],
    });
    setNewChara(null);
    setNewPortrait(null);
    setShowAddForm(false);
  };

  return (
    <div className="characters-properties">
      <h4>角色立绘</h4>
      <div className="characters-list">
        {currentCharacters.map((char, index) => (
          <div key={index} className="character-item">
            <div className="character-header">
              <h5>{char.chara.characterName}</h5>
              <div className="character-controls">
                <div className="character-order-controls">
                  <button
                    onClick={() => {
                      if (index > 0) {
                        const c = [...currentCharacters];
                        [c[index - 1], c[index]] = [c[index], c[index - 1]];
                        updateRecord(selectedRecordIndex, {
                          ...selectedRecord,
                          chars: c,
                        });
                      }
                    }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => {
                      if (index < currentCharacters.length - 1) {
                        const c = [...currentCharacters];
                        [c[index + 1], c[index]] = [c[index], c[index + 1]];
                        updateRecord(selectedRecordIndex, {
                          ...selectedRecord,
                          chars: c,
                        });
                      }
                    }}
                  >
                    ↓
                  </button>
                </div>
                <button onClick={() => deleteCharacter(index)}>删除</button>
              </div>
            </div>
          </div>
        ))}

        {showAddForm ? (
          <div className="character-item add-form">
            <div className="character-header">
              <h5>添加新立绘</h5>
              <button onClick={() => setShowAddForm(false)}>取消</button>
            </div>
            <div className="character-details">
              <div className="form-group-row">
                <div className="form-group">
                  <label>角色</label>
                  <select
                    value={newChara?.characterID || ""}
                    onChange={(e) => {
                      setNewChara({
                        characterID: e.target.value,
                        characterName: e.target.value,
                        height: 180,
                        faction: "",
                        colorBg: "#fff",
                        colorText: "#000",
                      });
                    }}
                  >
                    <option value="">请选择角色</option>
                    {characters.map((chara) => (
                      <option key={chara.characterID} value={chara.characterID}>
                        {chara.characterName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>立绘</label>
                  <select
                    value={newPortrait?.portraitID || ""}
                    onChange={() => {
                      /* simplified */
                    }}
                  >
                    <option value="">请选择立绘</option>
                  </select>
                </div>
              </div>
              <button onClick={addCharacter} disabled={!newChara}>
                确认添加
              </button>
            </div>
          </div>
        ) : (
          <button
            className="add-character-btn"
            onClick={() => setShowAddForm(true)}
          >
            添加立绘
          </button>
        )}
      </div>
    </div>
  );
};

export default CharactersProperties;
