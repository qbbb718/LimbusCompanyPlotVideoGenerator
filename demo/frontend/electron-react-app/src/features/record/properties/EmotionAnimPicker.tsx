/**
 * @component 立绘「情绪动画（序列帧）」选择器
 *
 * 剧情编辑页里**只负责"用哪一段"**：选一套在「资源管理 → 序列帧动画」里做好的动画，
 * 或者跳过去编辑。动画的导入、每帧时长、代表帧摆放全部在资源管理里，这里一个都不做。
 *
 * <h3>为什么这里只读</h3>
 * 一段动画要被多条记录、多个角色复用，逐条记录改它的节奏/位置会产生"同一段动画在不同记录里长得不一样"
 * 的碎片状态。把编排收口到资源管理之后，记录里只留一份**内联快照**（渲染端不读盘、画面稳定），
 * 素材改了也不回溯老工程——要同步由用户在这里点「从素材同步」。
 */
import React, { useEffect, useState } from "react";

import ApiService from "@services/ApiService";
import type { EmotionAnim } from "../animation/animationTypes";
import { isEmotionAnimUsable } from "../animation/animationTypes";
import {
  LOOP_MODE_LABELS,
  emotionAnimFromAsset,
  isSequenceInSync,
  syncSequenceFromAsset,
  totalFramesOf,
} from "../animation/animationClipAsset";
import { useAnimationClipLibrary } from "../animation/useAnimationClipLibrary";
import { preloadClipFrames } from "../animation/framePreloader";
import "./EmotionAnimPicker.css";

interface EmotionAnimPickerProps {
  /** 当前立绘的情绪动画；undefined = 没有 */
  emotionAnim?: EmotionAnim;
  /** 写回记录；选「不使用」时传 undefined */
  onChange: (next: EmotionAnim | undefined) => void;
  /** 无障碍标签用的名字（角色名） */
  elementLabel: string;
  /** 是否剧情模式；人格故事模式不渲染立绘，这里只置灰 + 提示 */
  plot?: boolean;
  /** 跳转到「资源管理 → 序列帧动画」；不传则不显示跳转按钮（独立的组件测试里常见） */
  onOpenAnimationLibrary?: () => void;
}

const loopLabelOf = (value: string | undefined): string =>
  LOOP_MODE_LABELS.find((item) => item.value === value)?.label ?? "播一次";

const EmotionAnimPicker: React.FC<EmotionAnimPickerProps> = ({
  emotionAnim,
  onChange,
  elementLabel,
  plot = true,
  onOpenAnimationLibrary,
}) => {
  const library = useAnimationClipLibrary();
  const [collapsed, setCollapsed] = useState(false);

  const hasAnimation = isEmotionAnimUsable(emotionAnim);
  const asset = library.find(emotionAnim?.clipId);
  const inSync = hasAnimation ? isSequenceInSync(emotionAnim!, asset) : true;

  // 帧图提前拉一遍：预览播放是"每帧换 src"，不预热开头几轮会闪白
  useEffect(() => {
    if (!emotionAnim?.clipId) return;
    preloadClipFrames(emotionAnim.clipId, emotionAnim.frameHolds?.length ?? 0);
  }, [emotionAnim?.clipId, emotionAnim?.frameHolds?.length]);

  const handleSelect = (clipId: string) => {
    if (!clipId) {
      onChange(undefined);
      return;
    }
    const picked = library.find(clipId);
    if (!picked) return;
    onChange(emotionAnimFromAsset(picked));
  };

  const summary = hasAnimation
    ? `${asset?.name ?? emotionAnim!.name ?? "素材"} · ${emotionAnim!.frameHolds.length} 张 / ${totalFramesOf(
        emotionAnim!.frameHolds,
      )} 帧`
    : "未使用";

  return (
    <div className="emotion-picker" style={{ opacity: plot ? 1 : 0.55 }}>
      <div className="animation-panel-header">
        <button
          type="button"
          className="animation-panel-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? "展开情绪动画" : "收起情绪动画（收起后动画仍然生效）"}
        >
          {collapsed ? "▸" : "▾"} 情绪动画（序列帧）
        </button>
        <span className="animation-panel-summary">{summary}</span>
      </div>

      {!collapsed && (
        <div className="emotion-picker-body">
          {!plot && (
            <div className="global-hint" role="note">
              人格故事模式下立绘不参与渲染，情绪动画不会出现在成片里；切回「剧情」后自动生效。
            </div>
          )}

          <div className="char-row" style={{ gap: 6, alignItems: "center" }}>
            <span className="char-label-fixed">选用动画</span>
            <select
              value={hasAnimation ? emotionAnim!.clipId : ""}
              aria-label={`${elementLabel} 选用情绪动画`}
              onChange={(e) => handleSelect(e.target.value)}
            >
              <option value="">不使用</option>
              {library.clips.map((clip) => (
                <option key={clip.id} value={clip.id}>
                  {clip.name}（{clip.frameCount} 张 / {clip.totalFrames} 帧）
                </option>
              ))}
              {/* 素材被删了但仍被记录引用：保留一个占位项，否则下拉会显示成"不使用"误导用户 */}
              {hasAnimation && !asset && (
                <option value={emotionAnim!.clipId}>
                  {emotionAnim!.name ?? emotionAnim!.clipId}（素材已删除）
                </option>
              )}
            </select>
            {onOpenAnimationLibrary && (
              <button
                type="button"
                onClick={onOpenAnimationLibrary}
                title="打开「资源管理 → 序列帧动画」创建或编辑动画"
              >
                前往资源管理编辑动画 →
              </button>
            )}
          </div>

          {library.clips.length === 0 && !library.loading && (
            <div className="global-hint">
              还没有可用于序列帧动画的素材。点「前往资源管理编辑动画」导入一批帧图片即可创建。
            </div>
          )}
          {library.error && (
            <div className="global-hint" role="alert">
              动画素材读取失败：{library.error}
            </div>
          )}

          {hasAnimation && (
            <div className="emotion-picker-summary">
              <img
                src={ApiService.getAnimationClipFrameUrl(
                  emotionAnim!.clipId,
                  emotionAnim!.posterFrame ?? 0,
                )}
                alt=""
              />
              <div>
                <div>
                  播放：{loopLabelOf(emotionAnim!.loop)} · 代表帧 第 {(emotionAnim!.posterFrame ?? 0) + 1} 张
                </div>
                <div>
                  位置：横向 {(emotionAnim!.offsetX ?? 0).toFixed(2)} 头宽、纵向{" "}
                  {(emotionAnim!.offsetY ?? 0).toFixed(2)} 头宽 · 缩放{" "}
                  {Math.round((emotionAnim!.scale ?? 1) * 100)}%
                </div>
              </div>
            </div>
          )}

          {hasAnimation && !asset && (
            <div className="emotion-picker-warn" role="alert">
              素材已不在资源管理里（可能被删除）。成片里不会画出这段动画，但记录本身没有损坏。
            </div>
          )}
          {hasAnimation && asset && !inSync && (
            <div className="emotion-picker-warn">
              这条记录里的配置与素材当前版本不一致。
              <button type="button" onClick={() => onChange(syncSequenceFromAsset(emotionAnim!, asset))}>
                从素材同步
              </button>
            </div>
          )}
          {hasAnimation && asset?.missingFrames && (
            <div className="emotion-picker-warn">
              素材缺帧：磁盘上只有 {asset.framesOnDisk} 张（应有 {asset.frameCount} 张），缺的部分不会显示。
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EmotionAnimPicker;
