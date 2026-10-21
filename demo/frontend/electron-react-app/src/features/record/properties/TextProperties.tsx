import React, { useState, useEffect, useRef } from "react";
import { HexColorPicker } from "react-colorful";
import {
  Record,
  MyCharacter,
  CharacterRef,
  Dialogue,
  DEFAULT_FREE_TEXT_COLOR,
  DEFAULT_FREE_TEXT_FONT_SIZE,
} from "@types";
import ApiService from "@services/ApiService";
import { AppConfig } from "@features/common/config/appConfig";
import {
  HexColorInput,
  ScreenColorPickerButton,
} from "@features/common/components/ColorPickerControls";
import {
  TEXT_SPEED_MAX,
  TEXT_SPEED_MIN,
  TEXT_SPEED_STEP,
  normalizeTextSpeed,
} from "@features/common/utils/projectSettings";
import CharacterSelect, {
  CharacterSelectOption,
} from "./CharacterSelect";
import { PROPERTY_FOCUS_FLASH_MS } from "../preview/useFocusFlash";
import type { PropertyFocusRequest, TextFocusField } from "../preview/previewTargets";
import "../RecordEditor.css";
import "./TextProperties.css";

interface TextPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
  /** 设置页选的输出视频宽度（文字位置滑杆的显示基准）；缺省时回退到设计画布宽度 */
  videoWidth?: number;
  /** 设置页选的输出视频高度 */
  videoHeight?: number;
  /**
   * "显示速度"旁的"全局设置"链接：切到"全局设置"tab 并定位到
   * "文字显示速度（全局）"滑块（不传时不渲染该链接）。
   */
  onOpenGlobalSpeed?: () => void;
  /**
   * 从预览里点中「对话框 / 角色名片 / 地点牌」后下发的定位请求：
   * 按 `field` 滚到「对话内容 / 说话人 / 场景」并闪一下。
   */
  focusRequest?: PropertyFocusRequest | null;
}

/**
 * 说话人下拉框里"自由文本"类型的哨兵值。
 * 角色 ID 都是后端生成的 UUID，不会与这个值冲突。
 */
const FREE_TEXT_SPEAKER = "__FREE_TEXT__";

/**
 * "手动输入"说话人（输入框里的自定义名字）的哨兵值：
 * 只用于让下拉框显示 fallback 文本，不会出现在选项列表里。
 */
const MANUAL_SPEAKER = "__MANUAL__";

/** 自由文本模式下显示在记录列表里的说话人名字（说话人本身不上屏） */
const FREE_TEXT_LABEL = "自由文本";

/** 旁白说话人的名字（与后端 Dialogue.DEFAULT_NARRATOR 保持一致） */
const NARRATOR_NAME = "旁白";

/** 颜色选择器只接受 #RGB / #RRGGBB，其它格式（如 8 位带透明度）回退到默认色显示 */
const PICKER_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** 设计画布尺寸（与后端 ProjectConfig.VIDEO_WIDTH / VIDEO_HEIGHT 一致） */
const CANVAS_WIDTH = AppConfig.designCanvas.width;
const CANVAS_HEIGHT = AppConfig.designCanvas.height;

/** 自由文本字号范围（设计画布像素） */
const FREE_TEXT_FONT_SIZE_MIN = 8;
const FREE_TEXT_FONT_SIZE_MAX = 200;

