import React, { useState, useEffect, useRef } from "react";
import { Record, Background, BackgroundVisual } from "@types";
import ApiService from "@services/ApiService";
import { askConfirm } from "@features/common/components/ConfirmDialog";
import NumberField from "./NumberField";
import ModalPortal from "./ModalPortal";
import { useFocusFlash } from "../preview/useFocusFlash";
import type { PropertyFocusRequest } from "../preview/previewTargets";
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
import {
  MAX_BACKGROUND_SCALE,
  MIN_VISUAL_SCALE,
  VISUAL_SCALE_STEP,
  backgroundOffsetLimit,
  createCoordinateMapper,
  normalizeBackgroundScale,
} from "./visualCoordinates";
import {
  canMoveBackgroundLayer,
  insertBackgroundLayer,
  moveBackgroundLayer,
} from "./backgroundLayers";
import type { BackgroundLayerDirection } from "./backgroundLayers";
import "../RecordEditor.css";
import "./TransformControls.css";
import "./BackgroundProperties.css";

interface BackgroundPropertiesProps extends VisualPanelLinkProps {
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

/**
 * 「背景」页签。
 *
 * <p>列表里的每一张背景既可以被**批量勾选删除**（勾选框 + 顶部工具条），
 * 也可以**点卡片在预览里选中**——两套状态分开管理，互不影响。
 *
 * <p><b>层级</b>：列表顺序就是叠放顺序，**列表最上 = 画面最前**（见 `backgroundLayers.ts`）。
 * 每张卡片标题行的 ↑ / ↓ 把这张背景往前 / 往后挪一层（与前一项 / 后一项交换），
 * 列表首项不能上移、末项不能下移。顺序一变，预览、播放与导出立刻按新层级渲染；
 * 顺序随 `record.bg` 一起保存 / 加载，删除素材后剩下各项的相对顺序保持不变。
 */
const BackgroundProperties: React.FC<BackgroundPropertiesProps> = ({
  selectedRecord,
  selectedRecordIndex,
  updateRecord,
  videoWidth,
  videoHeight,
  focusRequest,
  activeIndex = null,
  onSelectVisual,
  onVisualsRemoved,
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

  // 批量删除的选中态：与预览选中（activeIndex）分开管理
  const batch = useBatchSelection(currentBackgrounds.length, selectedRecord.uuid);

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
      // 新加的背景默认不压暗：加进来先看到原图，需要氛围时再勾
      dim: false,
    };
    // 默认插入位置：**追加到列表末尾 = 画面最底层**（与「立绘」「临时图片」的新增行为一致，
    // 不会把用户已经调好的背景瞬间盖住）。想让它显示在前面，点这张卡片的「↑」即可。
    updateRecord(selectedRecordIndex, {
      ...selectedRecord,
      bg: insertBackgroundLayer(currentBackgrounds, newBackground),
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

  /**
   * @function 调整背景层级（卡片上的 ↑ / ↓）
   *
   * <p>列表顺序就是层级：**上移 = 与前一项交换（画面里往前一层）**，
   * **下移 = 与后一项交换（画面里往后一层）**。首项不能再上移、末项不能再下移，
   * 越界由 {@link canMoveBackgroundLayer} 兜住（按钮本身也禁用，见 {@link moveBackgroundLayer}）。
   *
   * <p>写回记录后预览图会按新的 `record.bg` 重新渲染，播放 / 导出读的也是同一个顺序，
   * 所以三处的叠放立刻一致；顺序随记录一起保存 / 加载，不需要额外的字段。
   *
   * @param index     要移动的背景下标（0 = 列表最上 = 画面最前）
   * @param direction `up` = 上移，`down` = 下移
   */
  const moveLayer = (index: number, direction: BackgroundLayerDirection) => {
    const updatedBgs = moveBackgroundLayer(currentBackgrounds, index, direction);
    if (!updatedBgs) return;
    // 批量勾选是按下标记的：位置一变就可能指到别的背景上，和删除一样先清空，避免误删
    batch.clear();
    updateRecord(selectedRecordIndex, { ...selectedRecord, bg: updatedBgs });
  };

  /**
   * @function 删除背景（单个「删除」按钮与批量删除共用）
   *
   * <p>背景只是记录里的引用（素材文件仍在资源管理里），所以和单条删除一样：
   * 过滤掉这些下标后一次写回 `updateRecord`。删除后清空批量勾选，
   * 并把删掉的下标告诉上层，让它同步预览选中态。
   *
   * @param indexes 要删掉的下标（重复 / 越界会被忽略）
   */
  const removeBackgrounds = (indexes: number[]) => {
    const removed = normalizeIndexes(indexes, currentBackgrounds.length);
    if (removed.length === 0) return;
    const removedSet = new Set(removed);
    const updatedBgs = currentBackgrounds.filter((_, i) => !removedSet.has(i));
    updateRecord(selectedRecordIndex, { ...selectedRecord, bg: updatedBgs });
    batch.clear();
    onVisualsRemoved?.(removed);
  };

  /** @function 删除一条背景（卡片上的「删除」按钮） */
  const deleteBackground = (index: number) => {
    removeBackgrounds([index]);
  };

  /** @function 批量删除勾选的背景（先二次确认） */
  const handleBatchDelete = async () => {
    const removed = batch.indexes;
    if (removed.length === 0) return;
    const names = removed
      .map((index) => currentBackgrounds[index]?.background?.name)
      .filter((name): name is string => Boolean(name));
    const confirmed = await askConfirm({
      title: "批量删除背景",
      message: `确定删除选中的 ${removed.length} 张背景吗？`,
      detail: names.length
        ? `将从这条记录里移除：${names.join("、")}。\n素材本身仍在「资源管理 → 背景」里，可随时再加回来。`
        : undefined,
      confirmLabel: "删除",
      danger: true,
    });
    if (!confirmed) return;
    removeBackgrounds(removed);
  };

  /**
   * @function 点击卡片本体 → 在预览里选中这张背景
   * 卡片里的控件（按钮 / 滑杆 / 数值框 / 勾选框）不参与，见 {@link isInteractiveClickTarget}。
   */
  const handleCardClick = (event: React.MouseEvent, index: number) => {
    if (isInteractiveClickTarget(event.target)) return;
    onSelectVisual?.(index);
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
          列表最上 = 画面最前：用卡片上的 ↑ / ↓ 调整背景之间的叠放顺序（首项不能再上移、末项不能再下移）；
          缩放以画面中心为基准；位置 0 = 居中，可超出画面；每行 ↺ 只复原该行；
          「压暗」只压这张背景，不影响叠在上面的立绘与 UI。
        </p>
        {/* 批量删除工具条：勾选后才出现「批量删除」 */}
        <BatchSelectionBar
          label="背景"
          total={currentBackgrounds.length}
          selectedCount={batch.count}
          onToggleAll={batch.toggleAll}
          onClear={batch.clear}
          onDelete={handleBatchDelete}
          previewHint="点卡片 = 预览定位 · 勾选框 = 批量删除"
        />
        <div className="backgrounds-list">
          {currentBackgrounds.map((bg, index) => {
            const isPreviewSelected = activeIndex === index;
            // 老工程文件可能没有这些字段：按默认值（1.0 / 居中）显示，不出现 NaN
            const scale = normalizeBackgroundScale(bg.scale);
            const offsetX = bg.posX ?? 0;
            const offsetY = bg.posY ?? 0;
            // 压暗是可选字段：老工程没有 → 不压暗（与加这个开关之前的行为一致）
            const dimmed = bg.dim === true;
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
                }${isPreviewSelected ? " visual-card-preview-selected" : ""}${
                  batch.has(index) ? " visual-card-batch-selected" : ""
                }${onSelectVisual ? " visual-card-clickable" : ""}`}
                // 点卡片 = 在预览里选中这张背景（与批量勾选无关）
                onClick={(event) => handleCardClick(event, index)}
                data-preview-selected={isPreviewSelected ? "true" : undefined}
              >
                <div className="background-header">
                  {/* 勾选框 + 缩略图 + 名称：不看名字也能一眼认出是哪张背景 */}
                  <div className="background-item-info">
                    <BatchCardCheckbox
                      checked={batch.has(index)}
                      label={`选择背景 ${index + 1}`}
                      onToggle={() => batch.toggle(index)}
                    />
                    <div className="background-item-thumb">
                      <img
                        src={thumbnailSrc(bg.background)}
                        alt={bg.background.name}
                        onError={(e) => handleThumbnailError(e, bg.background)}
                      />
                    </div>
                    <h5 title={bg.background.name}>{bg.background.name}</h5>
                  </div>
                  <div className="background-controls">
                    {/* 层级：↑ 往前一层 / ↓ 往后一层。首项不能上移、末项不能下移（禁用，防越界） */}
                    <div
                      className="background-order-controls"
                      role="group"
                      aria-label={`背景 ${index + 1} 层级`}
                    >
                      <button
                        type="button"
                        title="上移（往画面更前一层）"
                        disabled={
                          !canMoveBackgroundLayer(
                            index,
                            "up",
                            currentBackgrounds.length,
                          )
                        }
                        onClick={() => moveLayer(index, "up")}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        title="下移（往画面更后一层）"
                        disabled={
                          !canMoveBackgroundLayer(
                            index,
                            "down",
                            currentBackgrounds.length,
                          )
                        }
                        onClick={() => moveLayer(index, "down")}
                      >
                        ↓
                      </button>
                    </div>
                    <button type="button" onClick={() => deleteBackground(index)}>
                      删除
                    </button>
                  </div>
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

                {/* 压暗：与「立绘压暗」「临时图片压暗」同一个口径（压暗）。
                    只压这张背景自己的像素，画在它上面的立绘、临时图片与 UI 都不受影响；
                    位置/缩放的 ↺ 也不会碰它。 */}
                <div className="transform-row background-dim-row">
                  <span className="transform-label">压暗</span>
                  <label
                    className="background-dim-toggle"
                    title="勾选后这张背景压暗（与「立绘压暗」同一口径），预览与成片都会变暗"
                  >
                    <input
                      type="checkbox"
                      checked={dimmed}
                      aria-label={`背景 ${index + 1} 压暗`}
                      onChange={(e) =>
                        updateBackground(index, "dim", e.target.checked)
                      }
                    />
                  </label>
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

      {/* 选择背景弹窗：挂到 body（ModalPortal），否则会被停靠面板的层叠上下文盖住 */}
      {showSelector && (
        <ModalPortal
          label="选择背景"
          onClose={() => setShowSelector(false)}
          overlayClassName="background-selector"
          dialogClassName="background-selector-content"
        >
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
        </ModalPortal>
      )}
    </>
  );
};

export default BackgroundProperties;
