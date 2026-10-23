import React, { useState, useEffect, useRef } from "react";
import {
  Record,
  MyCharacter,
  CharacterVisual,
  Portrait,
} from "@types";
import ApiService, { BASE_URL } from "@services/ApiService";
import { getDefaultPortrait } from "@features/common/utils/portraitUtils";
import { useFocusFlash } from "../preview/useFocusFlash";
import type { PropertyFocusRequest } from "../preview/previewTargets";
import CharacterSelect, {
  CharacterSelectOption,
} from "./CharacterSelect";
import NumberField from "./NumberField";
import CharacterAnimationPanel from "./CharacterAnimationPanel";
import {
  DESIGN_CANVAS_WIDTH,
  MAX_VISUAL_SCALE,
  MIN_VISUAL_SCALE,
  VISUAL_SCALE_STEP,
  createCoordinateMapper,
  normalizeScale,
} from "./visualCoordinates";
import "../RecordEditor.css";
import "./TransformControls.css";
import "./CharactersProperties.css";

/*
 * 坐标系说明：记录里持久化的立绘坐标（adjX/adjY）存 1080p 设计画布空间里的像素，
 * 与设置页选的输出分辨率无关 —— 所以同一条记录换任何分辨率导出，构图都完全一致。
 *
 * 编辑器里的滑杆/数值框按**设置页选的视频大小**显示（见 visualCoordinates 的
 * createCoordinateMapper）：X 轴滑块范围是 ±视频宽度/2、Y 轴是 ±视频高度，
 * 和预览图的实际像素一一对应；写回记录前再换算回设计画布像素。
 *
 * 临时图片（路人/道具）已拆到同级的 TempImagesProperties（「临时图片」页签），
 * 那边沿用同一套坐标换算规则。
 */

/** 立绘位置快捷按钮的档位：-3..3 对应画面宽度的 0%、1/6 … 5/6、100% */
const QUICK_POSITION_STEPS = [-3, -2, -1, 0, 1, 2, 3];

/** 档位 n 对应的画面宽度百分比（50 = 居中） */
const stepToPercent = (n: number) => 50 + (n * 100) / 6;

/**
 * 立绘档位 n 在「当前视频宽度」下的 X 偏差：0% → -宽/2、50% → 0、100% → +宽/2。
 * 与后端 %位置% 换算（adjX = (位置% - 50) * 1920 / 100）走的是同一套语义，只是显示单位不同。
 */
const stepToUiAdjX = (n: number, uiWidth: number) => (uiWidth * n) / 6;

interface CharactersPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
  /** 设置页选的输出视频宽度（滑杆范围的基准）；缺省时回退到设计画布宽度 */
  videoWidth?: number;
  /** 设置页选的输出视频高度 */
  videoHeight?: number;
  /**
   * 从预览里点中立绘后下发的定位请求：收到后滚到对应角色卡片并闪一下。
   * 不传表示没有跳转（例如用户自己点的页签）。
   */
  focusRequest?: PropertyFocusRequest | null;
  /** 是否剧情模式；人格故事（false）下立绘不参与渲染，动画区要置灰提示 */
  plot?: boolean;
  /** 预览当前停在哪一帧（关键帧时间轴画播放头用） */
  previewFrame?: number | null;
  /** 请求预览跳到某一帧（点时间轴 / 关键帧时触发） */
  onSeekFrame?: (recordFrame: number) => void;
  /** 一句台词本身的长度（max(语音, 文字) 帧）；关键帧动画默认按它铺满 */
  lineFrames?: number;
}

