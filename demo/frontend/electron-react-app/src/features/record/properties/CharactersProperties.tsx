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
  resolvePortraitForEmotion,
} from "@features/common/utils/portraitUtils";
import { useFocusFlash } from "../preview/useFocusFlash";
import type { PropertyFocusRequest } from "../preview/previewTargets";
import { askConfirm } from "@features/common/components/ConfirmDialog";
import CharacterSelect, {
  CharacterSelectOption,
} from "./CharacterSelect";
import NumberField from "./NumberField";
import CharacterAnimationPanel from "./CharacterAnimationPanel";
import EmotionAnimPicker from "./EmotionAnimPicker";
import PortraitPickerDialog from "./PortraitPickerDialog";
import {
  normalizeIndexes,
  isInteractiveClickTarget,
  useBatchSelection,
  VisualPanelLinkProps,
} from "./batchSelection";
import {
  BatchCardCheckbox,
  BatchSelectionBar,
} from "./BatchSelectionBar";
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

interface CharactersPropertiesProps extends VisualPanelLinkProps {
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

/**
 * 「立绘」页签。
 *
 * <p>每张立绘卡片支持两套互不干扰的选中：
 * 1. **批量删除**：左上角勾选框 + 顶部「全选 / 批量删除」（见 {@link useBatchSelection}）；
 * 2. **预览选中**：点卡片本体（标题 / 空白，不含卡片里的控件）→ 让预览高亮这张立绘，
 *    必要时预览会自动切到世界视图把它显示出来（见 RecordPreview 的 revealRequest）。
 */
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
  activeIndex = null,
  onSelectVisual,
  onVisualsRemoved,
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

  // 批量删除的选中态：与预览选中（activeIndex）是两套状态，互不干扰
  const batch = useBatchSelection(currentCharacters.length, selectedRecord.uuid);

  // 角色下拉选项（带默认立绘小头像），与"说话人"下拉框使用同一个组件。
  // 角色多时靠菜单里的检索找：名字之外，阵营与标签也参与匹配。
  const characterOptions: CharacterSelectOption[] = characters.map((chara) => ({
    value: chara.characterID,
    label: chara.characterName,
    avatarCharacter: chara,
    searchKeywords: [chara.faction ?? "", ...(chara.tags ?? [])],
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

  /**
   * @function 把某张立绘卡片的角色换成另一个角色
   *
   * <p>**已有立绘时，立绘要跟着换**（规则见 {@link resolvePortraitForEmotion}）：
   * 旧立绘的情绪是 happy、新角色也有 happy 的立绘 → 换成那张；没有同情绪的 →
   * 换成新角色的默认立绘。这样换完角色，立绘和角色不会对不上。
   *
   * <p>新角色**一张立绘都没有**（或连默认立绘都没有）时清空立绘，卡片回到"未选择"空态：
   * 既不能把上一个角色的立绘留在新角色名下（那正是这次要消除的不一致），
   * 也没有一张真实存在的图可以选。空态的表现与"这条记录本来就没有立绘"完全一致
   * （缩略图显示 `?`、名称显示"未选择"、预览/成片不画这个角色、弹窗给"这个角色还没有立绘"的提示），
   * 不会报错。
   *
   * <p>记录本来就没有立绘时不触发匹配：没有"旧立绘的情绪"可对照，保持空态。
   * 换回同一个角色（下拉里点了当前那一项）时也不动立绘，只刷新角色快照。
   */
  const switchCharacter = (index: number, selectedChara: MyCharacter) => {
    const current = currentCharacters[index];
    if (!current) return;

    // 换回同一个角色 = 只刷新角色快照，立绘不动：
    // 那不是"换角色"，不该把用户手选的那张立绘换成同情绪的别一张。
    const sameCharacter =
      current.chara?.characterID === selectedChara.characterID;
    // 记录本来就没有立绘时也不触发匹配：没有可对照的情绪，保持空态。
    let nextPortrait = current.portrait;
    if (!sameCharacter && current.portrait) {
      nextPortrait =
        resolvePortraitForEmotion(
          selectedChara.portraits,
          current.portrait.emotion,
        ) ?? undefined;
    }

    const updatedChars = [...currentCharacters];
    updatedChars[index] = {
      ...current,
      chara: {
        characterID: selectedChara.characterID,
        characterName: selectedChara.characterName,
        height: selectedChara.height,
        faction: selectedChara.faction,
        colorBg: selectedChara.colorBg,
        colorText: selectedChara.colorText,
      },
      // 匹配不到（新角色一张立绘都没有）→ 清空 = 空态；JSON 里这个字段直接省略
      portrait: nextPortrait,
    };
    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      chars: updatedChars,
    });
  };

  const updateCharacter = (index: number, field: string, value: any) => {
    const updatedChars = [...currentCharacters];
    updatedChars[index] = { ...updatedChars[index], [field]: value };
    const updatedRecord = { ...selectedRecord, chars: updatedChars };
    updateRecord(selectedRecordIndex, updatedRecord);
  };

  /**
   * @function 删除立绘（单条与批量共用同一套逻辑）
   *
   * <p>一次写回记录（与单条删除以前一样走 `updateRecord`），再从 `speakerC` 里摘掉
   * **已经没有立绘在用的**角色引用——同一角色还有别的卡片时说话人/名片保持不变。
   * 删除后清空批量勾选，并把删掉的下标告诉上层，让它同步预览选中态。
   *
   * @param indexes 要删掉的下标（重复 / 越界会被忽略）
   */
  const deleteCharacters = (indexes: number[]) => {
    const removed = normalizeIndexes(indexes, currentCharacters.length);
    if (removed.length === 0) return;
    const removedSet = new Set(removed);
    const updatedChars = currentCharacters.filter((_, i) => !removedSet.has(i));

    // 同时从 speakerC 中移除对应角色：只摘掉"删完之后一张立绘都没有"的角色
    const removedCharacterIds = new Set(
      removed
        .map((index) => currentCharacters[index]?.chara?.characterID)
        .filter((id): id is string => Boolean(id)),
    );
    const remainingCharacterIds = new Set(
      updatedChars
        .map((char) => char.chara?.characterID)
        .filter((id): id is string => Boolean(id)),
    );
    const currentSpeakerC = selectedRecord.dialogue.speakerC || [];
    const updatedSpeakerC = currentSpeakerC.filter(
      (ref) =>
        !removedCharacterIds.has(ref.characterID) ||
        remainingCharacterIds.has(ref.characterID),
    );

    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      chars: updatedChars,
      dialogue: { ...selectedRecord.dialogue, speakerC: updatedSpeakerC },
    });

