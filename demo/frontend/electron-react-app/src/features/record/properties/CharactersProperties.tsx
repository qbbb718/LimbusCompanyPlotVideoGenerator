import React, { useState, useEffect, useRef } from "react";
import {
  Record,
  MyCharacter,
  CharacterVisual,
  Portrait,
} from "@types";
import ApiService from "@services/ApiService";
import {
  MISSING_THUMBNAIL_PLACEHOLDER,
  buildPortraitThumbnailUrl,
  getDefaultPortrait,
} from "@features/common/utils/portraitUtils";
import { useFocusFlash } from "../preview/useFocusFlash";
import type { PropertyFocusRequest } from "../preview/previewTargets";
import CharacterSelect, {
  CharacterSelectOption,
} from "./CharacterSelect";
import NumberField from "./NumberField";
import CharacterAnimationPanel from "./CharacterAnimationPanel";
import EmotionAnimPicker from "./EmotionAnimPicker";
import PortraitPickerDialog from "./PortraitPickerDialog";
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
  /**
   * 跳转到「资源管理 → 序列帧动画」。
   *
   * <p>情绪动画的**制作入口在资源管理**，这里只保留"选哪一段"和一个跳转按钮。
   * 不传则不显示跳转按钮（独立测试里常见）。
   */
  onOpenAnimationLibrary?: () => void;
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
  onOpenAnimationLibrary,
}) => {
  // 滑杆/数值框的坐标系 = 设置页选的视频大小（预览图就是这个尺寸）；
  // 写回记录时统一换算回 1080p 设计画布，换分辨率后构图不变。
  const { uiWidth, uiHeight, toUiX, toUiY, toDesignX, toDesignY } =
    createCoordinateMapper(videoWidth, videoHeight);

  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [newChara, setNewChara] = useState<any | null>(null);
  const [newPortrait, setNewPortrait] = useState<Portrait | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  /** 正在换立绘的卡片下标（null = 弹窗没开） */
  const [portraitPickerIndex, setPortraitPickerIndex] = useState<number | null>(
    null,
  );
  /** 添加表单里"挑初始立绘"的弹窗是否打开 */
  const [addPickerOpen, setAddPickerOpen] = useState(false);

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

  /**
   * 素材库里某个角色的立绘列表。
   *
   * <p>返回 `null` 表示「素材库里找不到这个角色」（角色被删了、或角色列表还没拉回来），
   * 与「角色存在但一张立绘都没有」（返回空数组）区分开，弹窗里给的是两种不同的提示。
   */
  const portraitsOf = (characterID: string | undefined): Portrait[] | null => {
    const found = characters.find((chara) => chara.characterID === characterID);
    if (!found) return null;
    return found.portraits ?? [];
  };

  /**
   * 「选择立绘」弹窗到底列什么。
   *
   * <p>正常情况下 = 素材库里这个角色的全部立绘。但记录里存的角色是**内联快照**：
   * 角色在素材库里被删掉（或重新导入后换了 ID）时按 ID 找不到，弹窗就会是一张空网格 ——
   * 用户只看到一个只有标题的白框，不知道发生了什么。这时至少把**记录当前用的那张立绘**列出来，
   * 并在顶部说明为什么只有这一张：用户能看到自己在用什么，也知道"要换别的得先去「角色」里重选"。
   */
  const pickerSourceFor = (
    characterID: string | undefined,
    currentPortrait?: Portrait | null,
  ): { portraits: Portrait[]; notice?: string; emptyHint: string } => {
    const library = portraitsOf(characterID);
    if (library && library.length > 0) {
      return { portraits: library, emptyHint: "" };
    }

    const current = currentPortrait ? [currentPortrait] : [];
    if (current.length === 0) {
      return {
        portraits: [],
        emptyHint:
          library === null
            ? "素材库里找不到这个角色（可能已被删除），请先在「角色」里重新选择"
            : "这个角色还没有立绘，可到「资源管理 → 角色」里添加",
      };
    }

    return {
      portraits: current,
      notice:
        library === null
          ? "素材库里找不到这个角色（可能已被删除）：下面是这条记录当前使用的立绘。要换别的立绘，请先在「角色」里重新选择这个角色"
          : "素材库里这个角色还没有立绘：下面是这条记录当前使用的立绘",
      emptyHint: "",
    };
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
                  <button
                    type="button"
                    className="portrait-selector-display"
                    onClick={() => setPortraitPickerIndex(index)}
                    title="点击更换立绘"
                    aria-label={`更换立绘（当前：${char.portrait?.portName || "未选择"}）`}
                  >
                    {char.portrait?.thumbnailPath ? (
                      <img
                        src={buildPortraitThumbnailUrl(
                          char.portrait.thumbnailPath,
                        )}
                        alt={char.portrait.portName}
                        onError={(event) => {
                          const image = event.currentTarget;
                          image.onerror = null;
                          image.src = MISSING_THUMBNAIL_PLACEHOLDER;
                        }}
                      />
                    ) : (
                      <span className="portrait-placeholder">?</span>
                    )}
                    <span className="portrait-name">
                      {char.portrait?.portName || "未选择"}
                    </span>
                  </button>
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

              {/* 情绪动画：这里只负责"选哪一段"，编排在「资源管理 → 序列帧动画」 */}
              <EmotionAnimPicker
                emotionAnim={char.emotionAnim}
                elementLabel={char.chara?.characterName ?? `立绘 ${index + 1}`}
                plot={plot}
                onOpenAnimationLibrary={onOpenAnimationLibrary}
                onChange={(next) => updateCharacter(index, "emotionAnim", next)}
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
                      const charPortraits =
                        portraitsOf(newChara.characterID) ?? [];
                      if (charPortraits.length === 0) {
                        return (
                          <div
                            className="portrait-selector-display"
                            aria-disabled="true"
                          >
                            <span className="portrait-placeholder">—</span>
                            <span className="portrait-name">该角色无立绘</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          type="button"
                          className="portrait-selector-display"
                          onClick={() => setAddPickerOpen(true)}
                          title="点击选择立绘"
                          aria-label={`选择立绘（当前：${newPortrait?.portName || "未选择"}）`}
                        >
                          {newPortrait?.thumbnailPath ? (
                            <img
                              src={buildPortraitThumbnailUrl(
                                newPortrait.thumbnailPath,
                              )}
                              alt={newPortrait.portName}
                              onError={(event) => {
                                const image = event.currentTarget;
                                image.onerror = null;
                                image.src = MISSING_THUMBNAIL_PLACEHOLDER;
                              }}
                            />
                          ) : (
                            <span className="portrait-placeholder">?</span>
                          )}
                          <span className="portrait-name">
                            {newPortrait?.portName || "点击选择立绘"}
                          </span>
                        </button>
                      );
                    })()
                  ) : (
                    <div
                      className="portrait-selector-display"
                      aria-disabled="true"
                    >
                      <span className="portrait-placeholder">—</span>
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

      {/* ===== 立绘选择弹窗 =====
          两个入口共用同一个组件（挂在 body 上，见 PortraitPickerDialog / ModalPortal）：
          1) 已添加角色卡片点立绘缩略图 → 换一张；
          2) 添加表单里点立绘缩略图 → 挑初始立绘。 */}
      {portraitPickerIndex !== null &&
        (() => {
          const idx = portraitPickerIndex;
          const char = currentCharacters[idx];
          if (!char) return null;
          const source = pickerSourceFor(char.chara?.characterID, char.portrait);
          return (
            <PortraitPickerDialog
              title={`选择立绘 — ${char.chara?.characterName || ""}`}
              portraits={source.portraits}
              notice={source.notice}
              emptyHint={source.emptyHint}
              selectedPortraitId={char.portrait?.portraitID}
              onSelect={(portrait) => {
                updateCharacter(idx, "portrait", portrait);
                setPortraitPickerIndex(null);
              }}
              onClose={() => setPortraitPickerIndex(null)}
            />
          );
        })()}

      {addPickerOpen &&
        newChara &&
        (() => {
          const source = pickerSourceFor(newChara.characterID, newPortrait);
          return (
            <PortraitPickerDialog
              title={`选择立绘 — ${newChara.characterName || ""}`}
              portraits={source.portraits}
              notice={source.notice}
              emptyHint={source.emptyHint}
              selectedPortraitId={newPortrait?.portraitID}
              onSelect={(portrait) => {
                setNewPortrait(portrait);
                setAddPickerOpen(false);
              }}
              onClose={() => setAddPickerOpen(false)}
            />
          );
        })()}
    </div>
  );
};

export default CharactersProperties;
