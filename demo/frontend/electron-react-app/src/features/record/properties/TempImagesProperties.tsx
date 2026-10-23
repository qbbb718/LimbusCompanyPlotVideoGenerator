import React, { useRef } from "react";
import { Record, TempImageVisual } from "@types";
import ApiService from "@services/ApiService";
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

/*
 * 坐标系说明：和「立绘」页签完全一致 —— 记录里的 posX/posY 存的是 1080p 设计画布像素，
 * 与设置页选的输出分辨率无关；滑杆 / 数值框按**设置页选的视频大小**显示
 * （见 visualCoordinates 的 createCoordinateMapper），写回记录前再换算回设计画布像素。
 */

/** 临时图片位置快捷按钮的档位：-3..3 对应画面宽度的 0%、1/6 … 5/6、100% */
const QUICK_POSITION_STEPS = [-3, -2, -1, 0, 1, 2, 3];

/** 档位 n 对应的画面宽度百分比（50 = 居中） */
const stepToPercent = (n: number) => 50 + (n * 100) / 6;

/** 临时图片档位 n 的左边缘位置（当前视频宽度下的像素） */
const stepToUiTempPosX = (n: number, uiWidth: number) =>
  uiWidth / 2 + (uiWidth * n) / 6;

/**
 * 临时图片缩略图（48×48，属性面板"临时图片（路人/道具）"列表项用）。
 *
 * 记录里的 imagePath 既可能是 ./projects/temp/images/... 这样的相对路径，也可能是后端
 * RuntimePaths 存下来的 C:/Users/.../projects/temp/images/... 绝对路径，统一交给
 * ApiService.getTempImageUrl 解析（绝对路径直接拼 URL 会 404，图片根本显示不出来）。
 * 图片加载失败时把 <img> 藏起来，露出 CSS ::before 的 "?" 占位，不留破图。
 *
 * @param imagePath 记录里 TempImageVisual.imagePath
 * @param label 图片的无障碍名称（"临时图片 N"）
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

interface TempImagesPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
  /** 设置页选的输出视频宽度（滑杆范围的基准）；缺省时回退到设计画布宽度 */
  videoWidth?: number;
  /** 设置页选的输出视频高度 */
  videoHeight?: number;
  /** 从预览里点中临时图片后下发的定位请求：滚到对应卡片并闪一下 */
  focusRequest?: PropertyFocusRequest | null;
  /** 是否剧情模式；人格故事（false）下临时图片不参与渲染，动画区要置灰提示 */
  plot?: boolean;
  /** 预览当前停在哪一帧（关键帧时间轴画播放头用） */
  previewFrame?: number | null;
  /** 请求预览跳到某一帧（点时间轴 / 关键帧时触发） */
  onSeekFrame?: (recordFrame: number) => void;
  /** 一句台词本身的长度（max(语音, 文字) 帧）；关键帧动画默认按它铺满 */
  lineFrames?: number;
}

/**
 * 「临时图片」页签：把路人 / 道具这类不属于角色管理的素材叠到画面上。
 *
 * <p>内容从原来的「立绘」页签原样拆出（缩略图、缩放、压暗、X / Y 坐标、添加 / 删除），
 * 只有承载它的页签变了，记录里的 tempImages 数据与后端渲染逻辑完全没动。
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
}) => {
  // 滑杆/数值框的坐标系 = 设置页选的视频大小（预览图就是这个尺寸）；
  // 写回记录时统一换算回 1080p 设计画布，换分辨率后构图不变。
  const { uiWidth, uiHeight, toUiX, toUiY, toDesignX, toDesignY } =
    createCoordinateMapper(videoWidth, videoHeight);

  const currentTempImages: TempImageVisual[] = selectedRecord.tempImages || [];

  // 每张临时图片卡片的 DOM 节点：从预览点中时滚到它
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

  const deleteTempImage = async (index: number) => {
    const temp = currentTempImages[index];
    if (temp.uuid) {
      try {
        await ApiService.deleteTempImage(temp.uuid);
      } catch (e) {
        console.error("[TempImagesProperties] 删除临时图片文件失败:", e);
      }
    }
    const updated = currentTempImages.filter((_, i) => i !== index);
    updateRecord(selectedRecordIndex, { ...selectedRecord, tempImages: updated });
    console.log(`[TempImagesProperties] deleteTempImage[${index}]: uuid=${temp.uuid}`);
  };

  const addTempImage = async () => {
    try {
      const result = await (window as any).electronAPI?.openImageFile?.();
      if (!result || result.canceled || !result.filePaths?.length) return;

      const filePath = result.filePaths[0];
      console.log("[TempImagesProperties] 选择临时图片:", filePath);

      // 通过 Electron IPC 读取本地文件为 Blob（避免 file:// fetch 被沙箱拦截）
      const fileBuffer = await (window as any).electronAPI.readFile(filePath);
      const uint8Array = new Uint8Array(fileBuffer);
      const blob = new Blob([uint8Array]);
      const file = new File([blob], filePath.split(/[\\/]/).pop() || "temp.png", {
        type: "image/png",
      });

      const uploadResult = await ApiService.uploadTempImage(file);
      console.log("[TempImagesProperties] 临时图片上传结果:", uploadResult);

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
      console.error("[TempImagesProperties] 添加临时图片失败:", error);
    }
  };

  return (
    <div className="temp-images-properties">
      <h4>临时图片（路人/道具）</h4>
      {currentTempImages.map((temp, index) => (
        <div
          key={temp.uuid || index}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          className={`temp-image-item${
            flashingIndex === index ? " property-focus-flash" : ""
          }`}
        >
          <div className="temp-image-header">
            {/* 缩略图 + 名称：不看图片也能确认是哪一张路人/道具 */}
            <div className="temp-image-title">
              <TempImageThumb
                imagePath={temp.imagePath}
                label={`临时图片 ${index + 1}`}
              />
              <span>临时图片 {index + 1}</span>
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
                  ariaLabel={`临时图片 ${index + 1} 缩放`}
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
                    aria-label={`临时图片 ${index + 1} 缩放滑块`}
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
                ariaLabel={`临时图片 ${index + 1} X 坐标`}
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
                ariaLabel={`临时图片 ${index + 1} Y 坐标`}
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

            {/* 移动动画：临时图片与立绘共用同一套面板（锚点缺省在中心） */}
            <CharacterAnimationPanel
              anim={temp.anim}
              elementLabel={`临时图片 ${index + 1}`}
              plot={plot}
              previewFrame={previewFrame}
              onSeekFrame={onSeekFrame}
              lineFrames={lineFrames}
              onChange={(next) => updateTempImage(index, "anim", next)}
            />
          </div>
        </div>
      ))}
      <button className="add-temp-image-btn" onClick={addTempImage}>
        添加临时图片
      </button>
    </div>
  );
};

export default TempImagesProperties;