const TextProperties: React.FC<TextPropertiesProps> = ({
  selectedRecord,
  selectedRecordIndex,
  updateRecord,
  videoWidth,
  videoHeight,
  onOpenGlobalSpeed,
  focusRequest,
}) => {
  const [characters, setCharacters] = useState<MyCharacter[]>([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  // 取色器里正在挑的颜色：拖动时只更新本地草稿，点"完成"/点面板外部才写回记录，
  // 避免拖动过程中不断触发预览图重新渲染。
  const [colorDraft, setColorDraft] = useState<string | null>(null);
  // 位置数值框的输入草稿：允许输入 "-" 这类中间状态，避免受控输入把负号吞掉
  const [freeTextXInput, setFreeTextXInput] = useState<string | null>(null);
  const [freeTextYInput, setFreeTextYInput] = useState<string | null>(null);
  // 字号数值框的输入草稿（允许暂时为空，避免输入过程被强制回填）
  const [freeTextFontSizeInput, setFreeTextFontSizeInput] = useState<
    string | null
  >(null);

  const colorControlRef = useRef<HTMLDivElement | null>(null);
  const commitColorRef = useRef<() => void>(() => {});

  /* ===== 从预览点选 UI 元素后的定位（说话人 / 对话内容 / 场景）===== */
  const speakerBlockRef = useRef<HTMLDivElement | null>(null);
  const dialogueBlockRef = useRef<HTMLDivElement | null>(null);
  const locationBlockRef = useRef<HTMLDivElement | null>(null);
  const [flashingField, setFlashingField] = useState<TextFocusField | null>(null);

  useEffect(() => {
    if (!focusRequest || focusRequest.kind !== "text") return;
    const field: TextFocusField = focusRequest.field ?? "dialogue";
    const target =
      field === "speaker"
        ? speakerBlockRef.current
        : field === "location"
          ? locationBlockRef.current
          : dialogueBlockRef.current;
    target?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });

    setFlashingField(field);
    const timer = window.setTimeout(
      () => setFlashingField(null),
      PROPERTY_FOCUS_FLASH_MS,
    );
    return () => window.clearTimeout(timer);
  }, [focusRequest]);

  /** 该字段是否正在闪烁（从预览跳转过来时闪一下，与其它面板同一套视觉） */
  const flashClass = (field: TextFocusField) =>
    flashingField === field ? " property-focus-flash" : "";

  useEffect(() => {
    ApiService.getCharacters()
      .then(setCharacters)
      .catch(() => setCharacters([]));
  }, []);

  const dialogue = selectedRecord.dialogue;
  const isFreeText = dialogue.freeText === true;
  const currentSpeaker = dialogue.speakerC?.[0];

  // 旁白：说话人不上屏（即使 speakerC 里残留角色），也不显示阵营与说话人名字输入框。
  // 判断必须与后端 Dialogue.isNarrator() 一致（按 speakerName），不能只看 speakerC。
  const isNarrator =
    !isFreeText &&
    (dialogue.speakerName === NARRATOR_NAME ||
      (!dialogue.speakerName && !currentSpeaker));

  // ===== 文字位置：记录里存设计画布像素，界面按当前输出分辨率显示 =====
  const uiWidth = videoWidth && videoWidth > 0 ? videoWidth : CANVAS_WIDTH;
  const uiHeight = videoHeight && videoHeight > 0 ? videoHeight : CANVAS_HEIGHT;
  const toUiX = (designX: number) =>
    Math.round((designX * uiWidth) / CANVAS_WIDTH);
  const toUiY = (designY: number) =>
    Math.round((designY * uiHeight) / CANVAS_HEIGHT);
  const toDesignX = (uiX: number) =>
    Math.round((uiX * CANVAS_WIDTH) / uiWidth);
  const toDesignY = (uiY: number) =>
    Math.round((uiY * CANVAS_HEIGHT) / uiHeight);

  const freeTextX = dialogue.freeTextX ?? 0;
  const freeTextY = dialogue.freeTextY ?? 0;
  const freeTextUiX = toUiX(freeTextX);
  const freeTextUiY = toUiY(freeTextY);
  // 自由文本字号：记录里存设计画布像素；<=0/未填时用默认字号（与旁白一致）
  const freeTextFontSize =
    dialogue.freeTextFontSize && dialogue.freeTextFontSize > 0
      ? dialogue.freeTextFontSize
      : DEFAULT_FREE_TEXT_FONT_SIZE;

  // 切换记录 / 退出自由文本时关闭取色器、清空位置与字号输入草稿
  useEffect(() => {
    setShowColorPicker(false);
    setColorDraft(null);
    setFreeTextXInput(null);
    setFreeTextYInput(null);
    setFreeTextFontSizeInput(null);
  }, [selectedRecordIndex, isFreeText]);

  // 点击取色器面板以外的区域：提交颜色更改并自动关闭
  useEffect(() => {
    if (!showColorPicker) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (
        colorControlRef.current &&
        !colorControlRef.current.contains(event.target as Node)
      ) {
        commitColorRef.current();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showColorPicker]);

  // 自由文本的实际文字颜色：空/非法时用默认色（与旁白一致）
  const freeTextColor = PICKER_COLOR_PATTERN.test(dialogue.freeTextColor || "")
    ? (dialogue.freeTextColor as string)
    : DEFAULT_FREE_TEXT_COLOR;
  // 取色器显示的颜色（拖动中的草稿优先）
  const displayColor = colorDraft || freeTextColor;

  const updateDialogue = (
    field: keyof typeof selectedRecord.dialogue,
    value: any,
  ) => {
    const updatedDialogue = { ...selectedRecord.dialogue, [field]: value };
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
      `speakerC.length=${updatedDialogue.speakerC?.length ?? 0}`,
    );
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  /** 一次性修改多个 Dialogue 字段（切换说话人类型 / 文本样式时用） */
  const updateDialogueFields = (updates: Partial<Dialogue>) => {
    const updatedRecord = {
      ...selectedRecord,
      dialogue: { ...selectedRecord.dialogue, ...updates },
    };
    console.log("[TextProperties] updateDialogueFields:", updates);
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  /** 关闭取色器并丢弃未提交的颜色草稿 */
  const closeColorPicker = () => {
    setShowColorPicker(false);
    setColorDraft(null);
  };

  /** 把取色器里挑好的颜色写回记录 */
  const commitColorPicker = () => {
    if (colorDraft && colorDraft !== dialogue.freeTextColor) {
      updateDialogue("freeTextColor", colorDraft);
    }
    closeColorPicker();
  };
  // 供"点击面板外部"的 document 监听器调用，保证拿到最新的 commit 逻辑
  useEffect(() => {
    commitColorRef.current = commitColorPicker;
  });

  /**
   * @function 立即应用一个自由文字颜色
   * 十六进制输入框与吸管取色都走这里：不经过 colorDraft 草稿，
   * 因为这两个操作本身就是"确定的最终值"，用户不需要再点一次"完成"。
   */
  const applyFreeTextColor = (color: string) => {
    setColorDraft(null);
    updateDialogue("freeTextColor", color);
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
        // 选回角色时退出自由文本模式
        freeText: false,
        speakerName: chara.characterName,
        faction: chara.faction,
        speakerC: [ref],
      },
    };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  /**
   * 说话人下拉框切换：
   * - 旁白：说话人不上屏（不渲染角色名/阵营名片），也不显示阵营与说话人名字输入框
   * - 自由文本：说话人不上屏，对话内容以旁白字体/字号显示；可调样式、颜色与位置
   * - 具体角色：回到原有"角色名片"逻辑
   */
  const handleSpeakerSelect = (value: string) => {
    if (value === FREE_TEXT_SPEAKER) {
      console.log("[TextProperties] 说话人类型切换为自由文本");
      updateDialogueFields({
        freeText: true,
        // 自由文本没有角色名片，清掉说话人引用
        speakerC: [],
        speakerName: FREE_TEXT_LABEL,
        // 隐藏UI默认勾选；加粗/斜体/颜色/位置保留用户之前的选择
        bold: dialogue.bold === true,
        italic: dialogue.italic === true,
        hideUI: dialogue.hideUI !== false,
        freeTextColor: dialogue.freeTextColor || DEFAULT_FREE_TEXT_COLOR,
        freeTextFontSize:
          dialogue.freeTextFontSize || DEFAULT_FREE_TEXT_FONT_SIZE,
        freeTextX: dialogue.freeTextX ?? 0,
        freeTextY: dialogue.freeTextY ?? 0,
      });
      return;
    }

    if (value) {
      handleCharacterSelect(value);
      return;
    }

    // 旁白：说话人固定为旁白，清掉角色引用（后端据此不渲染说话人名片）
    updateDialogueFields({
      freeText: false,
      speakerC: [],
      speakerName: NARRATOR_NAME,
    });
  };

  // 说话人下拉选项：旁白 / 自由文本 / 角色（角色项带默认立绘小头像）
  const speakerOptions: CharacterSelectOption[] = [
    { value: "", label: "旁白", badge: "旁" },
    { value: FREE_TEXT_SPEAKER, label: "自由文本", badge: "文" },
    ...characters.map((chara, index) => ({
      value: chara.characterID,
      label: chara.characterName,
      avatarCharacter: chara,
      dividerBefore: index === 0,
    })),
  ];

  // 当前值：自由文本 / 旁白 / 角色 ID；手动输入的自定义名字用 fallback 显示
  const speakerValue = isFreeText
    ? FREE_TEXT_SPEAKER
    : isNarrator
      ? ""
      : currentSpeaker?.characterID ||
        (dialogue.speakerName ? MANUAL_SPEAKER : "");
  const speakerFallbackLabel = dialogue.speakerName || "未命名";

  /** 位置复位：把偏移改回 0（画面中心） */
  const resetFreeTextPosition = (axis: "x" | "y") => {
    if (axis === "x") {
      setFreeTextXInput(null);
    } else {
      setFreeTextYInput(null);
    }
    updateDialogue(axis === "x" ? "freeTextX" : "freeTextY", 0);
  };

  /** 位置输入框：允许负号等中间输入，能解析成数字时立即写回 */
  const handlePositionInput = (axis: "x" | "y", raw: string) => {
    if (axis === "x") {
      setFreeTextXInput(raw);
    } else {
      setFreeTextYInput(raw);
    }
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      updateDialogue(
        axis === "x" ? "freeTextX" : "freeTextY",
        axis === "x" ? toDesignX(parsed) : toDesignY(parsed),
      );
    }
  };

  const handlePositionSlider = (axis: "x" | "y", raw: string) => {
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    if (axis === "x") {
      setFreeTextXInput(null);
    } else {
      setFreeTextYInput(null);
    }
    updateDialogue(
      axis === "x" ? "freeTextX" : "freeTextY",
      axis === "x" ? toDesignX(parsed) : toDesignY(parsed),
    );
  };

  /** 字号输入框：允许暂时为空/中间状态，能解析成正数时立即写回 */
  const handleFontSizeInput = (raw: string) => {
    setFreeTextFontSizeInput(raw);
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      updateDialogue("freeTextFontSize", parsed);
    }
  };

  const handleFontSizeSlider = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    setFreeTextFontSizeInput(null);
    updateDialogue("freeTextFontSize", parsed);
  };

  return (
    <div className="text-properties">
      <div className="form-row">
        <div
          ref={speakerBlockRef}
          className={
            (isNarrator ? "form-group full-width" : "form-group half-width") +
            flashClass("speaker")
          }
        >
          <label>说话人</label>
          <CharacterSelect
            value={speakerValue}
            options={speakerOptions}
            onChange={handleSpeakerSelect}
            fallbackLabel={speakerFallbackLabel}
            ariaLabel="说话人"
          />
          {!isFreeText && !isNarrator && (
            <input
              type="text"
              value={dialogue.speakerName}
              onChange={(e) => updateDialogue("speakerName", e.target.value)}
              placeholder="或手动输入说话人名称"
              style={{ marginTop: 4 }}
            />
          )}
          {isFreeText && (
            <div className="free-text-hint">
              对话内容以旁白字体显示，可在下方调整字号、颜色与位置
            </div>
          )}
        </div>
        {!isNarrator && (
          <div className="form-group half-width">
            {isFreeText ? (
              <>
                <label>文本样式</label>
                <div className="free-text-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={dialogue.bold === true}
                      onChange={(e) => updateDialogue("bold", e.target.checked)}
                    />
                    加粗
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={dialogue.italic === true}
                      onChange={(e) =>
                        updateDialogue("italic", e.target.checked)
                      }
                    />
                    斜体
                  </label>
                  <label title="勾选后不渲染对话框、说话人名片与地点牌">
                    <input
                      type="checkbox"
                      checked={dialogue.hideUI !== false}
                      onChange={(e) =>
                        updateDialogue("hideUI", e.target.checked)
                      }
                    />
                    隐藏UI
                  </label>
                </div>
                <div className="free-text-color" ref={colorControlRef}>
                  <span className="free-text-color-label">文字颜色</span>
                  <div className="free-text-color-control">
                    <button
                      type="button"
                      className="free-text-color-swatch"
                      style={{ backgroundColor: displayColor }}
                      title="打开颜色面板"
                      aria-label="打开颜色面板"
                      onClick={() => {
                        if (showColorPicker) {
                          commitColorPicker();
                        } else {
                          setShowColorPicker(true);
                        }
                      }}
                    />
                    <HexColorInput
                      className="free-text-color-hex-input"
                      value={displayColor}
                      onCommit={applyFreeTextColor}
                      ariaLabel="文字颜色的十六进制编码"
                      title="输入十六进制颜色，如 #FF8800（支持 #RGB / #RRGGBB）"
                    />
                    <ScreenColorPickerButton
                      onPicked={applyFreeTextColor}
                      title="屏幕取色：吸取屏幕上任意位置的颜色（包括软件窗口以外）"
                    />
                  </div>
                  <div className="free-text-color-hint">
                    可直接输入十六进制编码，或点吸管吸取屏幕上的颜色
                  </div>
                  {showColorPicker && (
                    <div className="free-text-color-popover">
                      <HexColorPicker
                        color={displayColor}
                        onChange={(color) => setColorDraft(color)}
                      />
                      <div className="free-text-color-actions">
                        <button
                          type="button"
                          onClick={() => {
                            updateDialogue(
                              "freeTextColor",
                              DEFAULT_FREE_TEXT_COLOR,
                            );
                            closeColorPicker();
                          }}
                        >
                          恢复默认
                        </button>
                        <button type="button" onClick={commitColorPicker}>
                          完成
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <label>阵营</label>
                <input
                  type="text"
                  value={dialogue.faction}
                  onChange={(e) => updateDialogue("faction", e.target.value)}
                />
              </>
            )}
          </div>
        )}
      </div>

      {!isFreeText && !isNarrator && (
        <div className="character-edit-hint">
          可输入文字临时修改角色名与阵营
        </div>
      )}

      <div
        ref={dialogueBlockRef}
        className={"form-group" + flashClass("dialogue")}
      >
        <label>对话内容</label>
        <textarea
          value={dialogue.text}
          onChange={(e) => updateDialogue("text", e.target.value)}
          rows={5}
        />
      </div>

      {isFreeText && (
        <div className="free-text-controls-row">
          {/* 字号 */}
          <div className="form-group free-text-font-size">
            <label>文字字号</label>
            <div className="free-text-axis-row">
              <input
                type="number"
                className="free-text-axis-input"
                min={FREE_TEXT_FONT_SIZE_MIN}
                max={FREE_TEXT_FONT_SIZE_MAX}
                value={freeTextFontSizeInput ?? String(freeTextFontSize)}
                onChange={(e) => handleFontSizeInput(e.target.value)}
                onBlur={() => setFreeTextFontSizeInput(null)}
              />
              <input
                type="range"
                className="free-text-axis-slider"
                min={FREE_TEXT_FONT_SIZE_MIN}
                max={FREE_TEXT_FONT_SIZE_MAX}
                step={1}
                value={freeTextFontSize}
                onChange={(e) => handleFontSizeSlider(e.target.value)}
              />
            </div>
            <div className="free-text-position-hint">
              设计画布像素（1080p），默认 {DEFAULT_FREE_TEXT_FONT_SIZE}
            </div>
          </div>

          {/* 位置 */}
          <div className="form-group free-text-position">
            <label>文字位置</label>
            <div className="free-text-axis-row">
              <span className="free-text-axis-label">X</span>
              <input
                type="number"
                className="free-text-axis-input"
                value={freeTextXInput ?? String(freeTextUiX)}
                onChange={(e) => handlePositionInput("x", e.target.value)}
                onBlur={() => setFreeTextXInput(null)}
              />
              <input
                type="range"
                className="free-text-axis-slider"
                min={-Math.round(uiWidth / 2)}
                max={Math.round(uiWidth / 2)}
                value={freeTextUiX}
                onChange={(e) => handlePositionSlider("x", e.target.value)}
              />
              <button
                type="button"
                className="free-text-axis-reset"
                title="X 坐标归零（回到画面水平中心）"
                aria-label="X 坐标归零"
                onClick={() => resetFreeTextPosition("x")}
              >
                ↺
              </button>
            </div>
            <div className="free-text-axis-row">
              <span className="free-text-axis-label">Y</span>
              <input
                type="number"
                className="free-text-axis-input"
                value={freeTextYInput ?? String(freeTextUiY)}
                onChange={(e) => handlePositionInput("y", e.target.value)}
                onBlur={() => setFreeTextYInput(null)}
              />
              <input
                type="range"
                className="free-text-axis-slider"
                min={-Math.round(uiHeight / 2)}
                max={Math.round(uiHeight / 2)}
                value={freeTextUiY}
                onChange={(e) => handlePositionSlider("y", e.target.value)}
              />
              <button
                type="button"
                className="free-text-axis-reset"
                title="Y 坐标归零（回到画面垂直中心）"
                aria-label="Y 坐标归零"
                onClick={() => resetFreeTextPosition("y")}
              >
                ↺
              </button>
            </div>
            <div className="free-text-position-hint">
              以画面中心为原点，单位：当前输出分辨率像素
            </div>
          </div>
        </div>
      )}

      


      <div
        ref={locationBlockRef}
        className={"form-group" + flashClass("location")}
      >
        <label>场景</label>
        <input
          type="text"
          value={dialogue.location}
          onChange={(e) => updateDialogue("location", e.target.value)}
        />
      </div>
      <div className="form-group">
        <div className="form-label-row">
          <label>显示速度</label>
        </div>
        <input
          type="range"
          min={TEXT_SPEED_MIN}
          max={TEXT_SPEED_MAX}
          step={TEXT_SPEED_STEP}
          value={normalizeTextSpeed(dialogue.speed)}
          onChange={(e) => updateDialogue("speed", normalizeTextSpeed(e.target.value))}
        />
        
        <div className="speed-indicator">{normalizeTextSpeed(dialogue.speed)}</div>
        {onOpenGlobalSpeed && (
            <button
              type="button"
              className="link-button"
              onClick={onOpenGlobalSpeed}
              title="前往“全局设置”统一修改所有文本的显示速度"
            >
              ⚙️ 全局显示速度设置
            </button>
          )}
      </div>
    </div>
  );
};

export default TextProperties;
