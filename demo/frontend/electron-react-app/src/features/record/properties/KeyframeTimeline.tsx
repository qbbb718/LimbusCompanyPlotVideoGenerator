/**
 * @module 关键帧时间轴
 *
 * 关键帧的编辑面从"表格"换成"时间轴"：横轴是这条 clip 的帧区间，关键帧是轴上的菱形，
 * 播放头显示预览当前帧。点轴上任意位置 = 把预览跳到那一帧（`onSeekFrame`），
 * 点菱形 = 选中该关键帧 + 同样把预览跳到它所在帧。
 *
 * <h2>为什么不是"表格换个皮肤"</h2>
 * 表格能表达"第几帧有哪些值"，但表达不了"这些帧在时间上的疏密"，也做不到
 * "我看到的这一帧离下一个关键帧还有多远"。而调动画时人真正在意的是后者——
 * 用户点一下轴、预览立刻跳到那一帧，才是"所见即所得"。
 *
 * <h2>帧号的两套坐标（最容易搞错的一处）</h2>
 * 关键帧的 `f` 是 **clip 内的 local 帧**（且被 `timeScale` 缩放过的），
 * 预览的帧号是 **记录内的绝对帧**。两者换算：
 * <pre>
 *   local   = (record - startFrame) × timeScale     // 求值端 project() 就是这么算的
 *   record  = startFrame + local ÷ timeScale
 * </pre>
 * 轴上一律画 local 帧（关键帧就长在它自己的坐标里），只有"请求预览跳帧"时才换成绝对帧。
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

import type { AnimationClip, Keyframe, TransformState } from "../animation/animationTypes";
import { timeScaleOf } from "../animation/animationTypes";
import { EASING_LABELS, EASING_NAMES } from "../animation/easings";
import {
  addKeyframeAt,
  removeKeyframe,
  sortKeyframes,
  withKeyframeMeta,
  withKeyframeValue,
} from "../animation/clipEditing";

/** 关键帧可编辑的通道（顺序 = 检查器里的顺序） */
export const KEYFRAME_CHANNELS: (keyof TransformState)[] = [
  "x",
  "y",
  "scale",
  "rotate",
  "alpha",
];

/** 挂轴上的刻度数（含首尾） */
const TICK_COUNT = 5;

/**
 * 指针横坐标 → 轴上的 local 帧号（四舍五入并夹在 [0, duration]）。
 *
 * @param clientX 指针的视口坐标
 * @param rect 标尺的视口矩形（jsdom 里高度/宽度可能是 0，调用方要兜住）
 * @param durationFrames clip 的时长（帧）
 */
export function localFrameAt(
  clientX: number,
  rect: { left: number; width: number },
  durationFrames: number,
): number {
  const duration = Math.max(0, Math.round(durationFrames || 0));
  if (!(rect.width > 0) || duration <= 0) return 0;
  const ratio = (clientX - rect.left) / rect.width;
  const frame = Math.round(ratio * duration);
  return Math.min(duration, Math.max(0, frame));
}

/** clip 内 local 帧 → 记录绝对帧（关键帧的 `f` 是 local 帧，含 timeScale） */
export function recordFrameOfLocal(clip: AnimationClip, localFrame: number): number {
  const start = clip.startFrame ?? 0;
  const scale = timeScaleOf(clip);
  return Math.round(start + localFrame / scale);
}

/** 记录绝对帧 → clip 内 local 帧（负数表示这一帧还在 clip 开始之前） */
export function localOfRecordFrame(clip: AnimationClip, recordFrame: number): number {
  const start = clip.startFrame ?? 0;
  return (recordFrame - start) * timeScaleOf(clip);
}

export interface KeyframeTimelineProps {
  /** 当前 clip（必须是 keyframes 类型；预设 clip 没有关键帧） */
  clip: AnimationClip;
  /** 无障碍标签用的名字（角色名 / 图片名） */
  elementLabel: string;
  /** 预览当前帧（记录绝对帧）；null / undefined = 预览没停在某一帧上 */
  currentFrame?: number | null;
  /** 请求预览跳到某个记录帧；不传 = 只编辑不跳转 */
  onSeekFrame?: (recordFrame: number) => void;
  /**
   * 一句台词本身的长度（`max(语音时长, 文字时长)` 帧）。
   *
   * <p>时间轴"应该"有多长就是它：动画要盖住整句话，短了后面半句没动画、长了拖到静默里。
   * 给了这个值时，轴长与它不一致会在下方提示并给一个"对齐"按钮。
   */
  lineFrames?: number;
  /** 写回修改后的 clip */
  onChange: (next: AnimationClip) => void;
}

