import React, { useState, useEffect, useRef } from "react";
import { Record, Background, BackgroundVisual } from "@types";
import ApiService from "@services/ApiService";
import NumberField from "./NumberField";
import { useFocusFlash } from "../preview/useFocusFlash";
import type { PropertyFocusRequest } from "../preview/previewTargets";
import {
  MAX_BACKGROUND_SCALE,
  MIN_VISUAL_SCALE,
  VISUAL_SCALE_STEP,
  backgroundOffsetLimit,
  createCoordinateMapper,
  normalizeBackgroundScale,
} from "./visualCoordinates";
import "../RecordEditor.css";
import "./TransformControls.css";
import "./BackgroundProperties.css";

interface BackgroundPropertiesProps {
  selectedRecord: Record;
  selectedRecordIndex: number;
  updateRecord: (index: number, updatedRecord: Record) => void;
  /** 设置页选的输出视频宽度（滑杆/数值框的显示坐标系）；缺省时回退到设计画布宽度 */
  videoWidth?: number;
  /** 设置页选的输出视频高度 */
  videoHeight?: number;
  /** 从预览里点中背景后下发的定位请求：滚到对应背景卡片并闪一下 */
  focusRequest?: PropertyFocusRequest | null;
}

/**
 * 解析背景缩略图只需要 path / thumbnailPath 两个字段：
 * 资源管理里的 Background 和记录里内嵌的背景快照都满足（记录快照没有 tags）。
 */
type BackgroundSource = Pick<Background, "path" | "thumbnailPath">;

/**
 * 背景缩略图地址：优先用后端裁剪好的缩略图，没有（老数据）就退回原图。
 * @param background 背景资源（或记录里的背景快照）
 */
const thumbnailSrc = (background: BackgroundSource): string =>
  ApiService.getBackgroundThumbnailUrl(background.thumbnailPath || background.path);

/**
 * 缩略图加载失败 → 退回原图。
 * 老数据的 thumbnailPath 可能指向已删掉的文件、或干脆只有文件名（拼出来的缩略图地址是猜的），
 * 这一层兜底保证列表里不会出现破图；原图也失败时保留灰底空框，不会反复触发。
 * @param event 图片的 error 事件
 * @param background 该缩略图对应的背景资源
 */
const handleThumbnailError = (
  event: React.SyntheticEvent<HTMLImageElement>,
  background: BackgroundSource,
): void => {
  const img = event.currentTarget;
  const fallbackSrc = ApiService.getBackgroundUrl(background.path);
  if (img.src !== fallbackSrc) img.src = fallbackSrc;
};

