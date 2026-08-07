import React, { useState, useEffect } from "react";
import {
  Record,
  MyCharacter,
  CharacterVisual,
  Portrait,
  TempImageVisual,
  Emotion,
} from "@types";
import ApiService, { BASE_URL } from "@services/ApiService";
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
  const [portraitModalIndex, setPortraitModalIndex] = useState<number | null>(null);

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
  const currentTempImages = selectedRecord.tempImages || [];

  /** 拼接缩略图完整 URL */
  const getThumbnailUrl = (thumbnailPath: string | undefined): string => {
    if (!thumbnailPath) return "";
    if (thumbnailPath.startsWith("http")) return thumbnailPath;
    if (thumbnailPath.startsWith("/")) return BASE_URL + thumbnailPath;
    return `${BASE_URL}/assets/characters/${encodeURIComponent(thumbnailPath)}`;
  };

  /** 拼接临时图片完整 URL */
  const getTempImageUrl = (imagePath: string): string => {
    if (!imagePath) return "";
    if (imagePath.startsWith("http")) return imagePath;
    const clean = imagePath.replace(/^\.?\//, "");
    return `${BASE_URL}/${clean}`;
  };

  const updateCharacter = (index: number, field: string, value: any) => {
    const updatedChars = [...currentCharacters];
    updatedChars[index] = { ...updatedChars[index], [field]: value };
    const updatedRecord = { ...selectedRecord, chars: updatedChars };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  const deleteCharacter = (index: number) => {
    const deletedChar = currentCharacters[index];
    const updatedChars = currentCharacters.filter((_, i) => i !== index);

    // 同时从 speakerC 中移除对应角色
    const currentSpeakerC = selectedRecord.dialogue.speakerC || [];
    const updatedSpeakerC = currentSpeakerC.filter(
      (ref) => ref.characterID !== deletedChar?.chara?.characterID,
    );

    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      chars: updatedChars,
      dialogue: { ...selectedRecord.dialogue, speakerC: updatedSpeakerC },
    });
  };

  const addCharacter = () => {
    if (!newChara || !newPortrait) {
      alert("请选择角色和立绘");
      return;
    }
    const fullChara = characters.find((c) => c.characterID === newChara.characterID);
    const charaRef = fullChara || newChara;

    const newCharacter: CharacterVisual = {
      chara: {
        characterID: charaRef.characterID,
        characterName: charaRef.characterName,
        height: charaRef.height,
        faction: charaRef.faction,
        colorBg: charaRef.colorBg,
        colorText: charaRef.colorText,
      },
      portrait: newPortrait,
      posX: videoWidth / 2,
      posY: 0,
      adjX: 0,
      adjY: 0,
      dim: false,
    };

    // 同时添加到 speakerC（如果尚未存在）
    const currentSpeakerC = selectedRecord.dialogue.speakerC || [];
    const alreadyInSpeakerC = currentSpeakerC.some(
      (ref) => ref.characterID === charaRef.characterID,
    );
    const updatedSpeakerC = alreadyInSpeakerC
      ? currentSpeakerC
      : [...currentSpeakerC, {
          characterID: charaRef.characterID,
          characterName: charaRef.characterName,
          height: charaRef.height,
          faction: charaRef.faction,
          colorBg: charaRef.colorBg,
          colorText: charaRef.colorText,
        }];

    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      chars: [...currentCharacters, newCharacter],
      dialogue: {
        ...selectedRecord.dialogue,
        speakerC: updatedSpeakerC,
        speakerName: selectedRecord.dialogue.speakerName || charaRef.characterName,
        faction: selectedRecord.dialogue.faction || charaRef.faction,
      },
    });
    setNewChara(null);
    setNewPortrait(null);
    setShowAddForm(false);
  };

  // ===== 临时图片操作 =====

  const updateTempImage = (index: number, field: string, value: any) => {
    const updated = [...currentTempImages];
    updated[index] = { ...updated[index], [field]: value };
    updateRecord(selectedRecordIndex, { ...selectedRecord, tempImages: updated });
    console.log(`[CharactersProperties] updateTempImage[${index}]: ${field}=${value}`);
  };

  const deleteTempImage = async (index: number) => {
    const temp = currentTempImages[index];
    if (temp.uuid) {
      try {
        await ApiService.deleteTempImage(temp.uuid);
      } catch (e) {
        console.error("[CharactersProperties] 删除临时图片文件失败:", e);
      }
    }
    const updated = currentTempImages.filter((_, i) => i !== index);
    updateRecord(selectedRecordIndex, { ...selectedRecord, tempImages: updated });
    console.log(`[CharactersProperties] deleteTempImage[${index}]: uuid=${temp.uuid}`);
  };

  const addTempImage = async () => {
    try {
      const result = await (window as any).electronAPI?.openImageFile?.();
      if (!result || result.canceled || !result.filePaths?.length) return;

      const filePath = result.filePaths[0];
      console.log("[CharactersProperties] 选择临时图片:", filePath);

      // 通过 Electron IPC 读取本地文件为 Blob（避免 file:// fetch 被沙箱拦截）
      const fileBuffer = await (window as any).electronAPI.readFile(filePath);
      const uint8Array = new Uint8Array(fileBuffer);
      const blob = new Blob([uint8Array]);
      const file = new File([blob], filePath.split(/[\\/]/).pop() || "temp.png", {
        type: "image/png",
      });

      const uploadResult = await ApiService.uploadTempImage(file);
      console.log("[CharactersProperties] 临时图片上传结果:", uploadResult);

      const newTemp: TempImageVisual = {
        uuid: uploadResult.uuid,
        imagePath: uploadResult.imagePath,
        posX: 0,
        posY: 0,
        scale: 1.0,
        dim: false,
      };

      const updated = [...currentTempImages, newTemp];
      updateRecord(selectedRecordIndex, { ...selectedRecord, tempImages: updated });
    } catch (error) {
      console.error("[CharactersProperties] 添加临时图片失败:", error);
    }
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

            <div className="character-details">
              {/* 角色和立绘选择 */}
              <div className="form-section">
                <div className="form-section-title">角色 & 立绘</div>
                <div className="form-group-row">
                  <div className="form-group">
                    <label>角色</label>
                    <select
                      value={char.chara.characterID}
                      onChange={(e) => {
                        const selectedChara = characters.find(
                          (c) => c.characterID === e.target.value,
                        );
                        if (selectedChara) {
                          updateCharacter(index, "chara", {
                            characterID: selectedChara.characterID,
                            characterName: selectedChara.characterName,
                            height: selectedChara.height,
                            faction: selectedChara.faction,
                            colorBg: selectedChara.colorBg,
                            colorText: selectedChara.colorText,
                          });
                        }
                      }}
                    >
                      {characters.map((chara) => (
                        <option key={chara.characterID} value={chara.characterID}>
                          {chara.characterName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>立绘</label>
                    <div
                      className="portrait-selector-display"
                      onClick={() => setPortraitModalIndex(index)}
                      title="点击更换立绘"
                    >
                      {char.portrait?.thumbnailPath ? (
                        <img
                          src={getThumbnailUrl(char.portrait.thumbnailPath)}
                          alt={char.portrait.portName}
                        />
                      ) : (
                        <div className="portrait-placeholder">?</div>
                      )}
                      <span className="portrait-name">
                        {char.portrait?.portName || "未选择"}
                      </span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        flexDirection: "row",
                      }}
                    >
                      <span style={{ marginRight: "8px" }}>压暗</span>
                      <input
                        type="checkbox"
                        checked={char.dim}
                        onChange={(e) =>
                          updateCharacter(index, "dim", e.target.checked)
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* X坐标和Y坐标 */}
              <div className="form-section">
                <div className="form-section-title">X坐标 & Y坐标</div>
                <div className="form-group">
                  <label>X偏移: {char.adjX}</label>
                  <input
                    type="range"
                    min="0"
                    max={videoWidth}
                    value={char.adjX}
                    onChange={(e) =>
                      updateCharacter(index, "adjX", parseInt(e.target.value))
                    }
                    className="adjX-slider"
                  />
                </div>
                <div className="form-group">
                  <label>Y偏移</label>
                  <div className="adjY-input-container">
                    <input
                      type="number"
                      value={char.adjY}
                      onChange={(e) =>
                        updateCharacter(index, "adjY", parseInt(e.target.value) || 0)
                      }
                      className="adjY-input"
                    />
                    <button
                      onClick={() => updateCharacter(index, "adjY", 0)}
                      className="adjY-reset-btn"
                    >
                      重置
                    </button>
                  </div>
                </div>
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
                      const selectedChara = characters.find(
                        (c) => c.characterID === e.target.value,
                      );
                      if (selectedChara) {
                        setNewChara({
                          characterID: selectedChara.characterID,
                          characterName: selectedChara.characterName,
                          height: selectedChara.height,
                          faction: selectedChara.faction,
                          colorBg: selectedChara.colorBg,
                          colorText: selectedChara.colorText,
                        });
                        if (selectedChara.portraits.length > 0) {
                          setNewPortrait(selectedChara.portraits[0]);
                        }
                      }
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
                    onChange={(e) => {
                      if (newChara) {
                        const selectedChara = characters.find(
                          (c) => c.characterID === newChara.characterID,
                        );
                        if (selectedChara) {
                          const selectedPortrait = selectedChara.portraits.find(
                            (p) => p.portraitID === e.target.value,
                          );
                          if (selectedPortrait) {
                            setNewPortrait(selectedPortrait);
                          }
                        }
                      }
                    }}
                    disabled={!newChara}
                  >
                    <option value="">请选择立绘</option>
                    {newChara &&
                      characters
                        .find((c) => c.characterID === newChara.characterID)
                        ?.portraits.map((portrait) => (
                          <option key={portrait.portraitID} value={portrait.portraitID}>
                            {portrait.portName}
                          </option>
                        ))}
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

      {/* ===== 立绘选择弹窗 ===== */}
      {portraitModalIndex !== null && (() => {
        const idx = portraitModalIndex;
        const char = currentCharacters[idx];
        const charPortraits = characters.find(
          (c) => c.characterID === char?.chara?.characterID,
        )?.portraits || [];
        return (
          <div className="portrait-modal-overlay" onClick={() => setPortraitModalIndex(null)}>
            <div className="portrait-modal" onClick={(e) => e.stopPropagation()}>
              <div className="portrait-modal-header">
                <h4>选择立绘 — {char?.chara?.characterName || ""}</h4>
                <button onClick={() => setPortraitModalIndex(null)}>✕</button>
              </div>
              <div className="portrait-grid">
                {charPortraits.map((p) => (
                  <div
                    key={p.portraitID}
                    className={`portrait-grid-item${char?.portrait?.portraitID === p.portraitID ? " selected" : ""}`}
                    onClick={() => {
                      updateCharacter(idx, "portrait", p);
                      setPortraitModalIndex(null);
                    }}
                  >
                    <img
                      src={getThumbnailUrl(p.thumbnailPath)}
                      alt={p.portName}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect fill='%23eee' width='80' height='80'/><text x='40' y='45' text-anchor='middle' fill='%23999' font-size='12'>无缩略图</text></svg>";
                      }}
                    />
                    <div className="name">{p.portName}</div>
                    <div className="emotion-tag">{p.emotion}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== 临时图片区域 ===== */}
      <div className="temp-images-section">
        <h4>临时图片（路人/道具）</h4>
        {currentTempImages.map((temp, index) => (
          <div key={temp.uuid || index} className="temp-image-item">
            <div className="temp-image-header">
              <span>临时图片 {index + 1}</span>
              <button onClick={() => deleteTempImage(index)}>删除</button>
            </div>
            <img
              className="temp-image-preview"
              src={getTempImageUrl(temp.imagePath)}
              alt={`临时图片 ${index + 1}`}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="temp-image-controls">
              <label>
                缩放: {temp.scale.toFixed(1)}
                <input
                  type="range"
                  min="0.1"
                  max="3.0"
                  step="0.1"
                  value={temp.scale}
                  onChange={(e) =>
                    updateTempImage(index, "scale", parseFloat(e.target.value))
                  }
                />
              </label>
              <label>
                X坐标
                <input
                  type="number"
                  value={temp.posX}
                  onChange={(e) =>
                    updateTempImage(index, "posX", parseInt(e.target.value) || 0)
                  }
                />
              </label>
              <label>
                Y坐标
                <input
                  type="number"
                  value={temp.posY}
                  onChange={(e) =>
                    updateTempImage(index, "posY", parseInt(e.target.value) || 0)
                  }
                />
              </label>
              <label className="dim-label">
                <input
                  type="checkbox"
                  checked={temp.dim}
                  onChange={(e) =>
                    updateTempImage(index, "dim", e.target.checked)
                  }
                />
                压暗
              </label>
            </div>
          </div>
        ))}
        <button className="add-character-btn" onClick={addTempImage}>
          添加临时图片
        </button>
      </div>
    </div>
  );
};

export default CharactersProperties;
