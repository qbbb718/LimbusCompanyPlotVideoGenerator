/**
 * @component 立绘「情绪动画（序列帧）」
 *
 * <h3>职责边界：做动画在资源管理，用哪一段 + 摆在哪在这里</h3>
 * 动画的**制作**（导入帧序列、每帧时长、播放参数、素材上的原始摆放）全部在
 * 「资源管理 → 序列帧动画」里，这里一个都不做——一段动画要被多条记录、多个角色复用，
 * 逐条记录改它的节奏会产生"同一段动画在不同记录里长得不一样"的碎片状态。
 *
 * <p>唯一的例外是**摆放**（位置 + 缩放）：记录里本来就存了一份内联快照
 * （见 `animationClipAsset.ts` 的"素材是模板，记录是快照"），而"这条记录里角色的站位/缩放"
 * 只有在这里才看得见。所以这里提供「摆放」三行控件，改的只是本记录的
 * `offsetX / offsetY / scale`，并提供一个「还原」回到素材上的值
 * （见 {@link EmotionPlacementEditor}）。
 *
 * <h3>为什么不用原生 &lt;select&gt;</h3>
 * 原生 `<option>` 里放不了图片，而"看缩略图挑动画"正是这里最需要的能力（几段花开/怒气符号
 * 光看名字分不出来）。所以改用自定义下拉：触发按钮与每个选项都带一张**缩略图**
 * （= 素材挑的代表帧，也就是预览图里静止时画的那一张），布局与「说话人」的角色下拉
 * （`CharacterSelect`）保持同一套观感。
 */
import React, { useEffect, useRef, useState } from "react";

import ApiService from "@services/ApiService";
import type { EmotionAnim } from "../animation/animationTypes";
import { emotionPlacementOf, isEmotionAnimUsable } from "../animation/animationTypes";
import type { AnimationClipDto } from "../animation/animationClipAsset";
import {
  LOOP_MODE_LABELS,
  assetPlacementOf,
  emotionAnimFromAsset,
  isContentInSync,
  syncSequenceFromAsset,
  totalFramesOf,
} from "../animation/animationClipAsset";
import { useAnimationClipLibrary } from "../animation/useAnimationClipLibrary";
import { preloadClipFrames } from "../animation/framePreloader";
import EmotionPlacementEditor from "./EmotionPlacementEditor";
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

/** 下拉里的一项（「不使用」+ 每个素材 + 被删素材的占位项） */
interface PickerOption {
  /** 选项值 = 素材 id；空串 = 不使用 */
  value: string;
  label: string;
  /** 副标题（帧数 / 状态说明） */
  meta: string;
  /** 缩略图地址；null = 没有图（「不使用」用占位块） */
  thumb: string | null;
}

const loopLabelOf = (value: string | undefined): string =>
  LOOP_MODE_LABELS.find((item) => item.value === value)?.label ?? "播一次";

/** 素材的缩略图：用素材上挑好的代表帧，与预览图静止时画的是同一张 */
const thumbOf = (clip: AnimationClipDto): string =>
  ApiService.getAnimationClipFrameUrl(clip.id, clip.poster?.frame ?? 0);

/**
 * 选项缩略图：有图就画图，没图（「不使用」/ 图挂了）画一个占位块。
 *
 * <p>帧图大多是透明底的符号/花瓣，所以底板用棋盘格，避免"透明当白底"看不出来。
 */
const Thumb: React.FC<{ option: PickerOption; className: string }> = ({ option, className }) => (
  <span className={`${className}${option.thumb ? "" : " is-empty"}`} aria-hidden="true">
    {option.thumb ? (
      <img
        src={option.thumb}
        alt=""
        draggable={false}
        onError={(event) => {
          // 素材被删/拷漏时不要留一个破图标，退回占位块
          (event.currentTarget as HTMLImageElement).style.display = "none";
          event.currentTarget.parentElement?.classList.add("is-empty");
        }}
      />
    ) : (
      "—"
    )}
  </span>
);

