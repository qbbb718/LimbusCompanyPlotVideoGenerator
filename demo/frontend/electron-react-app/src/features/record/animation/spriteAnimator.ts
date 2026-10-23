/**
 * @module 立绘动画求值内核（前端）
 * 求值入口 —— 与后端 `SpriteAnimator.java` 逐行对应，**纯函数**。
 *
 * 对外只有一个真正的入口：{@link evaluate}。其余导出都是为了编辑器 UI 与单测
 * （`project` 换算时间、`clipChannels` 决定动哪个通道、`isAnimated` 决定要不要走动画路径）。
 *
 * 正确性的唯一保障是共享夹具 `demo/src/test/resources/animation-fixtures.json`：
 * 本文件与后端任何一方改了公式而没更新夹具，对应侧的单测立刻变红。
 */
import {
  ANIMATION_CHANNELS,
  defaultValueOf,
  isAnimationEnabled,
  isClipEnabled,
  paramNumber,
  timeScaleOf,
  type AnimationClip,
  type AnimChannel,
  type BlendMode,
  type LoopMode,
  type PresetId,
  type SpriteAnimation,
  type TransformState,
} from "./animationTypes";
import { composeChannel, defaultBlendOf } from "./channels";
import { interpolateClip } from "./keyframeEngine";
import { evaluatePreset, isPresetId, PRESET_CHANNELS } from "./presetRegistry";

/** 是否是预设 clip（`kind` 缺省时用"有没有 preset 字段"兜底：手写 JSON 常常漏 kind） */
export function isPresetClip(clip: AnimationClip): boolean {
  return clip.kind === "preset" || (!!clip.preset && !clip.kind);
}

/** 解析预设 id；不认识返回 null（调用方跳过这条 clip） */
export function presetIdOf(clip: AnimationClip): PresetId | null {
  return isPresetId(clip.preset) ? clip.preset : null;
}

/** 解析循环模式；不认识按 once（最保守：不会让记录意外变长） */
export function loopModeOf(clip: AnimationClip): LoopMode {
  switch (clip.loop) {
    case "loop":
    case "pingpong":
    case "hold":
      return clip.loop;
    case "once":
    default:
      return "once";
  }
}

/** 是否无限循环（loop/pingpong 且没给 iterations） */
export function isInfiniteLoop(clip: AnimationClip): boolean {
  const mode = loopModeOf(clip);
  if (mode !== "loop" && mode !== "pingpong") return false;
  const iterations = clip.iterations;
  return iterations === undefined || iterations === null || iterations <= 0;
}

/** 指定通道的合成方式：clip.blend 优先，否则用通道默认 */
export function clipBlendFor(clip: AnimationClip, channel: AnimChannel): BlendMode {
  return clip.blend ?? defaultBlendOf(channel);
}

/** 本 clip 影响哪些通道（预设走注册表；关键帧走 channels，缺省从 keys 里推） */
export function clipChannels(clip: AnimationClip): AnimChannel[] {
  if (isPresetClip(clip)) {
    const id = presetIdOf(clip);
    return id ? PRESET_CHANNELS[id].slice() : [];
  }

  const result: AnimChannel[] = [];
  if (Array.isArray(clip.channels)) {
    for (const channel of clip.channels) {
      if (ANIMATION_CHANNELS.indexOf(channel) >= 0 && result.indexOf(channel) < 0) {
        result.push(channel);
      }
    }
  }
  if (result.length === 0 && Array.isArray(clip.keys)) {
    for (const key of clip.keys) {
      if (!key || !key.v) continue;
      for (const channel of ANIMATION_CHANNELS) {
        if (
          typeof key.v[channel] === "number" &&
          Number.isFinite(key.v[channel] as number) &&
          result.indexOf(channel) < 0
        ) {
          result.push(channel);
        }
      }
    }
  }
  return result;
}

/**
 * 把绝对帧号投影成 clip 内的相对帧（null = 这条 clip 在这一帧不生效）。
 *
 * 时间语义与后端一致：
 * - `once` 播完 → 按 `onEnd` 收尾（hold 停在最后一帧 / reset 回恒等）；
 * - `hold` 永远停在最后一帧；`loop` 取模；`pingpong` 三角波。
 */
export function project(clip: AnimationClip, frameIndex: number): number | null {
  const startFrame = clip.startFrame ?? 0;
  if (frameIndex < startFrame) return null;

  const endFrame = clip.endFrame;
  if (typeof endFrame === "number" && Number.isFinite(endFrame) && frameIndex >= endFrame) {
    return null;
  }

  const duration = clip.durationFrames ?? 0;
  if (duration <= 0) return null;

  const local = (frameIndex - startFrame) * timeScaleOf(clip);

  switch (loopModeOf(clip)) {
    case "hold":
      return Math.min(local, duration - 1);
    case "loop":
      return local % duration;
    case "pingpong": {
      const period = duration * 2;
      const m = local % period;
      return m <= duration ? m : period - m;
    }
    case "once":
    default:
      if (local >= duration) {
        return clip.onEnd === "hold" ? duration - 1 : null;
      }
      return local;
  }
}

/**
 * 权重包络：入场/出场各用若干帧把这条 clip 的贡献淡入淡出。
 *
 * 存在的意义是"不硬跳"：once 播完回恒等、endFrame 截断都会在边界产生跳变，有了包络就自然收尾。
 * 注意 `loop` 模式必须把 fadeOut 设为 0，否则循环接缝会一淡一显。
 */
