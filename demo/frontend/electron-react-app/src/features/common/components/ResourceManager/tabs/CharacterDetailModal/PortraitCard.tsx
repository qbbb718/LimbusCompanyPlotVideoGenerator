import React from "react";
import { Portrait } from "@types";
import PortraitThumbnail from "./PortraitThumbnail";
import { getEmotionLabel } from "../../../../utils/emotionMapper";

interface PortraitCardProps {
  portrait: Portrait;
  characterId: string;
  isDefault: boolean;
  /**
   * 这张立绘的缩略图代次：裁剪 / 换图后父组件给它 +1。
   *
   * <p>缩略图文件名固定，后端只覆盖内容，所以只能靠这个代次换一个 `?t=` 重新取图。
   */
  thumbnailVersion?: number;
  onEdit: (portrait: Portrait) => void;
  onSetDefault: (portraitId: string) => void;
  onDelete: (portraitId: string) => void;
  /**
   * 多选模式：卡片变成"可勾选"状态。
   *
   * <p>卡片本身包一层 `<label>`，点卡片任意位置（含缩略图 / 名称）都等于勾选，
   * 键盘也能用 Tab + 空格操作；单张操作按钮在这个状态下收起 —— 既避免误触
   * 「删除」，也让"点卡片 = 勾选"没有歧义。
   */
  selectable?: boolean;
  /** 这张立绘当前是否被勾选（仅多选模式有意义） */
  selected?: boolean;
  /** 批量操作进行中：勾选框置灰，避免改到正在处理的那批 */
  selectionDisabled?: boolean;
  /** 勾选 / 取消勾选（多选模式下由卡片和勾选框共同触发） */
  onToggleSelect?: (portraitId: string) => void;

  // ---- 拖拽排序 ----
  /** 这张卡片当前是否可以拖动（多选 / 批量操作 / 保存顺序中为 false） */
  draggable?: boolean;
  /** 正在被拖动（卡片留在网格里当占位，样式变淡、浮起） */
  dragging?: boolean;
  /** 拖到这张卡片上时的落点：插入到它前面 / 后面 */
  dropPosition?: "before" | "after" | null;
  onDragStart?: (
    event: React.DragEvent<HTMLElement>,
    portrait: Portrait,
  ) => void;
  onDragOver?: (
    event: React.DragEvent<HTMLElement>,
    portrait: Portrait,
  ) => void;
  onDragLeave?: (
    event: React.DragEvent<HTMLElement>,
    portrait: Portrait,
  ) => void;
  onDrop?: (event: React.DragEvent<HTMLElement>, portrait: Portrait) => void;
  onDragEnd?: (event: React.DragEvent<HTMLElement>) => void;
}

const PortraitCard: React.FC<PortraitCardProps> = ({
  portrait,
  characterId,
  isDefault,
  thumbnailVersion = 0,
  onEdit,
  onSetDefault,
  onDelete,
  selectable = false,
  selected = false,
  selectionDisabled = false,
  onToggleSelect,
  draggable = false,
  dragging = false,
  dropPosition = null,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) => {
  const handleImageError = (portraitId: string, error: any) => {
    console.error("[PortraitCard] 缩略图加载失败", {
      portraitId,
      error,
    });
  };

  const handleImageLoad = (portraitId: string, url: string) => {
    console.log("[PortraitCard] 缩略图加载成功", {
      portraitId,
      url,
    });
  };

  const cardClassName = [
    "portrait-card",
    selectable ? "portrait-card--selectable" : "",
    selectable && selected ? "portrait-card--selected" : "",
    draggable ? "portrait-card--draggable" : "",
    dragging ? "portrait-card--dragging" : "",
    dropPosition === "before" ? "portrait-card--drop-before" : "",
    dropPosition === "after" ? "portrait-card--drop-after" : "",
    dropPosition ? "portrait-card--drop-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <div className="portrait-thumbnail">
        <PortraitThumbnail
          portrait={portrait}
          characterId={characterId}
          cacheBust={thumbnailVersion}
          onLoadComplete={handleImageLoad}
          onError={handleImageError}
        />
        {/* 拖拽手柄：整张卡片都可拖，这个角标只是"可以拖"的视觉提示（多选时让位给勾选框） */}
        {draggable && !selectable && (
          <span
            className="portrait-drag-handle"
            title="拖动卡片调整顺序"
            aria-hidden="true"
          >
            ⠿
          </span>
        )}
        {/*
         * 默认立绘角标：始终渲染在**这张卡片**上，不依赖列表位置。
         * 拖拽 / 排序后卡片带着角标一起移动，不会出现"角标留在第一张"的错位。
         */}
        {isDefault && (
          <span className="portrait-default-badge" title="默认立绘">
            默认
          </span>
        )}
        {selectable && (
          // 勾选框浮在缩略图左上角。用 <label> 包住 input：点白色徽标（不只是小方框）
          // 也能勾选；阻止冒泡，避免同一次点击又触发卡片的 onClick 把勾选取消回去。
          <label
            className="portrait-card-checkbox"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              disabled={selectionDisabled}
              onChange={() => onToggleSelect?.(portrait.portraitID)}
              aria-label={`选择立绘 ${portrait.portName}`}
            />
          </label>
        )}
      </div>
      <div className="portrait-info">
        <h4>{portrait.portName}</h4>
        {/* 情绪统一显示中文关键词，后端返回的 happy / 旧数据的 HAPPY 都归一化 */}
        <p>情绪: {getEmotionLabel(portrait.emotion)}</p>
        {isDefault && <p className="default-portrait-indicator">默认立绘</p>}
        {selectable ? (
          <div className="portrait-actions portrait-actions--selection">
            <span className="portrait-selection-hint">
              {selected ? "已选中" : "点击卡片选择"}
            </span>
          </div>
        ) : (
          <div className="portrait-actions">
            <button className="btn-primary" onClick={() => onEdit(portrait)}>
              编辑
            </button>
            {!isDefault && (
              <button
                className="btn-secondary"
                onClick={() => onSetDefault(portrait.portraitID)}
              >
                设为默认
              </button>
            )}
            <button
              className="btn-danger"
              onClick={() => onDelete(portrait.portraitID)}
            >
              删除
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    // 始终是同一个 <div>：多选模式只加 class / 点击行为。
    // 若换成 <label> 包一层，切换模式时整棵子树会重建，几十张缩略图会全部重新下载。
    // 键盘可访问性由卡片里的真实 checkbox 提供（Tab 聚焦 + 空格切换）。
    <div
      className={cardClassName}
      data-portrait-id={portrait.portraitID}
      // 多选模式下卡片用于勾选，不再作为拖拽源
      draggable={draggable || undefined}
      aria-grabbed={dragging || undefined}
      onDragStart={
        draggable && onDragStart
          ? (event) => onDragStart(event, portrait)
          : undefined
      }
      onDragOver={
        onDragOver ? (event) => onDragOver(event, portrait) : undefined
      }
      onDragLeave={
        onDragLeave ? (event) => onDragLeave(event, portrait) : undefined
      }
      onDrop={onDrop ? (event) => onDrop(event, portrait) : undefined}
      onDragEnd={onDragEnd}
      onClick={
        selectable && !selectionDisabled
          ? () => onToggleSelect?.(portrait.portraitID)
          : undefined
      }
    >
      {content}
    </div>
  );
};

export default PortraitCard;
