import React, { useState, useEffect, useRef } from "react";
import {
  Record,
  CharacterRef,
  Portrait,
  MyCharacter,
  CharacterVisual,
  Emotion,
} from "../../../types";
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
  const [videoWidth, setVideoWidth] = useState(1280); // 默认视频宽度
  const [newChara, setNewChara] = useState<CharacterRef | null>(null);
  const [newPortrait, setNewPortrait] = useState<Portrait | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(0);

  useEffect(() => {
    fetchCharacters();
    // 获取视频宽度，这里应该从项目设置中获取
    // 暂时使用默认值
  }, []);

  const fetchCharacters = async () => {
    try {
      // 尝试从API获取数据
      const data = await ApiService.getCharacters();
      setCharacters(data);
    } catch (error) {
      console.error("获取角色列表失败，使用模拟数据:", error);
      // 使用模拟数据
      const mockCharacters: MyCharacter[] = [
        {
          characterID: "char001",
          characterName: "但丁",
          height: 180,
          faction: "事务所",
          colorBg: "#FF0000",
          colorText: "#FFFFFF",
          tags: [],
          portraits: [
            {
              portraitID: "port001",
              characterID: "char001",
              imagePath: "/images/dante_normal.png",
              portName: "普通",
              emotion: Emotion.NORMAL,
              faceX: 100,
              faceY: 100,
              length: 200,
              adjX: 0,
              adjY: 0,
              thumbnailPath: "/images/dante_normal_thumb.png",
            },
            {
              portraitID: "port002",
              characterID: "char001",
              imagePath: "/images/dante_happy.png",
              portName: "开心",
              emotion: Emotion.HAPPY,
              faceX: 100,
              faceY: 100,
              length: 200,
              adjX: 0,
              adjY: 0,
              thumbnailPath: "/images/dante_happy_thumb.png",
            },
          ],
        },
        {
          characterID: "char002",
          characterName: "维吉尔",
          height: 185,
          faction: "事务所",
          colorBg: "#0000FF",
          colorText: "#FFFFFF",
          tags: [],
          portraits: [
            {
              portraitID: "port003",
              characterID: "char002",
              imagePath: "/images/vergil_normal.png",
              portName: "普通",
              emotion: Emotion.NORMAL,
              faceX: 100,
              faceY: 100,
              length: 200,
              adjX: 0,
              adjY: 0,
              thumbnailPath: "/images/vergil_normal_thumb.png",
            },
            {
              portraitID: "port004",
              characterID: "char002",
              imagePath: "/images/vergil_angry.png",
              portName: "愤怒",
              emotion: Emotion.ANGRY,
              faceX: 100,
              faceY: 100,
              length: 200,
              adjX: 0,
              adjY: 0,
              thumbnailPath: "/images/vergil_angry_thumb.png",
            },
          ],
        },
        {
          characterID: "char003",
          characterName: "尼禄",
          height: 175,
          faction: "事务所",
          colorBg: "#00FF00",
          colorText: "#000000",
          tags: [],
          portraits: [
            {
              portraitID: "port005",
              characterID: "char003",
              imagePath: "/images/nero_normal.png",
              portName: "普通",
              emotion: Emotion.NORMAL,
              faceX: 100,
              faceY: 100,
              length: 200,
              adjX: 0,
              adjY: 0,
              thumbnailPath: "/images/nero_normal_thumb.png",
            },
          ],
        },
      ];
      setCharacters(mockCharacters);
    }
  };

  const currentChars = selectedRecord.chars || [];

  const updateCharacter = (index: number, field: string, value: any) => {
    const updatedChars = [...currentChars];
    updatedChars[index] = {
      ...updatedChars[index],
      [field]: value,
    };

    const updatedRecord = {
      ...selectedRecord,
      chars: updatedChars,
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  const deleteCharacter = (index: number) => {
    const updatedChars = currentChars.filter((_, i) => i !== index);
    const updatedRecord = {
      ...selectedRecord,
      chars: updatedChars,
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  const addCharacter = () => {
    if (!newChara || !newPortrait) {
      alert("请选择角色和立绘");
      return;
    }

    const newCharacter: CharacterVisual = {
      chara: newChara,
      portrait: newPortrait,
      posX: videoWidth / 2, // 默认在中间
      posY: 0,
      adjX: 0,
      adjY: 0,
      dim: false,
    };

    const updatedChars = [...currentChars, newCharacter];
    const updatedRecord = {
      ...selectedRecord,
      chars: updatedChars,
    };
    updateRecord(selectedRecordIndex, updatedRecord);

    // 重置表单
    setNewChara(null);
    setNewPortrait(null);
    setShowAddForm(false);
  };

  const handleAdjXQuickPosition = (index: number, position: number) => {
    // position: 0-6，对应7等分的位置
    const value = Math.floor((videoWidth / 6) * position);
    updateCharacter(index, "adjX", value);
  };

  const handleAdjYMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setIsDragging(true);
    setStartY(e.clientY);
    setStartValue(currentChars[index]?.adjY || 0);
  };

  const handleAdjYMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const deltaY = startY - e.clientY;
    const newValue = startValue + deltaY;

    // 找到当前正在调整的角色
    const activeInput = document.activeElement as HTMLInputElement;
    if (activeInput && activeInput.dataset.index) {
      const index = parseInt(activeInput.dataset.index);
      updateCharacter(index, "adjY", newValue);
    }
  };

  const handleAdjYMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleAdjYMouseMove);
      document.addEventListener("mouseup", handleAdjYMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleAdjYMouseMove);
        document.removeEventListener("mouseup", handleAdjYMouseUp);
      };
    }
  }, [isDragging, startY, startValue]);

  const resetAdjY = (index: number) => {
    updateCharacter(index, "adjY", 0);
  };

  // 角色排序功能
  const moveCharacter = (index: number, direction: "up" | "down") => {
    const chars = [...currentChars];

    // 边界检查
    if (direction === "up" && index <= 0) return;
    if (direction === "down" && index >= chars.length - 1) return;

    // 交换元素
    const newIndex = direction === "up" ? index - 1 : index + 1;
    [chars[index], chars[newIndex]] = [chars[newIndex], chars[index]];

    const updatedRecord = {
      ...selectedRecord,
      chars: chars,
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  return (
    <div className="characters-properties">
      <h4>角色立绘</h4>
      <div className="characters-list">
        {currentChars.map((char, index) => (
          <div key={index} className="character-item">
            <div className="character-header">
              <h5>{char.chara.characterName}</h5>
              <div className="character-controls">
                <div className="character-order-controls">
                  <button
                    className="order-up-btn"
                    onClick={() => moveCharacter(index, "up")}
                    disabled={index === 0}
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    className="order-down-btn"
                    onClick={() => moveCharacter(index, "down")}
                    disabled={index === currentChars.length - 1}
                    title="下移"
                  >
                    ↓
                  </button>
                </div>
                <button onClick={() => deleteCharacter(index)}>删除</button>
              </div>
            </div>

            <div className="character-details">
              {/* 角色和立绘选择在同一行 */}
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
                        <option
                          key={chara.characterID}
                          value={chara.characterID}
                        >
                          {chara.characterName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>立绘</label>
                    <select
                      value={char.portrait.portraitID}
                      onChange={(e) => {
                        const selectedChara = characters.find(
                          (c) => c.characterID === char.chara.characterID,
                        );
                        if (selectedChara) {
                          const selectedPortrait = selectedChara.portraits.find(
                            (p) => p.portraitID === e.target.value,
                          );
                          if (selectedPortrait) {
                            updateCharacter(
                              index,
                              "portrait",
                              selectedPortrait,
                            );
                          }
                        }
                      }}
                    >
                      {characters
                        .find((c) => c.characterID === char.chara.characterID)
                        ?.portraits.map((portrait) => (
                          <option
                            key={portrait.portraitID}
                            value={portrait.portraitID}
                          >
                            {portrait.portName}
                          </option>
                        ))}
                    </select>
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

                {/* X偏移滑块 */}
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

                  {/* 7等分快速定位按钮 */}
                  <div className="adjX-quick-positions">
                    {[0, 1, 2, 3, 4, 5, 6].map((pos) => (
                      <button
                        key={pos}
                        onClick={() => handleAdjXQuickPosition(index, pos)}
                        className="adjX-quick-btn"
                      >
                        {/* {pos === 0 ? '左' : pos === 6 ? '右' : `${pos}/7`} */}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Y偏移输入框 */}
                <div className="form-group">
                  <label>Y偏移</label>
                  <div className="adjY-input-container">
                    <input
                      type="number"
                      value={char.adjY}
                      onChange={(e) =>
                        updateCharacter(
                          index,
                          "adjY",
                          parseInt(e.target.value) || 0,
                        )
                      }
                      onMouseDown={(e) => handleAdjYMouseDown(e, index)}
                      data-index={index}
                      className="adjY-input"
                    />
                    <button
                      onClick={() => resetAdjY(index)}
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

        {/* 添加立绘表单 */}
        {showAddForm ? (
          <div className="character-item add-form">
            <div className="character-header">
              <h5>添加新立绘</h5>
              <button onClick={() => setShowAddForm(false)}>取消</button>
            </div>

            <div className="character-details">
              {/* 角色和立绘选择在同一行 */}
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
                        // 如果该角色有立绘，默认选择第一个
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
                          <option
                            key={portrait.portraitID}
                            value={portrait.portraitID}
                          >
                            {portrait.portName}
                          </option>
                        ))}
                  </select>
                </div>
              </div>

              <button
                onClick={addCharacter}
                className="add-character-confirm-btn"
                disabled={!newChara || !newPortrait}
              >
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