/**
 * 关键帧时间轴 + 选中帧的检查器。
 *
 * <p>选中态用**帧号**而不是下标：改帧号后 `withKeyframeMeta` 会重排数组，
 * 用下标会让"选中的那一帧"跳到别的帧上；帧号在重排后仍然指向同一个关键帧。
 */
const KeyframeTimeline: React.FC<KeyframeTimelineProps> = ({
  clip,
  elementLabel,
  currentFrame,
  onSeekFrame,
  lineFrames,
  onChange,
}) => {
  const keys = sortKeyframes(clip.keys ?? []);
  const duration = Math.max(1, Math.round(clip.durationFrames ?? 0));

  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);

  // 换 clip（同一个元素上有多条动画）时清掉选中态
  useEffect(() => {
    setSelectedFrame(null);
  }, [clip.id]);

  const selectedIndex = selectedFrame === null ? -1 : keys.findIndex((key) => key.f === selectedFrame);
  const selectedKey: Keyframe | null = selectedIndex >= 0 ? keys[selectedIndex] : null;

  const percentOf = useCallback(
    (localFrame: number) => `${(Math.min(duration, Math.max(0, localFrame)) / duration) * 100}%`,
    [duration],
  );

  /** 轴上的播放头：预览当前帧落在本 clip 里时才画 */
  const playheadLocal =
    typeof currentFrame === "number" && Number.isFinite(currentFrame)
      ? localOfRecordFrame(clip, currentFrame)
      : null;
  const playheadVisible =
    playheadLocal !== null && playheadLocal >= 0 && playheadLocal <= duration;

  const seek = useCallback(
    (localFrame: number) => {
      onSeekFrame?.(recordFrameOfLocal(clip, localFrame));
    },
    [clip, onSeekFrame],
  );

  const handleRulerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = rulerRef.current?.getBoundingClientRect();
    const local = rect
      ? localFrameAt(event.clientX, rect, duration)
      : localFrameAt(0, { left: 0, width: 1 }, duration);
    seek(local);
  };

  /** 在播放头所在帧加关键帧；播放头不在本 clip 里时退回"末尾 + 10" */
  const handleAdd = () => {
    const at = playheadVisible && playheadLocal !== null ? Math.round(playheadLocal) : undefined;
    const next = addKeyframeAt(clip, at);
    onChange(next);
    const keys = sortKeyframes(next.keys ?? []);
    const target = keys.find((key) => key.f === (at ?? keys[keys.length - 1]?.f));
    if (target) setSelectedFrame(target.f);
  };

  return (
    <div
      className="keyframe-timeline"
      role="group"
      aria-label={`${elementLabel} 关键帧时间轴`}
      style={{ marginTop: 6 }}
    >
      <div
        ref={rulerRef}
        className="keyframe-ruler"
        aria-label={`${elementLabel} 时间轴标尺`}
        title="点击定位到这一帧（预览会跳到该帧）"
        onClick={handleRulerClick}
        style={{
          position: "relative",
          height: 34,
          marginTop: 2,
          borderRadius: 4,
          background: "#1b1b1b",
          border: "1px solid #444",
          cursor: "crosshair",
          userSelect: "none",
        }}
      >
        {/* 刻度：首尾 + 三等分 */}
        {Array.from({ length: TICK_COUNT }, (_, index) => {
          const value = Math.round((duration * index) / (TICK_COUNT - 1));
          return (
            <span
              key={`tick-${index}`}
              className="keyframe-tick"
              style={{
                position: "absolute",
                left: `${(index / (TICK_COUNT - 1)) * 100}%`,
                top: 0,
                bottom: 0,
                borderLeft: index === 0 ? "none" : "1px dashed #3a3a3a",
                paddingLeft: index === 0 ? 4 : 4,
                fontSize: 10,
                color: "#8a8a8a",
                pointerEvents: "none",
                transform: index === TICK_COUNT - 1 ? "translateX(-100%)" : undefined,
              }}
            >
              {value}
            </span>
          );
        })}

        {/* 关键帧菱形 */}
        {keys.map((key, index) => (
          <button
            key={`key-${key.f}-${index}`}
            type="button"
            className="keyframe-marker"
            aria-label={`${elementLabel} 关键帧 ${index + 1} 第 ${key.f} 帧`}
            title={`第 ${key.f} 帧：点击选中并把预览跳到这一帧`}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedFrame(key.f);
              seek(key.f);
            }}
            style={{
              position: "absolute",
              left: percentOf(key.f),
              top: "50%",
              transform: "translate(-50%, -50%)",
              padding: 0,
              width: 16,
              height: 16,
              lineHeight: "16px",
              fontSize: 11,
              color: key.f === selectedFrame ? "#ffd166" : "#9ad1ff",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            ◆
          </button>
        ))}

        {/* 播放头 */}
        {playheadVisible && (
          <div
            className="keyframe-playhead"
            data-testid="keyframe-playhead"
            style={{
              position: "absolute",
              left: percentOf(playheadLocal as number),
              top: 0,
              bottom: 0,
              width: 2,
              background: "#ff5c5c",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      <div className="char-row" style={{ gap: 6, marginTop: 4 }}>
        <button type="button" onClick={handleAdd}>
          ＋ 加关键帧
        </button>
        <span className="global-hint" style={{ marginTop: 0 }}>
          共 {keys.length} 帧 / 时长 {duration} 帧
          {playheadVisible ? "（加点会落在播放头）" : ""}
        </span>
      </div>

      {/* 轴长应当 = 这句话本身的长度（语音/文字二选一，取长的） */}
      {typeof lineFrames === "number" && lineFrames > 0 && (
        <div className="char-row" style={{ gap: 6, marginTop: 2 }}>
          <span className="global-hint" style={{ marginTop: 0 }}>
            台词长度 {lineFrames} 帧（max(语音, 文字)）
          </span>
          {lineFrames !== duration && (
            <button
              type="button"
              title="把动画时长对齐到这句台词的长度"
              onClick={() => onChange({ ...clip, durationFrames: lineFrames })}
            >
              对齐到 {lineFrames} 帧
            </button>
          )}
        </div>
      )}

      {selectedKey ? (
        <div className="keyframe-inspector" style={{ marginTop: 4, fontSize: 12 }}>
          <div className="char-row" style={{ gap: 6 }}>
            <span className="char-label-fixed">帧号</span>
            <input
              type="number"
              min={0}
              max={duration}
              value={selectedKey.f}
              aria-label={`${elementLabel} 关键帧 ${selectedIndex + 1} 帧号`}
              style={{ width: 64 }}
              onChange={(e) => {
                const next = Math.max(0, Math.round(Number(e.target.value) || 0));
                setSelectedFrame(next);
                onChange(withKeyframeMeta(clip, selectedIndex, { f: next }));
              }}
            />
            <span className="char-label-fixed">缓动</span>
            <select
              value={selectedKey.ease ?? "easeInOut"}
              aria-label={`${elementLabel} 关键帧 ${selectedIndex + 1} 缓动`}
              onChange={(e) =>
                onChange(
                  withKeyframeMeta(clip, selectedIndex, {
                    ease: e.target.value as Keyframe["ease"],
                  }),
                )
              }
            >
              {EASING_NAMES.map((name) => (
                <option key={name} value={name}>
                  {EASING_LABELS[name]}
                </option>
              ))}
            </select>
            <button
              type="button"
              title="删除这一帧"
              aria-label={`${elementLabel} 关键帧 ${selectedIndex + 1} 删除`}
              onClick={() => {
                onChange(removeKeyframe(clip, selectedIndex));
                setSelectedFrame(null);
              }}
            >
              ✕
            </button>
          </div>

          {KEYFRAME_CHANNELS.map((channel) => (
            <div className="char-row" key={channel} style={{ gap: 6 }}>
              <span className="char-label-fixed">{channel}</span>
              <input
                type="number"
                value={selectedKey.v?.[channel] ?? ""}
                placeholder="—"
                aria-label={`${elementLabel} 关键帧 ${selectedIndex + 1} ${channel}`}
                style={{ width: 72 }}
                onChange={(e) => {
                  const raw = e.target.value;
                  onChange(
                    withKeyframeValue(
                      clip,
                      selectedIndex,
                      channel,
                      raw === "" ? null : Number(raw),
                    ),
                  );
                }}
              />
            </div>
          ))}
          <div className="global-hint">
            空着的通道表示"这一帧不写它"，沿用前后的插值；菱形颜色金黄色 = 当前选中。
          </div>
        </div>
      ) : (
        <div className="global-hint">点轴上的菱形选中一帧，或用 ▶ 播到某一帧后点「＋ 加关键帧」。</div>
      )}
    </div>
  );
};

export default KeyframeTimeline;
