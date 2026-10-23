/**
 * @module 立绘动画求值内核（前端）
 * 关键帧分段插值 —— 与后端 `SpriteAnimator.interpolate / channelAt` 逐行对应。
 *
 * 关键约定：
 * - `f` 是**相对 clip 起点**的帧号，绝对帧由 `project()` 先换算好再进来；
 * - 一个关键帧的 `ease` 属于"**以它为起点**的那一段"，不是"到达它"的曲线（写反了曲线会倒着走）；
 * - 逐通道独立插值：用户只填 y 时，x/scale 等通道**沿用上一关键帧**，不会被拽回 0。
 */
import {
  defaultValueOf,
  type AnimationClip,
  type AnimChannel,
  type Keyframe,
  type TransformState,
} from "./animationTypes";
import { easeOfKeyframe } from "./easings";

/**
 * 求某 clip 在相对帧 `local` 的插值结果。
 *
 * @returns 没有任何关键帧时返回 null（调用方跳过这条 clip）
 */
export function interpolateClip(
  clip: AnimationClip,
  local: number,
  channels: AnimChannel[],
): TransformState | null {
  const keys: Keyframe[] = [];
  if (Array.isArray(clip.keys)) {
    for (const key of clip.keys) {
      if (key) keys.push(key);
    }
  }
  if (keys.length === 0) {
    return null;
  }
  // 就地排序会改到记录里的数组，先复制再排（顺序本身不影响结果，但别留下副作用）
  keys.sort((a, b) => a.f - b.f);

  const state: TransformState = { x: 0, y: 0, scale: 1, rotate: 0, alpha: 1 };
  for (const channel of channels) {
    state[channel] = channelValueAt(keys, channel, local);
  }
  return state;
}

/**
 * 单通道的分段插值。
 *
 * 先把每个关键帧的该通道值"前向填充"出来（没写就沿用上一帧），再在区间里按缓动 lerp。
 */
export function channelValueAt(
  keys: Keyframe[],
  channel: AnimChannel,
  local: number,
): number {
  const count = keys.length;
  const values = new Array<number>(count);
  let current = defaultValueOf(channel);
  let defined = false;

  for (let i = 0; i < count; i += 1) {
    const raw = keys[i].v ? keys[i].v[channel] : undefined;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      current = raw;
      defined = true;
    }
    values[i] = current;
  }
  if (!defined) {
    return defaultValueOf(channel);
  }

  const firstFrame = keys[0].f;
  const lastFrame = keys[count - 1].f;
  if (local <= firstFrame) return values[0];
  if (local >= lastFrame) return values[count - 1];

  let segment = 0;
  while (segment < count - 1 && local >= keys[segment + 1].f) {
    segment += 1;
  }
  const from = keys[segment].f;
  const to = keys[segment + 1].f;
  const span = to - from;
  if (span <= 0) {
    return values[segment + 1];
  }
  const progress = easeOfKeyframe(keys[segment])(
    Math.min(1, Math.max(0, (local - from) / span)),
  );
  return values[segment] + (values[segment + 1] - values[segment]) * progress;
}