const CharactersProperties: React.FC<CharactersPropertiesProps> = ({
  selectedRecord,
  selectedRecordIndex,
  updateRecord,
  videoWidth,
  videoHeight,
  focusRequest,
  plot = true,
  previewFrame,
  onSeekFrame,
  lineFrames,
}) => {
  // 滑杆/数值框的坐标系 = 设置页选的视频大小（预览图就是这个尺寸）；
  // 写回记录时统一换算回 1080p 设计画布，换分辨率后构图不变。
  const { uiWidth, uiHeight, toUiX, toUiY, toDesignX, toDesignY } =
    createCoordinateMapper(videoWidth, videoHeight);

  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [newChara, setNewChara] = useState<any | null>(null);
  const [newPortrait, setNewPortrait] = useState<Portrait | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [portraitModalIndex, setPortraitModalIndex] = useState<number | null>(null);

  // 每张角色卡片的 DOM 节点：从预览点中立绘时要滚到它
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flashingIndex = useFocusFlash(
    focusRequest,
    "characters",
    (index) => itemRefs.current[index],
  );

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

  // 角色下拉选项（带默认立绘小头像），与"说话人"下拉框使用同一个组件
  const characterOptions: CharacterSelectOption[] = characters.map((chara) => ({
    value: chara.characterID,
    label: chara.characterName,
    avatarCharacter: chara,
  }));

  /** 拼接缩略图完整 URL */
  const getThumbnailUrl = (thumbnailPath: string | undefined): string => {
    if (!thumbnailPath) return "";
    if (thumbnailPath.startsWith("http")) return thumbnailPath;
    if (thumbnailPath.startsWith("/")) return BASE_URL + thumbnailPath;
    return `${BASE_URL}/assets/characters/${encodeURIComponent(thumbnailPath)}`;
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
      // 后端会用 adjX 重新计算 posX（CharacterVisual.updatePos），这里给同一套设计坐标下的初值：居中
      posX: DESIGN_CANVAS_WIDTH / 2,
      posY: 0,
      adjX: 0,
      adjY: 0,
      scale: 1,
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

  return (
    <div className="characters-properties">
      <h4>角色立绘</h4>
      <div className="characters-list">
        {currentCharacters.map((char, index) => (
          <div
            key={index}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            className={`character-item${
              flashingIndex === index ? " property-focus-flash" : ""
            }`}
          >
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
                <button
                  className="delete-character-btn"
                  onClick={() => deleteCharacter(index)}
                >
                  删除
                </button>
              </div>
            </div>

            <div className="character-details">
              {/* 第一行：角色(1/4) | 立绘(1/2) | 压暗(1/4) */}
              <div className="char-row char-row-top">
                <div className="char-col char-col-1-4">
                  <label>角色</label>
                  <CharacterSelect
                    value={char.chara.characterID}
                    options={characterOptions}
                    fallbackLabel={char.chara.characterName}
                    ariaLabel="角色"
                    onChange={(characterID) => {
                      const selectedChara = characters.find(
                        (c) => c.characterID === characterID,
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
                  />
                </div>
                <div className="char-col char-col-1-2">
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
                <div className="char-col char-col-1-4 char-col-dim">
                  <label>立绘压暗</label>
                  <input
                    type="checkbox"
                    checked={char.dim}
                    onChange={(e) =>
                      updateCharacter(index, "dim", e.target.checked)
                    }
                  />
                </div>
              </div>

              {/* 第二行：缩放 — 标签 | 数值框 | 滑块
                  缩放以脸部裁剪框中心为基准，只改大小，不动 X/Y 偏移；重置按钮在卡片标题行 */}
              <div className="transform-row">
                <span className="transform-label">缩放</span>
                <NumberField
                  className="transform-number"
                  value={normalizeScale(char.scale)}
                  min={MIN_VISUAL_SCALE}
                  max={MAX_VISUAL_SCALE}
                  ariaLabel={`立绘 ${index + 1} 缩放`}
                  title="立绘缩放（1 = 原始大小，以脸部裁剪框中心为基准）"
                  onChange={(value) => updateCharacter(index, "scale", value)}
                />
                <button
                  type="button"
                  className="transform-reset-btn"
                  onClick={() => updateCharacter(index, "scale", 1)}
                  title="复原：缩放恢复 1.0"
                >
                  ↺
                </button>
                <div className="transform-slider">
                  <input
                    type="range"
                    min={MIN_VISUAL_SCALE}
                    max={MAX_VISUAL_SCALE}
                    step={VISUAL_SCALE_STEP}
                    value={normalizeScale(char.scale)}
                    aria-label={`立绘 ${index + 1} 缩放滑块`}
                    onChange={(e) =>
                      updateCharacter(index, "scale", Number(e.target.value))
                    }
                  />
                </div>
              </div>

              {/* 第三行：X坐标偏移 — 标签 | 数值框 | 滑块(含快速定位按钮) */}
              <div className="char-row">
                <span className="char-label-fixed">X坐标调整</span>
                <NumberField
                  className="char-input-fixed"
                  integer
                  value={toUiX(char.adjX)}
                  ariaLabel={`立绘 ${index + 1} X 坐标`}
                  onChange={(value) =>
                    updateCharacter(index, "adjX", toDesignX(value))
                  }
                />
                <div className="char-slider-auto">
                  <div className="adjX-quick-positions">
                    {QUICK_POSITION_STEPS.map((n) => (
                      <button
                        key={n}
                        onClick={() =>
                          updateCharacter(
                            index,
                            "adjX",
                            toDesignX(stepToUiAdjX(n, uiWidth)),
                          )
                        }
                        className="adjX-quick-btn"
                        title={`${stepToPercent(n)}% （adjX=${Math.round(stepToUiAdjX(n, uiWidth))}）`}
                      />
                    ))}
                  </div>
                  <input
                    type="range"
                    min={-Math.round(uiWidth / 2)}
                    max={Math.round(uiWidth / 2)}
                    value={toUiX(char.adjX)}
                    onChange={(e) =>
                      updateCharacter(
                        index,
                        "adjX",
                        toDesignX(parseInt(e.target.value)),
                      )
                    }
                    className="adjX-slider"
                  />
                </div>
              </div>

              {/* 第四行：Y坐标偏移 — 标签 | 数值框 | 滑块
                  Y 方向用一个视频高度为界：足以把立绘完全移出画面上下边缘 */}
              <div className="char-row">
                <span className="char-label-fixed">Y坐标调整</span>
                <NumberField
                  className="char-input-fixed"
                  integer
                  value={toUiY(char.adjY)}
                  ariaLabel={`立绘 ${index + 1} Y 坐标`}
                  onChange={(value) =>
                    updateCharacter(index, "adjY", toDesignY(value))
                  }
                />
                <input
                  type="range"
                  min={-uiHeight}
                  max={uiHeight}
                  value={toUiY(char.adjY)}
                  onChange={(e) =>
                    updateCharacter(
                      index,
                      "adjY",
                      toDesignY(parseInt(e.target.value)),
                    )
                  }
                  className="char-slider-auto"
                />
              </div>

              {/* 移动动画：预设 + 参数 / 关键帧表格（预览用上方的 ▶ 播放） */}
              <CharacterAnimationPanel
                anim={char.anim}
                elementLabel={char.chara?.characterName ?? `立绘 ${index + 1}`}
                plot={plot}
                previewFrame={previewFrame}
                onSeekFrame={onSeekFrame}
                lineFrames={lineFrames}
                onChange={(next) => updateCharacter(index, "anim", next)}
              />
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
              {/* 角色和立绘选择 — 角色名较短，立绘首次即显示缩略图 */}
              <div className="char-row char-row-top">
                <div className="char-col char-col-1-4">
                  <label>角色</label>
                  <CharacterSelect
                    value={newChara?.characterID || ""}
                    options={[
                      { value: "", label: "请选择角色", badge: "?" },
                      ...characterOptions,
                    ]}
                    ariaLabel="角色"
                    onChange={(characterID) => {
                      if (!characterID) {
                        setNewChara(null);
                        setNewPortrait(null);
                        return;
                      }
                      const selectedChara = characters.find(
                        (c) => c.characterID === characterID,
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
                        const defaultPortrait = getDefaultPortrait(
                          selectedChara.portraits,
                        );
                        setNewPortrait(defaultPortrait);
                      }
                    }}
                  />
                </div>
                <div className="char-col char-col-1-2">
                  <label>立绘</label>
                  {newChara ? (
                    (() => {
                      const charPortraits = characters.find(
                        (c) => c.characterID === newChara.characterID,
                      )?.portraits || [];
                      if (charPortraits.length === 0) {
                        return <div className="portrait-selector-display" style={{cursor: "default"}}>
                          <div className="portrait-placeholder">—</div>
                          <span className="portrait-name">该角色无立绘</span>
                        </div>;
                      }
                      return (
                        <div className="portrait-selector-display"
                          onClick={() => {
                            const modal = document.createElement("div");
                            modal.className = "portrait-modal-overlay";
                            modal.onclick = () => modal.remove();
                            const content = document.createElement("div");
                            content.className = "portrait-modal";
                            content.onclick = (ev) => ev.stopPropagation();
                            content.innerHTML = `
                              <div class="portrait-modal-header">
                                <h4>选择立绘</h4>
                                <button>✕</button>
                              </div>
                              <div class="portrait-grid" id="add-portrait-grid-record"></div>`;
                            modal.appendChild(content);
                            document.body.appendChild(modal);
                            content.querySelector("button")!.onclick = () => modal.remove();

                            const grid = content.querySelector("#add-portrait-grid-record")!;
                            charPortraits.forEach((p: Portrait) => {
                              const item = document.createElement("div");
                              item.className = `portrait-grid-item${newPortrait?.portraitID === p.portraitID ? " selected" : ""}`;
                              item.innerHTML = `
                                <img src="${getThumbnailUrl(p.thumbnailPath)}" alt="${p.portName}"
                                  onerror="this.src='data:image/svg+xml,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2780%27 height=%2780%27><rect fill=%27%23eee%27 width=%2780%27 height=%2780%27/><text x=%2740%27 y=%2745%27 text-anchor=%27middle%27 fill=%27%23999%27 font-size=%2712%27>无缩略图</text></svg>'"/>
                                <div class="name">${p.portName}</div>
                                <div class="emotion-tag">${p.emotion}</div>`;
                              item.onclick = () => {
                                setNewPortrait(p);
                                modal.remove();
                              };
                              grid.appendChild(item);
                            });
                          }}
                          title="点击选择立绘"
                        >
                          {newPortrait?.thumbnailPath ? (
                            <img src={getThumbnailUrl(newPortrait.thumbnailPath)} alt={newPortrait.portName} />
                          ) : (
                            <div className="portrait-placeholder">?</div>
                          )}
                          <span className="portrait-name">
                            {newPortrait?.portName || "点击选择立绘"}
                          </span>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="portrait-selector-display" style={{cursor: "default", opacity: 0.5}}>
                      <div className="portrait-placeholder">—</div>
                      <span className="portrait-name">请先选择角色</span>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={addCharacter} disabled={!newChara}>
                确认添加
              </button>
            </div>
          </div>
        ) : (
          <button
            className="add-portrait-btn"
            onClick={() => setShowAddForm(true)}
          >
            + 添加立绘
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

    </div>
  );
};

export default CharactersProperties;
