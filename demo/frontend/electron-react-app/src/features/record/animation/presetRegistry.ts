/**
 * @module 立绘动画求值内核（前端）
 * 六条程序化预设的曲线 —— 与后端 `PresetRegistry.java` 逐行对应。
 *
 * 两条硬约束（加新预设时必须遵守）：
 * 1. `local = 0` 必须返回恒等值，否则用户一加动画画面就"啪"地跳一下；
 *    抖动的 jitter 用"第 −1 次换向 = 0"满足它，弹跳的拉伸用 `|sin|` 而不是 `1 − |sin|`。
 * 2. 只能依赖 `local` 与 `params`：不能读 Date/Math.random，抖动必须走 `hash32`。
 */
import {
  defaultValueOf,
  paramNumber,
  paramString,
  type AnimChannel,
  type AnimationClip,
  type PresetId,
  type TransformState,
} from "./animationTypes";
import { signed } from "./hash32";

const TWO_PI = Math.PI * 2;

/** 每条预设影响哪些通道（决定合成时动谁） */
export const PRESET_CHANNELS: Record<PresetId, AnimChannel[]> = {
  bounce: ["y", "scale"],
  shake: ["x", "y", "rotate"],
  breathe: ["scale"],
  sway: ["rotate"],
  blink: ["alpha"],
  pulse: ["scale"],
};

/** 预设显示名（UI 卡片用） */
export const PRESET_LABELS: Record<PresetId, string> = {
  bounce: "弹跳",
  shake: "发抖",
  breathe: "呼吸",
  sway: "摇摆",
  blink: "闪烁",
  pulse: "缩放脉冲",
};

/** 预设的一句话说明（UI 卡片副标题） */
export const PRESET_HINTS: Record<PresetId, string> = {
  bounce: "向上弹起再落回，可带衰减与拉伸",
  shake: "高频小抖动，适合紧张/恐惧",
  breathe: "缓慢起伏的缩放",
  sway: "绕脚底小幅摇摆",
  blink: "周期性变淡（闪烁/虚影）",
  pulse: "一次放大回弹",
};

/** 全部预设 id（顺序固定，UI 列表按它排） */
export const PRESET_IDS: PresetId[] = [
  "bounce",
  "shake",
  "breathe",
  "sway",
  "blink",
  "pulse",
];

/** 是否是已知预设 id */
export function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PRESET_CHANNELS, value);
}

/** 求某预设在第 `local` 帧的贡献值（其余通道为恒等值） */
export function evaluatePreset(clip: AnimationClip, local: number): TransformState {
  const state: TransformState = { x: 0, y: 0, scale: 1, rotate: 0, alpha: 1 };
  const preset = clip.preset;
  if (!isPresetId(preset)) {
    return state; // 未知预设：恒等，不抛异常（旧版本读新预设时的降级路径）
  }

  switch (preset) {
    case "bounce":
      evaluateBounce(clip, local, state);
      break;
    case "shake":
      evaluateShake(clip, local, state);
      break;
    case "breathe": {
      const amplitude = paramNumber(clip, "amplitude", 0.025);
      const period = Math.max(1, paramNumber(clip, "periodFrames", 120));
      state.scale = 1 + amplitude * Math.sin((TWO_PI * local) / period);
      break;
    }
    case "sway": {
      const angle = paramNumber(clip, "angle", 2.5);
      const period = Math.max(1, paramNumber(clip, "periodFrames", 90));
      state.rotate = angle * Math.sin((TWO_PI * local) / period);
      break;
    }
    case "blink": {
      const min = clamp(paramNumber(clip, "min", 0.35), 0, 1);
      const period = Math.max(2, paramNumber(clip, "periodFrames", 24));
      const duty = clamp(paramNumber(clip, "duty", 0.5), 0.01, 0.99);
      const phase = (((local % period) + period) % period) / period;
      const edge = Math.min(2 / period, duty / 2);
      const weight =
        edge <= 0 ? 1 : clamp01(phase / edge) * clamp01((duty - phase) / edge);
      state.alpha = 1 + (min - 1) * weight;
      break;
    }
    case "pulse": {
      const peak = paramNumber(clip, "peak", 1.12);
      const period = Math.max(1, paramNumber(clip, "periodFrames", 18));
      const q = clamp01(local / period);
      state.scale = 1 + (peak - 1) * Math.sin(Math.PI * q);
      break;
    }
    default:
      break;
  }
  return state;
}

