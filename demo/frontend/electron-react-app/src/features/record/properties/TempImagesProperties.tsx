import React, { useRef } from "react";
import { Record, TempImageVisual } from "@types";
import ApiService from "@services/ApiService";
import { askConfirm } from "@features/common/components/ConfirmDialog";
import NumberField from "./NumberField";
import { useFocusFlash } from "../preview/useFocusFlash";
import type { PropertyFocusRequest } from "../preview/previewTargets";
import {
  MAX_VISUAL_SCALE,
  MIN_VISUAL_SCALE,
  VISUAL_SCALE_STEP,
  createCoordinateMapper,
  normalizeScale,
} from "./visualCoordinates";
import "../RecordEditor.css";
import "./CharactersProperties.css";
import "./TempImagesProperties.css";
import CharacterAnimationPanel from "./CharacterAnimationPanel";
import EmotionAnimPicker from "./EmotionAnimPicker";
import {
  isInteractiveClickTarget,
  normalizeIndexes,
  useBatchSelection,
  VisualPanelLinkProps,
} from "./batchSelection";
import {
  BatchCardCheckbox,
  BatchSelectionBar,
} from "./BatchSelectionBar";

/*
 * 坐标系说明：和「立绘」页签完全一致 —— 记录里的 posX/posY 存的是 1080p 设计画布像素，
 * 与设置页选的输出分辨率无关；滑杆 / 数值框按**设置页选的视频大小**显示
 * （见 visualCoordinates 的 createCoordinateMapper），写回记录前再换算回设计画布像素。
 */

/** 临时素材位置快捷按钮的档位：-3..3 对应画面宽度的 0%、1/6 … 5/6、100% */
const QUICK_POSITION_STEPS = [-3, -2, -1, 0, 1, 2, 3];

/** 档位 n 对应的画面宽度百分比（50 = 居中） */
const stepToPercent = (n: number) => 50 + (n * 100) / 6;

/** 临时素材档位 n 的左边缘位置（当前视频宽度下的像素） */
const stepToUiTempPosX = (n: number, uiWidth: number) =>
  uiWidth / 2 + (uiWidth * n) / 6;

/**
 * 临时素材缩略图（48×48，「临时素材」页签的列表项用）。
 *
 * 记录里的 imagePath 既可能是 ./projects/temp/images/... 这样的相对路径，也可能是后端
 * RuntimePaths 存下来的 C:/Users/.../projects/temp/images/... 绝对路径，统一交给
 * ApiService.getTempImageUrl 解析（绝对路径直接拼 URL 会 404，图片根本显示不出来）。
 * 图片加载失败时把 <img> 藏起来，露出 CSS ::before 的 "?" 占位，不留破图。
 *
 * @param imagePath 记录里 TempImageVisual.imagePath
 * @param label 图片的无障碍名称（"临时素材 N"）
 */