const BackgroundProperties: React.FC<BackgroundPropertiesProps> = ({
  selectedRecord,
  selectedRecordIndex,
  updateRecord,
  videoWidth,
  videoHeight,
  focusRequest,
}) => {
  // 滑杆/数值框按设置页选的输出尺寸显示，写回记录时换算回 1080p 设计画布
  const { uiWidth, uiHeight, toUiX, toUiY, toDesignX, toDesignY } =
    createCoordinateMapper(videoWidth, videoHeight);

  // 每张背景卡片的 DOM 节点：从预览点中背景时滚到它
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flashingIndex = useFocusFlash(
    focusRequest,
    "background",
    (index) => itemRefs.current[index],
  );

  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [showSelector, setShowSelector] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBackground, setSelectedBackground] =
    useState<Background | null>(null);
  const [filteredBackgrounds, setFilteredBackgrounds] = useState<Background[]>(
    [],
  );

  useEffect(() => {
    fetchBackgrounds();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === "") setFilteredBackgrounds(backgrounds);
    else
      setFilteredBackgrounds(
        backgrounds.filter(
          (bg) =>
            bg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            bg.path.toLowerCase().includes(searchTerm.toLowerCase()),
        ),
      );
  }, [searchTerm, backgrounds]);

  const currentBackgrounds = selectedRecord.bg || [];

  const fetchBackgrounds = async () => {
    try {
      const data = await ApiService.getBackgrounds();
      setBackgrounds(data);
      setFilteredBackgrounds(data);
    } catch (error) {
      console.error("获取背景列表失败", error);
    }
  };

  const addBackground = (background?: Background) => {
    const target = background || selectedBackground;
    if (!target) {
      alert("请选择背景");
      return;
    }
    const newBackground: BackgroundVisual = {
      background: target,
      posX: 0,
      posY: 0,
      scale: 1,
      visible: true,
    };
    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      bg: [...currentBackgrounds, newBackground],
    });
    setSelectedBackground(null);
    setShowSelector(false);
  };

  // 双击直接添加背景，无需再点“确认添加”
  const handleBackgroundDoubleClick = (bg: Background) => {
    setSelectedBackground(bg);
    addBackground(bg);
  };

  const updateBackground = (index: number, field: string, value: any) => {
    const updatedBgs = [...currentBackgrounds];
    updatedBgs[index] = { ...updatedBgs[index], [field]: value };
    updateRecord(selectedRecordIndex, { ...selectedRecord, bg: updatedBgs });
  };

  const deleteBackground = (index: number) => {
    const updatedBgs = currentBackgrounds.filter((_, i) => i !== index);
    updateRecord(selectedRecordIndex, { ...selectedRecord, bg: updatedBgs });
  };

  /**
   * 单行复原：只把指定字段恢复默认（缩放 1.0 / 偏移 0），另外两行保持用户调好的值。
   * 三个字段各自一个图标按钮，互不影响。
   *
   * @param field 要复位的字段
   */
  const resetBackgroundField = (
    index: number,
    field: "scale" | "posX" | "posY",
  ) => {
    const updatedBgs = [...currentBackgrounds];
    updatedBgs[index] = {
      ...updatedBgs[index],
      [field]: field === "scale" ? 1 : 0,
    };
    updateRecord(selectedRecordIndex, { ...selectedRecord, bg: updatedBgs });
  };

  return (
    <>
      <div className="background-properties">
        <h4>背景设置</h4>
        <p className="transform-hint">
          缩放以画面中心为基准；位置 0 = 居中，数值不设上下限（放大后也能把背景完全移出画面，
          滑杆范围随缩放自动扩大）。每行右侧的 ↺ 只复原该行，不影响另外两行。
        </p>
        <div className="backgrounds-list">
          {currentBackgrounds.map((bg, index) => {
            // 老工程文件可能没有这些字段：按默认值（1.0 / 居中）显示，不出现 NaN
            const scale = normalizeBackgroundScale(bg.scale);
            const offsetX = bg.posX ?? 0;
            const offsetY = bg.posY ?? 0;
            const currentUiX = toUiX(offsetX);
            const currentUiY = toUiY(offsetY);
            // 滑杆两端 = 背景刚好完全移出画面所需的偏移；随缩放变大，所以放大后仍能推出去。
            // 同时保证当前值落在范围内：手输过超大坐标后，滑块不会显示成"贴边但值不对"。
            const xLimit = Math.max(
              backgroundOffsetLimit(uiWidth, scale),
              Math.abs(currentUiX),
            );
            const yLimit = Math.max(
              backgroundOffsetLimit(uiHeight, scale),
              Math.abs(currentUiY),
            );

            return (
              <div
                key={index}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                className={`background-item${
                  flashingIndex === index ? " property-focus-flash" : ""
                }`}
              >
                <div className="background-header">
                  {/* 缩略图 + 名称：不看名字也能一眼认出是哪张背景 */}
                  <div className="background-item-info">
                    <div className="background-item-thumb">
                      <img
                        src={thumbnailSrc(bg.background)}
                        alt={bg.background.name}
                        onError={(e) => handleThumbnailError(e, bg.background)}
                      />
                    </div>
                    <h5 title={bg.background.name}>{bg.background.name}</h5>
                  </div>
                  <button onClick={() => deleteBackground(index)}>删除</button>
                </div>

                {/* 缩放：数值框 + 滑块 + 图标复原（↺ 只复位缩放） */}
                <div className="transform-row">
                  <span className="transform-label">缩放</span>
                  <NumberField
                    className="transform-number"
                    value={scale}
                    min={MIN_VISUAL_SCALE}
                    max={MAX_BACKGROUND_SCALE}
                    ariaLabel={`背景 ${index + 1} 缩放`}
                    title="背景缩放（1 = 铺满画面，2 = 长宽各放大一倍）"
                    onChange={(value) =>
                      updateBackground(index, "scale", value)
                    }
                  />
                  <button
                    type="button"
                    className="transform-reset-icon-btn"
                    aria-label={`复原背景 ${index + 1} 缩放`}
                    title="复原缩放为 1.0"
                    onClick={() => resetBackgroundField(index, "scale")}
                  >
                    ↺
                  </button>
                  <div className="transform-slider">
                    <input
                      type="range"
                      min={MIN_VISUAL_SCALE}
                      max={MAX_BACKGROUND_SCALE}
                      step={VISUAL_SCALE_STEP}
                      value={scale}
                      aria-label={`背景 ${index + 1} 缩放滑块`}
                      onChange={(e) =>
                        updateBackground(index, "scale", Number(e.target.value))
                      }
                    />
                  </div>
                </div>

                {/* X 偏移：0 = 居中；数值框不设上下限，滑块范围随缩放扩大 */}
                <div className="transform-row">
                  <span className="transform-label">X坐标偏移</span>
                  <NumberField
                    className="transform-number"
                    integer
                    value={currentUiX}
                    ariaLabel={`背景 ${index + 1} X 偏移`}
                    title="背景中心相对画面中心的 X 偏移（像素，0 = 居中，不设上下限）"
                    onChange={(value) =>
                      updateBackground(index, "posX", toDesignX(value))
                    }
                  />
                  <button
                    type="button"
                    className="transform-reset-icon-btn"
                    aria-label={`复原背景 ${index + 1} X 偏移`}
                    title="X 偏移归零（居中）"
                    onClick={() => resetBackgroundField(index, "posX")}
                  >
                    ↺
                  </button>
                  <div className="transform-slider">
                    <input
                      type="range"
                      min={-xLimit}
                      max={xLimit}
                      step={1}
                      value={currentUiX}
                      aria-label={`背景 ${index + 1} X 偏移滑块`}
                      onChange={(e) =>
                        updateBackground(
                          index,
                          "posX",
                          toDesignX(Number(e.target.value)),
                        )
                      }
                    />
                  </div>
                </div>

                {/* Y 偏移：语义与 X 相同，范围按画面高度计算 */}
                <div className="transform-row">
                  <span className="transform-label">Y坐标偏移</span>
                  <NumberField
                    className="transform-number"
                    integer
                    value={currentUiY}
                    ariaLabel={`背景 ${index + 1} Y 偏移`}
                    title="背景中心相对画面中心的 Y 偏移（像素，0 = 居中，不设上下限）"
                    onChange={(value) =>
                      updateBackground(index, "posY", toDesignY(value))
                    }
                  />
                  <button
                    type="button"
                    className="transform-reset-icon-btn"
                    aria-label={`复原背景 ${index + 1} Y 偏移`}
                    title="Y 偏移归零（居中）"
                    onClick={() => resetBackgroundField(index, "posY")}
                  >
                    ↺
                  </button>
                  <div className="transform-slider">
                    <input
                      type="range"
                      min={-yLimit}
                      max={yLimit}
                      step={1}
                      value={currentUiY}
                      aria-label={`背景 ${index + 1} Y 偏移滑块`}
                      onChange={(e) =>
                        updateBackground(
                          index,
                          "posY",
                          toDesignY(Number(e.target.value)),
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <button
            className="add-background-btn"
            onClick={() => setShowSelector(true)}
          >
            添加背景
          </button>
        </div>
      </div>

      {showSelector && (
        <div className="background-selector">
          <div className="background-selector-content">
            <div className="background-selector-header">
              <h3>选择背景</h3>
              <button
                className="cancel-btn"
                onClick={() => setShowSelector(false)}
              >
                取消
              </button>
            </div>
            <div className="background-selector-body">
              <div className="background-search">
                <input
                  placeholder="搜索背景名称或文件路径..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="background-grid">
                {filteredBackgrounds.map((bg) => (
                  <div
                    key={bg.uuid}
                    className={`background-item ${selectedBackground?.uuid === bg.uuid ? "selected" : ""}`}
                    onClick={() => setSelectedBackground(bg)}
                    onDoubleClick={() => handleBackgroundDoubleClick(bg)}
                    title="双击直接添加该背景"
                  >
                    <div className="background-thumbnail">
                      <img
                        src={thumbnailSrc(bg)}
                        alt={bg.name}
                        onError={(e) => handleThumbnailError(e, bg)}
                      />
                    </div>
                    <div className="background-name">{bg.name}</div>
                    <div className="background-path">{bg.path}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="background-selector-footer">
              <span className="background-selector-hint">
                双击缩略图可直接添加
              </span>
              <button
                className="confirm-btn"
                onClick={() => addBackground()}
                disabled={!selectedBackground}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BackgroundProperties;
