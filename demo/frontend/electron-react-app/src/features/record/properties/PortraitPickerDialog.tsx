/**
 * @component 「选择立绘」弹窗
 *
 * <h3>为什么单独抽成一个组件</h3>
 * 剧情编辑 → 立绘页签里有**两个**入口要挑立绘：
 * 1. 已添加的角色卡片上，点「立绘」缩略图 → 换一张；
 * 2. 「+ 添加立绘」表单里，选完角色后挑初始立绘。
 *
 * 以前第 1 个入口是 JSX、第 2 个入口是 `document.createElement + innerHTML` 手搓的弹窗，
 * 两套 DOM、两套缩略图兜底逻辑。现在统一走这个组件（点哪都长一样），
 * 并且通过 {@link ModalPortal} 挂到 body 上 —— 否则会被停靠面板的层叠上下文裁切（见 ModalPortal 注释）。
 *
 * <h3>滚动与类名</h3>
 * 一个角色的立绘动辄几十张，网格必须能滚：标题栏固定，内容区 `.portrait-picker-body` 自己滚
 * （见 PortraitPickerDialog.css）。类名一律用 `portrait-picker-` 前缀，**不要**再叫
 * `.portrait-modal` —— 资源管理的立绘裁剪弹窗占着这个名字，两边同名会让裁剪弹窗的
 * `overflow: hidden` 盖掉这里的滚动，表现为"最多只显示 16 张、没有滚动条"。
 */
import React from "react";
import type { Portrait } from "@types";
import {
  MISSING_THUMBNAIL_PLACEHOLDER,
  buildPortraitThumbnailUrl,
} from "@features/common/utils/portraitUtils";
import ModalPortal from "./ModalPortal";
import "./PortraitPickerDialog.css";

interface PortraitPickerDialogProps {
  /** 弹窗标题，通常带上角色名：「选择立绘 — 格雷高尔」 */
  title: string;
  /** 可选立绘；空数组时显示 emptyHint，而不是一个空白的弹窗 */
  portraits: Portrait[];
  /** 当前已选中的立绘（高亮 + aria-pressed） */
  selectedPortraitId?: string | null;
  /** 点某一项 */
  onSelect: (portrait: Portrait) => void;
  /** 关闭（✕ / Esc / 点遮罩） */
  onClose: () => void;
  /**
   * 网格上方的说明条。
   *
   * <p>列表不是"这个角色的全部立绘"时用得上：记录里的角色在素材库里被删了，
   * 或者素材库里这个角色还没有立绘 —— 这时列表里放的是**记录当前用的那张**，
   * 不说清楚会让人以为"素材库里就只有这一张"。
   */
  notice?: string;
  /** 没有可选立绘时的提示；不传用默认文案 */
  emptyHint?: string;
}

/** 卡片标题栏里显示的情绪（空值不显示） */
const emotionOf = (portrait: Portrait): string => portrait.emotion || "";

/**
 * 一张立绘卡片。
 *
 * <p>用 `<button>` 而不是 `<div>`：能 Tab 到、能回车/空格选中，屏幕阅读器也知道这是可选项
 * （`aria-pressed` 标出当前那张）。样式在 PortraitPickerDialog.css 里被重置成原来的观感。
 */
const PortraitCard: React.FC<{
  portrait: Portrait;
  selected: boolean;
  onSelect: () => void;
}> = ({ portrait, selected, onSelect }) => {
  const emotion = emotionOf(portrait);
  return (
    <button
      type="button"
      className={`portrait-picker-item${selected ? " selected" : ""}`}
      aria-pressed={selected}
      title={emotion ? `${portrait.portName}（${emotion}）` : portrait.portName}
      onClick={onSelect}
    >
      <span className="portrait-picker-thumb">
        <img
          src={buildPortraitThumbnailUrl(portrait.thumbnailPath)}
          alt={portrait.portName}
          loading="lazy"
          onError={(event) => {
            const image = event.currentTarget;
            // 先摘掉 onerror 再换图，避免占位图自己再失败时无限递归
            image.onerror = null;
            image.src = MISSING_THUMBNAIL_PLACEHOLDER;
          }}
        />
      </span>
      <span className="portrait-picker-name">{portrait.portName}</span>
      {emotion && (
        <span className="portrait-picker-emotion">{emotion}</span>
      )}
    </button>
  );
};

const PortraitPickerDialog: React.FC<PortraitPickerDialogProps> = ({
  title,
  portraits,
  selectedPortraitId,
  onSelect,
  onClose,
  notice,
  emptyHint = "这个角色还没有立绘",
}) => (
  <ModalPortal
    label={title}
    onClose={onClose}
    overlayClassName="portrait-picker-overlay"
    dialogClassName="portrait-picker"
  >
    <div className="portrait-picker-header">
      <div className="portrait-picker-heading">
        <h4 className="portrait-picker-title">{title}</h4>
        {/* 张数：几十张立绘时，滚动的是内容区，标题栏里的"共 N 张"始终可见 */}
        {portraits.length > 0 && (
          <span className="portrait-picker-count">共 {portraits.length} 张</span>
        )}
      </div>
      <button
        type="button"
        className="portrait-picker-close"
        aria-label="关闭"
        title="关闭（Esc）"
        onClick={onClose}
      >
        ✕
      </button>
    </div>

    {/* 内容区独立滚动（标题栏固定）：立绘多到几十张也能全部翻到，不会像以前那样被裁在一屏内 */}
    <div className="portrait-picker-body">
      {notice && <p className="portrait-picker-notice">{notice}</p>}

      {portraits.length === 0 ? (
        <p className="portrait-picker-empty">{emptyHint}</p>
      ) : (
        <div className="portrait-picker-grid">
          {portraits.map((portrait) => (
            <PortraitCard
              key={portrait.portraitID}
              portrait={portrait}
              selected={portrait.portraitID === selectedPortraitId}
              onSelect={() => onSelect(portrait)}
            />
          ))}
        </div>
      )}
    </div>
  </ModalPortal>
);

export default PortraitPickerDialog;
