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
      className={`portrait-grid-item${selected ? " selected" : ""}`}
      aria-pressed={selected}
      title={emotion ? `${portrait.portName}（${emotion}）` : portrait.portName}
      onClick={onSelect}
    >
      <span className="portrait-grid-thumb">
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
      <span className="name">{portrait.portName}</span>
      {emotion && <span className="emotion-tag">{emotion}</span>}
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
    overlayClassName="portrait-modal-overlay"
    dialogClassName="portrait-modal"
  >
    <div className="portrait-modal-header">
      <h4>{title}</h4>
      <button
        type="button"
        className="portrait-modal-close"
        aria-label="关闭"
        title="关闭（Esc）"
        onClick={onClose}
      >
        ✕
      </button>
    </div>

    {notice && <p className="portrait-modal-notice">{notice}</p>}

    {portraits.length === 0 ? (
      <p className="portrait-modal-empty">{emptyHint}</p>
    ) : (
      <div className="portrait-grid">
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
  </ModalPortal>
);

export default PortraitPickerDialog;