/**
 * 弹跳：`y = −A·|sin(π·s/T)|·decay^k`，k 是第几次弹跳。
 *
 * 用半周期（`π·s/T`）而不是整周期：每次弹跳都是"从地面升起再落回地面"，
 * 落地瞬间速度最大，比整周期和抛物线更像真实弹跳。
 */
function evaluateBounce(clip: AnimationClip, local: number, state: TransformState): void {
  const amplitude = paramNumber(clip, "amplitude", 24);
  const period = Math.max(1, paramNumber(clip, "periodFrames", 18));
  const iterations = Math.round(paramNumber(clip, "iterations", 2));
  const decay = paramNumber(clip, "decay", 0.55);
  const stretch = paramNumber(clip, "stretch", 0);

  const k = Math.floor(local / period);
  if (iterations > 0 && k >= iterations) {
    return; // 弹够次数了：回恒等
  }
  const s = local - k * period;
  const wave = Math.abs(Math.sin((Math.PI * s) / period));
  const envelope = Math.pow(decay, Math.max(0, k));

  state.y = -amplitude * wave * envelope;
  if (stretch !== 0) {
    state.scale = 1 + stretch * wave * envelope;
  }
}

/**
 * 发抖：jitter（默认，每 periodFrames 帧换一个哈希偏移）或 sine（主频正弦）。
 *
 * jitter 默认只做平移：高频平移观感已经很像"发抖"，而旋转要求每帧重采样、慢得多。
 * 需要旋转时给 `rotateAmplitude`。
 */
function evaluateShake(clip: AnimationClip, local: number, state: TransformState): void {
  const amplitude = paramNumber(clip, "amplitude", 6);
  const period = Math.max(1, paramNumber(clip, "periodFrames", 2));
  const rotateAmplitude = paramNumber(clip, "rotateAmplitude", 0);
  const style = paramString(clip, "style", "jitter");

  if (style.toLowerCase() === "sine") {
    const w = (TWO_PI * local) / period;
    state.x = amplitude * Math.sin(w);
    // y 走双倍频半幅：这样 t=0 仍然是恒等
    state.y = amplitude * 0.5 * Math.sin(2 * w);
    if (rotateAmplitude !== 0) {
      state.rotate = rotateAmplitude * Math.sin(w);
    }
    return;
  }

  const seed = Math.round(paramNumber(clip, "seed", 0));
  const step = Math.floor(local / period);
  const fraction = (local - step * period) / period;
  const index = Math.round(step);

  // 第 −1 次换向按 0 处理 → local = 0 处位移为 0（恒等）
  const prevX = index <= 0 ? 0 : signed(seed, index - 1, 0);
  const curX = signed(seed, index, 0);
  state.x = amplitude * (prevX + (curX - prevX) * fraction);

  const prevY = index <= 0 ? 0 : signed(seed, index - 1, 1);
  const curY = signed(seed, index, 1);
  state.y = amplitude * (prevY + (curY - prevY) * fraction);

  if (rotateAmplitude !== 0) {
    const prevR = index <= 0 ? 0 : signed(seed, index - 1, 2);
    const curR = signed(seed, index, 2);
    state.rotate = rotateAmplitude * (prevR + (curR - prevR) * fraction);
  }
}

/** 预设参数的默认值表（UI 表单与"新建 clip"共用；与后端默认值必须一致） */
export const PRESET_PARAM_DEFAULTS: Record<string, number | string> = {
  amplitude: 24,
  periodFrames: 18,
  iterations: 2,
  decay: 0.55,
  stretch: 0,
  angle: 2.5,
  peak: 1.12,
  min: 0.35,
  duty: 0.5,
  style: "jitter",
  rotateAmplitude: 0,
};

/** 取通道的恒等值（转出避免调用方各自写 0/1） */
export function presetDefaultOf(channel: AnimChannel): number {
  return defaultValueOf(channel);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