export function envelope(clip: AnimationClip, local: number): number {
  let weight = 1;
  const fadeIn = clip.fadeInFrames ?? 0;
  if (fadeIn > 0) weight *= clamp01(local / fadeIn);
  const fadeOut = clip.fadeOutFrames ?? 0;
  const duration = clip.durationFrames ?? 0;
  if (fadeOut > 0 && duration > 0) {
    weight *= clamp01((duration - local) / fadeOut);
  }
  return clamp01(weight);
}

/** 求某 clip 在相对帧 `local` 的贡献值（不含权重包络） */
export function valueAt(clip: AnimationClip, local: number): TransformState | null {
  if (isPresetClip(clip)) {
    return evaluatePreset(clip, local);
  }
  return interpolateClip(clip, local, clipChannels(clip));
}

/**
 * 求值顺序：按 priority 升序（同级保持数组原序）。
 *
 * 加法/乘法的合成可交换，所以顺序只在 `replace` 上有实际意义：priority 越大越晚算、越可能盖住别人。
 */
export function orderedClips(clips: AnimationClip[]): AnimationClip[] {
  return clips
    .map((clip, index) => ({ clip, index }))
    .sort((a, b) => (a.clip.priority ?? 0) - (b.clip.priority ?? 0) || a.index - b.index)
    .map((entry) => entry.clip);
}

/**
 * 求某元素在第 `frameIndex` 帧的变换。
 *
 * 没有任何动画时返回**恒等变换**，渲染端据此走"完全不经过仿射"的旧路径
 * （这是"旧工程逐像素不变"与"导出耗时不回归"的实现前提）。
 */
export function evaluate(
  anim: SpriteAnimation | null | undefined,
  frameIndex: number,
): TransformState {
  const result: TransformState = { x: 0, y: 0, scale: 1, rotate: 0, alpha: 1 };
  if (!anim || !isAnimationEnabled(anim) || !Array.isArray(anim.clips) || anim.clips.length === 0) {
    return result;
  }

  for (const clip of orderedClips(anim.clips)) {
    if (!clip || !isClipEnabled(clip)) continue;
    const local = project(clip, frameIndex);
    if (local === null) continue;
    const value = valueAt(clip, local);
    if (!value) continue;
    const weight = envelope(clip, local);
    if (weight <= 0) continue;

    for (const channel of clipChannels(clip)) {
      const mode = clipBlendFor(clip, channel);
      result[channel] = composeChannel(mode, result[channel], value[channel], weight);
    }
  }
  return result;
}

/**
 * 这套动画是否"真的会动"。
 *
 * 渲染端据此决定要不要逐帧重画、时长计算据此决定要不要拉长记录，所以判定必须保守：
 * 至少一条启用 + 有时长 + 预设/通道有效的 clip 才算。
 */
export function isAnimated(anim: SpriteAnimation | null | undefined): boolean {
  if (!anim || !isAnimationEnabled(anim) || !Array.isArray(anim.clips) || anim.clips.length === 0) {
    return false;
  }
  for (const clip of anim.clips) {
    if (!clip || !isClipEnabled(clip) || (clip.durationFrames ?? 0) <= 0) continue;
    if (isPresetClip(clip)) {
      if (presetIdOf(clip)) return true;
    } else if (clipChannels(clip).length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * 锚点：没配时用元素类型默认值。
 *
 * @param defaultX 一般传 0.5
 * @param defaultY 立绘传 1（脚底：弹跳/摇摆的自然支点）、临时图片传 0.5（中心）
 */
export function anchorOf(
  anim: SpriteAnimation | null | undefined,
  defaultX: number,
  defaultY: number,
): { x: number; y: number } {
  const anchor = anim ? anim.anchor : undefined;
  const x =
    anchor && Number.isFinite(anchor.x) ? clamp01(anchor.x) : defaultX;
  const y =
    anchor && Number.isFinite(anchor.y) ? clamp01(anchor.y) : defaultY;
  return { x, y };
}

/**
 * 这条 clip 对"记录时长"的贡献（绝对帧号上限）；null = 不参与。
 *
 * 参与规则（与后端 `calculateAnimationDuration` 一致）：
 * - `once` / `hold` → start + duration；
 * - `loop` / `pingpong` 且 iterations 有限 → start + duration × iterations；
 * - 无限循环 → 不参与（语义是"跟着记录一直播"，它不该反过来定义记录长度）；
 * - 显式 `endFrame` → 不参与（用户主动截断，意图明确）。
 */
export function durationEndFrameOf(clip: AnimationClip): number | null {
  if (!clip || !isClipEnabled(clip)) return null;
  if (typeof clip.endFrame === "number" && Number.isFinite(clip.endFrame)) return null;

  const duration = clip.durationFrames ?? 0;
  if (duration <= 0) return null;

  const start = clip.startFrame ?? 0;
  const iterations = clip.iterations;
  const mode = loopModeOf(clip);

  if (mode === "loop" || mode === "pingpong") {
    if (iterations === undefined || iterations === null || iterations <= 0) return null;
    return start + duration * iterations;
  }
  return start + duration;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 通道恒等值的再导出（方便 UI 侧复用，避免各处写死 0/1） */
export { defaultValueOf, paramNumber };