    batch.clear();
    onVisualsRemoved?.(removed);
  };

  /** @function 删除一条立绘（卡片上的「删除」按钮） */
  const deleteCharacter = (index: number) => {
    deleteCharacters([index]);
  };

  /**
   * @function 批量删除勾选的立绘
   * 破坏性操作先二次确认（应用内确认框，不用原生 confirm：Electron 里关掉后会丢焦点）。
   */
  const handleBatchDelete = async () => {
    const removed = batch.indexes;
    if (removed.length === 0) return;
    const names = removed
      .map((index) => currentCharacters[index]?.chara?.characterName)
      .filter((name): name is string => Boolean(name));
    const confirmed = await askConfirm({
      title: "批量删除立绘",
      message: `确定删除选中的 ${removed.length} 个立绘吗？`,
      detail: names.length
        ? `将被移除：${names.join("、")}。\n删除后可用「+ 添加立绘」重新加回来。`
        : undefined,
      confirmLabel: "删除",
      danger: true,
    });
    if (!confirmed) return;
    deleteCharacters(removed);
  };

  /**
   * @function 点击卡片本体 → 在预览里选中这张立绘
   * 卡片里全是编辑控件，点它们（按钮 / 滑杆 / 数值框 / 勾选框）不能顺带选中预览，
   * 判定见 {@link isInteractiveClickTarget}。
   */
  const handleCardClick = (event: React.MouseEvent, index: number) => {
    if (isInteractiveClickTarget(event.target)) return;
    onSelectVisual?.(index);
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
      {/* 批量删除工具条：只在勾选后多出「批量删除」按钮，未勾选时只剩「全选」 */}
      <BatchSelectionBar
        label="立绘"
        total={currentCharacters.length}
        selectedCount={batch.count}
        onToggleAll={batch.toggleAll}
        onClear={batch.clear}
        onDelete={handleBatchDelete}
        previewHint="点卡片 = 预览定位 · 勾选框 = 批量删除"
      />
      <div className="characters-list">
        {currentCharacters.map((char, index) => (
          <div
            key={index}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            className={`character-item${
              flashingIndex === index ? " property-focus-flash" : ""
            }${activeIndex === index ? " visual-card-preview-selected" : ""}${
              batch.has(index) ? " visual-card-batch-selected" : ""
            }${onSelectVisual ? " visual-card-clickable" : ""}`}
            // 点卡片 = 在预览里选中这张立绘（与批量勾选无关）
            onClick={(event) => handleCardClick(event, index)}
            data-preview-selected={activeIndex === index ? "true" : undefined}
          >
            <div className="character-header">
              <div className="character-heading">
                {/* 勾选框只负责批量删除，点它不会触发上面的"预览选中" */}
                <BatchCardCheckbox
                  checked={batch.has(index)}
                  label={`选择立绘 ${index + 1}`}
                  onToggle={() => batch.toggle(index)}
                />
                <h5>{char.chara.characterName}</h5>
              </div>
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
                    searchable
                    searchPlaceholder="搜索角色名 / 阵营 / 标签…"
                    onChange={(characterID) => {
                      const selectedChara = characters.find(
                        (c) => c.characterID === characterID,
                      );
                      if (selectedChara) {
                        // 换角色时立绘按情绪跟着换（见 switchCharacter）
                        switchCharacter(index, selectedChara);
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
                    searchable
                    searchPlaceholder="搜索角色名 / 阵营 / 标签…"
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