const TempImageThumb: React.FC<{ imagePath: string; label: string }> = ({
  imagePath,
  label,
}) => {
  const url = ApiService.getTempImageUrl(imagePath);
  return (
    <span className="temp-image-thumb">
      {url && (
        <img
          src={url}
          alt={label}
          title={imagePath}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
};

interface TempImagesPropertiesProps extends VisualPanelLinkProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
  /** 设置页选的输出视频宽度（滑杆范围的基准）；缺省时回退到设计画布宽度 */
  videoWidth?: number;
  /** 设置页选的输出视频高度 */
  videoHeight?: number;
  /** 从预览里点中临时素材后下发的定位请求：滚到对应卡片并闪一下 */
  focusRequest?: PropertyFocusRequest | null;
  /** 是否剧情模式；人格故事（false）下临时素材不参与渲染，动画区要置灰提示 */
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
   * <p>与「立绘」页签同一个入口：情绪动画的**制作**在资源管理，这里只负责"选哪一段 + 摆放微调"。
   * 不传时（独立组件测试）不显示跳转按钮。
   */
  onOpenAnimationLibrary?: () => void;
}

/**
 * 「临时素材」页签：把物品 / 路人之类的小素材叠到画面上。
 *
 * <p>页签与文案里的「临时素材」就是以前的「临时图片」：**使用频率低的小素材**，
 * 不进资源管理、不登记，选一张图上传即可用（页签顶部有一行说明文字告诉用户这件事）。
 * 记录字段与类型仍叫 `tempImages` / `TempImageVisual`，后端渲染逻辑完全没变。
 *
 * <p>内容从原来的「立绘」页签原样拆出（缩略图、缩放、压暗、X / Y 坐标、添加 / 删除），
 * 只有承载它的页签变了。
 *
 * <p>与「立绘」页签一样接两套互不干扰的选中：批量删除（勾选框 + 全选）与预览选中（点卡片）。
 */
const TempImagesProperties: React.FC<TempImagesPropertiesProps> = ({
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

  const currentTempImages: TempImageVisual[] = selectedRecord.tempImages || [];

  // 批量删除的选中态：与预览选中（activeIndex）分开管理
  const batch = useBatchSelection(currentTempImages.length, selectedRecord.uuid);

  // 每张临时素材卡片的 DOM 节点：从预览点中时滚到它
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flashingIndex = useFocusFlash(
    focusRequest,
    "tempImages",
    (index) => itemRefs.current[index],
  );

  const updateTempImage = (index: number, field: string, value: any) => {
    const updated = [...currentTempImages];
    updated[index] = { ...updated[index], [field]: value };
    updateRecord(selectedRecordIndex, { ...selectedRecord, tempImages: updated });
    console.log(`[TempImagesProperties] updateTempImage[${index}]: ${field}=${value}`);
  };

  /**
   * @function 删除临时素材（单个「删除」按钮与批量删除共用）
   *
   * <p>与以前单条删除的顺序一致：**先删后端文件**（`ApiService.deleteTempImage`，
   * 拿 uuid 删；失败只记日志，不影响记录），再从记录里移除并一次写回。
   * 删除后清空批量勾选，并把删掉的下标告诉上层，让它同步预览选中态。
   *
   * @param indexes 要删掉的下标（重复 / 越界会被忽略）
   */
  const removeTempImages = async (indexes: number[]) => {
    const removed = normalizeIndexes(indexes, currentTempImages.length);
    if (removed.length === 0) return;
    const removedSet = new Set(removed);
    const targets = removed.map((index) => currentTempImages[index]);

    await Promise.all(
      targets.map(async (temp) => {
        if (!temp?.uuid) return;
        try {
          await ApiService.deleteTempImage(temp.uuid);
        } catch (e) {
          console.error("[TempImagesProperties] 删除临时素材文件失败:", e);
        }
      }),
    );

    const updated = currentTempImages.filter((_, i) => !removedSet.has(i));
    updateRecord(selectedRecordIndex, { ...selectedRecord, tempImages: updated });
    console.log(
      `[TempImagesProperties] removeTempImages: indexes=${removed.join(",")}`,
    );

    batch.clear();
    onVisualsRemoved?.(removed);
  };

  /** @function 删除一条临时素材（卡片上的「删除」按钮） */
  const deleteTempImage = (index: number) => {
    void removeTempImages([index]);
  };

  /**
   * @function 批量删除勾选的临时素材
   * 二次确认后走同一套删除逻辑（连后端文件一起删）。
   */
  const handleBatchDelete = async () => {
    const removed = batch.indexes;
    if (removed.length === 0) return;
    const confirmed = await askConfirm({
      title: "批量删除临时素材",
      message: `确定删除选中的 ${removed.length} 张临时素材吗？`,
      detail:
        "会同时删除工程目录里的图片文件。\n删除后可以用「添加临时素材」重新导入。",
      confirmLabel: "删除",
      danger: true,
    });
    if (!confirmed) return;
    await removeTempImages(removed);
  };

  /**
   * @function 点击卡片本体 → 在预览里选中这张临时素材
   * 卡片里的控件（按钮 / 滑杆 / 数值框 / 勾选框）不参与，见 {@link isInteractiveClickTarget}。
   */
  const handleCardClick = (event: React.MouseEvent, index: number) => {
    if (isInteractiveClickTarget(event.target)) return;
    onSelectVisual?.(index);
  };

  const addTempImage = async () => {
    try {
      const result = await (window as any).electronAPI?.openImageFile?.();
      if (!result || result.canceled || !result.filePaths?.length) return;

      const filePath = result.filePaths[0];
      console.log("[TempImagesProperties] 选择临时素材:", filePath);

      // 通过 Electron IPC 读取本地文件为 Blob（避免 file:// fetch 被沙箱拦截）
      const fileBuffer = await (window as any).electronAPI.readFile(filePath);
      const uint8Array = new Uint8Array(fileBuffer);
      const blob = new Blob([uint8Array]);
      const file = new File([blob], filePath.split(/[\\/]/).pop() || "temp.png", {
        type: "image/png",
      });

      const uploadResult = await ApiService.uploadTempImage(file);
      console.log("[TempImagesProperties] 临时素材上传结果:", uploadResult);

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
      console.error("[TempImagesProperties] 添加临时素材失败:", error);
    }
  };

  return (
    <div className="temp-images-properties">
      <h4>临时素材</h4>
      {/*
        页签说明（产品文案，原话照抄）：临时素材不需要在资源管理里登记，
        选图上传就能用、用完随手删，所以本页签没有"从素材库挑"这一步，
        底部只有一个「添加临时素材」。
      */}
      <p className="temp-images-hint">
        用于添加物品、路人等使用频率较低的小素材，无需在资源管理中登记，即传即用。
      </p>
      {/* 批量删除工具条：勾选后才出现「批量删除」 */}
      <BatchSelectionBar
        label="临时素材"
        total={currentTempImages.length}
        selectedCount={batch.count}
        onToggleAll={batch.toggleAll}
        onClear={batch.clear}
        onDelete={handleBatchDelete}
        previewHint="点卡片 = 预览定位 · 勾选框 = 批量删除"
      />
      {currentTempImages.map((temp, index) => (
        <div
          key={temp.uuid || index}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          className={`temp-image-item${
            flashingIndex === index ? " property-focus-flash" : ""
          }${activeIndex === index ? " visual-card-preview-selected" : ""}${
            batch.has(index) ? " visual-card-batch-selected" : ""
          }${onSelectVisual ? " visual-card-clickable" : ""}`}
          // 点卡片 = 在预览里选中这张临时素材（与批量勾选无关）
          onClick={(event) => handleCardClick(event, index)}
          data-preview-selected={activeIndex === index ? "true" : undefined}
        >
          <div className="temp-image-header">
            {/* 勾选框 + 缩略图 + 名称：不看图片也能确认是哪一张路人/道具 */}
            <div className="temp-image-title">
              <BatchCardCheckbox
                checked={batch.has(index)}
                label={`选择临时素材 ${index + 1}`}
                onToggle={() => batch.toggle(index)}
              />
              <TempImageThumb
                imagePath={temp.imagePath}
                label={`临时素材 ${index + 1}`}
              />
              <span>临时素材 {index + 1}</span>
            </div>
            <button onClick={() => deleteTempImage(index)}>删除</button>
          </div>
          <div className="temp-image-controls">
            {/* 第一行：缩放文本框+滑块(3/4) | 是否压暗(1/4) */}
            <div className="char-row">
              <div className="temp-col-scale">
                <span className="char-label-fixed">缩放</span>
                <NumberField
                  className="char-input-fixed"
                  value={normalizeScale(temp.scale)}
                  min={MIN_VISUAL_SCALE}
                  max={MAX_VISUAL_SCALE}
                  ariaLabel={`临时素材 ${index + 1} 缩放`}
                  onChange={(value) =>
                    updateTempImage(index, "scale", value)
                  }
                />
                <div className="char-slider-auto">
                  <input
                    type="range"
                    min={MIN_VISUAL_SCALE}
                    max={MAX_VISUAL_SCALE}
                    step={VISUAL_SCALE_STEP}
                    value={normalizeScale(temp.scale)}
                    aria-label={`临时素材 ${index + 1} 缩放滑块`}
                    onChange={(e) =>
                      updateTempImage(
                        index,
                        "scale",
                        Number(e.target.value),
                      )
                    }
                  />
                </div>
              </div>
              <div className="temp-col-dim">
                <label>压暗</label>
                <input
                  type="checkbox"
                  checked={temp.dim}
                  onChange={(e) =>
                    updateTempImage(index, "dim", e.target.checked)
                  }
                />
              </div>
            </div>

            {/* 第二行：X坐标调整（同角色立绘格式：0..视频宽度） */}
            <div className="char-row">
              <span className="char-label-fixed">X坐标调整</span>
              <NumberField
                className="char-input-fixed"
                integer
                value={toUiX(temp.posX)}
                ariaLabel={`临时素材 ${index + 1} X 坐标`}
                onChange={(value) =>
                  updateTempImage(index, "posX", toDesignX(value))
                }
              />
              <div className="char-slider-auto">
                <div className="adjX-quick-positions">
                  {QUICK_POSITION_STEPS.map((n) => (
                    <button
                      key={n}
                      onClick={() =>
                        updateTempImage(
                          index,
                          "posX",
                          toDesignX(stepToUiTempPosX(n, uiWidth)),
                        )
                      }
                      className="adjX-quick-btn"
                      title={`${stepToPercent(n)}% （posX=${Math.round(stepToUiTempPosX(n, uiWidth))}）`}
                    />
                  ))}
                </div>
                <input
                  type="range"
                  min={0}
                  max={uiWidth}
                  value={toUiX(temp.posX)}
                  onChange={(e) =>
                    updateTempImage(
                      index,
                      "posX",
                      toDesignX(parseInt(e.target.value)),
                    )
                  }
                  className="adjX-slider"
                />
              </div>
            </div>

            {/* 第三行：Y坐标调整（同角色立绘格式，Y 方向用一个视频高度为界） */}
            <div className="char-row">
              <span className="char-label-fixed">Y坐标调整</span>
              <NumberField
                className="char-input-fixed"
                integer
                value={toUiY(temp.posY)}
                ariaLabel={`临时素材 ${index + 1} Y 坐标`}
                onChange={(value) =>
                  updateTempImage(index, "posY", toDesignY(value))
                }
              />
              <input
                type="range"
                min={-uiHeight}
                max={uiHeight}
                value={toUiY(temp.posY)}
                onChange={(e) =>
                  updateTempImage(
                    index,
                    "posY",
                    toDesignY(parseInt(e.target.value)),
                  )
                }
                className="char-slider-auto"
              />
            </div>

            {/* 移动动画：临时素材与立绘共用同一套面板（锚点缺省在中心） */}
            <CharacterAnimationPanel
              anim={temp.anim}
              elementLabel={`临时素材 ${index + 1}`}
              plot={plot}
              previewFrame={previewFrame}
              onSeekFrame={onSeekFrame}
              lineFrames={lineFrames}
              onChange={(next) => updateTempImage(index, "anim", next)}
            />

            {/*
              情绪动画（序列帧）：与「立绘」页签**同一个组件**，交互、气泡样式与可配置项完全一致
              （选素材 / 跳转资源管理 / 摆放微调 / 还原）。

              `plot` 这里固定传 true：人格故事模式下后端照样渲染临时素材
              （见 RenderOfImage.renderPreInternal —— renderTempImages 不受 plot 影响），
              所以它不存在「立绘不画、情绪动画白挂」的情况，不该置灰或提示"不参与渲染"。
            */}
            <EmotionAnimPicker
              emotionAnim={temp.emotionAnim}
              elementLabel={`临时素材 ${index + 1}`}
              elementKindLabel="临时素材"
              placementAnchorLabel="头部区域中心"
              plot
              onOpenAnimationLibrary={onOpenAnimationLibrary}
              onChange={(next) =>
                updateTempImage(index, "emotionAnim", next)
              }
            />
          </div>
        </div>
      ))}
      <button className="add-temp-image-btn" onClick={addTempImage}>
        添加临时素材
      </button>
    </div>
  );
};

export default TempImagesProperties;