const EmotionAnimPicker: React.FC<EmotionAnimPickerProps> = ({
  emotionAnim,
  onChange,
  elementLabel,
  plot = true,
  onOpenAnimationLibrary,
}) => {
  const library = useAnimationClipLibrary();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const hasAnimation = isEmotionAnimUsable(emotionAnim);
  const asset = library.find(emotionAnim?.clipId);
  // "与素材不一致"只针对**时序/播放参数**：摆放是允许按记录微调的（见组件注释），
  // 微调过摆放不该弹"从素材同步"的警告，否则每次挪一下动画都像把素材改坏了
  const inSync = hasAnimation ? isContentInSync(emotionAnim!, asset) : true;
  const currentValue = hasAnimation ? emotionAnim!.clipId : "";

  // 帧图提前拉一遍：预览播放是"每帧换 src"，不预热开头几轮会闪白
  useEffect(() => {
    if (!emotionAnim?.clipId) return;
    preloadClipFrames(emotionAnim.clipId, emotionAnim.frameHolds?.length ?? 0);
  }, [emotionAnim?.clipId, emotionAnim?.frameHolds?.length]);

  /**
   * 选项列表。
   *
   * <p>「素材被删了但记录还引用着」时补一个占位项 —— 否则下拉会显示成"不使用"，
   * 用户会以为自己没选（与旧的原生 select 占位项同一用意）。
   */
  const options: PickerOption[] = [
    { value: "", label: "不使用", meta: "立绘上不画序列帧", thumb: null },
    ...library.clips.map((clip) => ({
      value: clip.id,
      label: clip.name,
      meta: `${clip.frameCount} 张 / ${clip.totalFrames} 帧`,
      thumb: thumbOf(clip),
    })),
  ];
  if (hasAnimation && !asset) {
    options.push({
      value: emotionAnim!.clipId,
      label: `${emotionAnim!.name ?? emotionAnim!.clipId}（素材已删除）`,
      meta: "记录里仍然引用着，成片不画",
      // 素材目录没了，图大概率 404；加载失败时露出占位块即可
      thumb: ApiService.getAnimationClipFrameUrl(
        emotionAnim!.clipId,
        emotionAnim!.posterFrame ?? 0,
      ),
    });
  }

  const selectedIndex = options.findIndex((option) => option.value === currentValue);
  const selected = options[selectedIndex >= 0 ? selectedIndex : 0];

  const closeMenu = (focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  // 点下拉框以外 / 按 Esc：关闭菜单（与 CharacterSelect 同一套交互）
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // 打开菜单时把焦点落到"当前选中项"上：键盘用户一进来就在自己那一项，不用从头数
  useEffect(() => {
    if (!open) return;
    const index = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(index);
    const timer = window.setTimeout(() => optionRefs.current[index]?.focus(), 0);
    return () => window.clearTimeout(timer);
    // selectedIndex 只用于决定初始焦点，菜单位置变化不需要重新聚焦
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSelect = (clipId: string) => {
    closeMenu(true);
    if (!clipId) {
      onChange(undefined);
      return;
    }
    const picked = library.find(clipId);
    // 素材已删除的占位项：点它等于"保持原样"，不把记录改坏
    if (!picked) return;
    onChange(emotionAnimFromAsset(picked));
  };

  /** 菜单内的键盘导航：↑↓/Home/End 移动焦点，Esc 关闭，Tab 离开即关 */
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Home":
      case "End": {
        event.preventDefault();
        let next = activeIndex;
        if (event.key === "ArrowDown") next = Math.min(last, activeIndex + 1);
        else if (event.key === "ArrowUp") next = Math.max(0, activeIndex - 1);
        else if (event.key === "Home") next = 0;
        else next = last;
        setActiveIndex(next);
        optionRefs.current[next]?.focus();
        break;
      }
      case "Escape":
        event.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        // 不拦默认行为：焦点照常离开，菜单顺手收起
        setOpen(false);
        break;
      default:
        break;
    }
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
              人格故事模式下情绪动画不参与渲染，切回「剧情」自动生效。
            </div>
          )}

          <div className="char-row" style={{ gap: 6, alignItems: "center" }}>
            <span className="char-label-fixed">选用动画</span>
            <div className="emotion-anim-select" ref={rootRef}>
              <button
                type="button"
                ref={triggerRef}
                className="emotion-anim-select-trigger"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={`${elementLabel} 选用情绪动画`}
                title={selected.meta ? `${selected.label} · ${selected.meta}` : selected.label}
                onClick={() => setOpen((value) => !value)}
                onKeyDown={(event) => {
                  // ↓/↑ 直接打开（原生 select 的肌肉记忆），Esc 收起
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setOpen(true);
                  } else if (event.key === "Escape") {
                    setOpen(false);
                  }
                }}
              >
                <Thumb option={selected} className="emotion-anim-select-thumb" />
                <span className="emotion-anim-select-label">{selected.label}</span>
                <span className="emotion-anim-select-arrow">▾</span>
              </button>

              {open && (
                <div
                  className="emotion-anim-select-menu"
                  role="listbox"
                  aria-label={`${elementLabel} 情绪动画素材`}
                  onKeyDown={handleMenuKeyDown}
                >
                  {options.map((option, index) => (
                    <button
                      key={option.value || "__none__"}
                      type="button"
                      role="option"
                      aria-selected={option.value === currentValue}
                      tabIndex={-1}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      className={`emotion-anim-select-option${
                        option.value === currentValue ? " selected" : ""
                      }`}
                      title={option.meta ? `${option.label} · ${option.meta}` : option.label}
                      onClick={() => handleSelect(option.value)}
                    >
                      <Thumb option={option} className="emotion-anim-select-thumb" />
                      <span className="emotion-anim-select-option-text">
                        <span className="emotion-anim-select-option-name">{option.label}</span>
                        <span className="emotion-anim-select-option-meta">{option.meta}</span>
                      </span>
                      {option.value === currentValue && (
                        <span className="emotion-anim-select-check" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                  {library.clips.length === 0 && (
                    <div className="emotion-anim-select-empty">还没有素材</div>
                  )}
                </div>
              )}
            </div>
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
              还没有素材：点「前往资源管理编辑动画」导入帧序列。
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
              </div>
            </div>
          )}

          {/* 摆放：这条记录的微调入口。「还原」回到素材上的摆放，见 EmotionPlacementEditor */}
          {hasAnimation && (
            <EmotionPlacementEditor
              elementLabel={elementLabel}
              value={emotionPlacementOf(emotionAnim)}
              baseline={asset ? assetPlacementOf(asset) : null}
              onChange={(patch) => onChange({ ...emotionAnim!, ...patch })}
            />
          )}

          {hasAnimation && !asset && (
            <div className="emotion-picker-warn" role="alert">
              素材已不在资源管理里（可能被删除）。成片里不会画出这段动画，但记录本身没有损坏。
            </div>
          )}
          {/* 提示只针对时序/播放参数：摆放微调属于正常的按记录调整，不算"不一致" */}
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
