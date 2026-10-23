/**
 * @module 立绘动画 - 预设参数元数据与 clip 编辑
 *
 * 参数元数据（标签/单位/范围/步长）是"自动生成表单"的唯一来源：新增预设时只在这里加一条，
 * UI 不需要改。**默认值必须与后端 `PresetRegistry` 里的 fallback 一致**，否则
 * "表单显示 24、实际算 18"这种错位会让人查半天。
 *
 * 本模块全部是纯函数（不改入参，返回新对象）：React 状态、撤销栈、以及"套用预设"都靠它。
 */
import type {
  AnimationClip,
  Keyframe,
  PresetId,
  TransformState,
} from "./animationTypes";
import { ANIMATION_VERSION, ANIMATION_FPS } from "./animationTypes";
import { PRESET_CHANNELS, PRESET_LABELS } from "./presetRegistry";

/** 一个可调参数的界面元数据 */
export interface PresetParamMeta {
  key: string;
  label: string;
  /** 单位（用于输入框后缀与提示） */
  unit: string;
  default: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
}

/** 预设 → 可调参数（**只放数字参数**：字符串类参数如 shake.style 固定写死在预设里） */
export const PRESET_PARAMS: Record<PresetId, PresetParamMeta[]> = {
  bounce: [
    { key: "amplitude", label: "幅度", unit: "px", default: 24, min: 0, max: 200, step: 1 },
    { key: "periodFrames", label: "周期", unit: "帧", default: 18, min: 4, max: 120, step: 1 },
    { key: "iterations", label: "弹跳次数", unit: "次", default: 2, min: 0, max: 20, step: 1,
      hint: "0 = 一直弹" },
    { key: "decay", label: "衰减", unit: "", default: 0.55, min: 0.1, max: 0.95, step: 0.05 },
    { key: "stretch", label: "顶点拉伸", unit: "", default: 0, min: 0, max: 0.3, step: 0.01 },
  ],
  shake: [
    { key: "amplitude", label: "幅度", unit: "px", default: 6, min: 0, max: 80, step: 1 },
    { key: "periodFrames", label: "每几帧换向", unit: "帧", default: 2, min: 1, max: 12, step: 1,
      hint: "越小越抖，2 帧左右最像发抖" },
    { key: "rotateAmplitude", label: "额外旋转", unit: "°", default: 0, min: 0, max: 10, step: 0.5,
      hint: "旋转要每帧重采样，比纯平移慢" },
  ],
  breathe: [
    { key: "amplitude", label: "幅度", unit: "", default: 0.025, min: 0, max: 0.2, step: 0.005 },
    { key: "periodFrames", label: "周期", unit: "帧", default: 120, min: 10, max: 300, step: 5 },
  ],
  sway: [
    { key: "angle", label: "角度", unit: "°", default: 2.5, min: 0, max: 15, step: 0.5 },
    { key: "periodFrames", label: "周期", unit: "帧", default: 90, min: 10, max: 300, step: 5 },
  ],
  blink: [
    { key: "min", label: "最暗不透明度", unit: "", default: 0.35, min: 0, max: 1, step: 0.05 },
    { key: "periodFrames", label: "周期", unit: "帧", default: 24, min: 2, max: 120, step: 1 },
    { key: "duty", label: "暗的时间占比", unit: "", default: 0.5, min: 0.05, max: 0.95, step: 0.05 },
  ],
  pulse: [
    { key: "peak", label: "峰值缩放", unit: "×", default: 1.12, min: 1, max: 2, step: 0.02 },
    { key: "periodFrames", label: "周期", unit: "帧", default: 18, min: 2, max: 120, step: 1 },
  ],
};

/** 新建 clip 的默认时长（帧） */
export const DEFAULT_CLIP_FRAMES = 60;

/** 默认采样帧（关键帧表格初始化用）：0 / 中段 / 末尾 */
const KEYFRAME_TEMPLATE: { f: number; v: Partial<TransformState> }[] = [
  { f: 0, v: { x: 0, y: 0 } },
  { f: 30, v: { x: 0, y: -80 } },
  { f: 60, v: { x: 0, y: 0 } },
];

let clipIdCounter = 0;

/** 生成稳定唯一的 clip id（只用于 React key / 撤销 / 选中，不参与求值） */
export function newClipId(prefix: string): string {
  clipIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${clipIdCounter}`;
}

/** 把一个预设套成一条新 clip（参数取元数据默认值） */
export function createPresetClip(
  preset: PresetId,
  options: { durationFrames?: number; startFrame?: number } = {},
): AnimationClip {
  const params: Record<string, number> = {};
  for (const meta of PRESET_PARAMS[preset]) {
    params[meta.key] = meta.default;
  }
  return {
    id: newClipId(preset),
    kind: "preset",
    preset,
    durationFrames: options.durationFrames ?? DEFAULT_CLIP_FRAMES,
    startFrame: options.startFrame ?? 0,
    loop: "once",
    // once + reset 时给 6 帧淡出，避免"播完啪一下弹回原位"（见文档 §3.5）
    fadeOutFrames: 6,
    onEnd: "reset",
    params,
  };
}

/** 新建一条关键帧 clip（三条关键帧：起 / 中 / 回原位） */
export function createKeyframeClip(durationFrames: number = DEFAULT_CLIP_FRAMES): AnimationClip {
  return {
    id: newClipId("keyframes"),
    kind: "keyframes",
    durationFrames,
    startFrame: 0,
    loop: "once",
    onEnd: "reset",
    fadeOutFrames: 6,
    channels: ["x", "y"],
    keys: KEYFRAME_TEMPLATE.filter((key) => key.f <= durationFrames).map((key) => ({
      f: key.f,
      v: { ...key.v },
      ease: "easeInOut" as const,
    })),
  };
}

/** 改一个预设参数（不改入参） */
export function withClipParam(clip: AnimationClip, key: string, value: number): AnimationClip {
  return { ...clip, params: { ...(clip.params ?? {}), [key]: value } };
}

/** 改 clip 的通用字段（时长/延迟/循环/淡入淡出等） */
export function withClipField(
  clip: AnimationClip,
  patch: Partial<AnimationClip>,
): AnimationClip {
  return { ...clip, ...patch };
}

/** 关键帧按帧号排序（表格里手动改了帧号后要能自动归位） */
export function sortKeyframes(keys: Keyframe[]): Keyframe[] {
  return [...keys].sort((a, b) => a.f - b.f);
}

/** 改某一关键帧的某个通道值；`value` 为 null 表示"不写这个通道"（沿用上一帧） */
export function withKeyframeValue(
  clip: AnimationClip,
  index: number,
  channel: keyof TransformState,
  value: number | null,
): AnimationClip {
  const keys = [...(clip.keys ?? [])];
  if (index < 0 || index >= keys.length) return clip;
  const next: Partial<TransformState> = { ...(keys[index].v ?? {}) };
  if (value === null || !Number.isFinite(value)) {
    delete next[channel];
  } else {
    next[channel] = value;
  }
  keys[index] = { ...keys[index], v: next };
  return withClipChannels({ ...clip, keys: sortKeyframes(keys) });
}

/** 改某一关键帧的帧号与缓动 */
export function withKeyframeMeta(
  clip: AnimationClip,
  index: number,
  patch: { f?: number; ease?: Keyframe["ease"] },
): AnimationClip {
  const keys = [...(clip.keys ?? [])];
  if (index < 0 || index >= keys.length) return clip;
  const frame = patch.f;
  keys[index] = {
    ...keys[index],
    ...(typeof frame === "number" && Number.isFinite(frame)
      ? { f: Math.max(0, Math.round(frame)) }
      : {}),
    ...(patch.ease ? { ease: patch.ease } : {}),
  };
  return { ...clip, keys: sortKeyframes(keys) };
}

/**
 * 在指定 local 帧插入一个关键帧；不传帧号时等价于"末尾 + 10"。
 *
 * <p>时间轴上"在播放头处加帧"靠的就是这个函数：播放头所在的帧就是要插的位置。
 * 两条约定：
 * 1. 目标帧已经有关键帧 → 原样返回（同一帧加两次没有意义，也不会悄悄改掉现有值）；
 * 2. 新帧的值沿用**插入点之前最近的一帧**（没有就沿用最后一帧），
 *    这样新加的帧不会突然跳到恒等值、把画面拽回原位。
 */
export function addKeyframeAt(clip: AnimationClip, atFrame?: number): AnimationClip {
  const keys = sortKeyframes(clip.keys ?? []);
  const last = keys[keys.length - 1];
  const frame =
    typeof atFrame === "number" && Number.isFinite(atFrame)
      ? Math.max(0, Math.round(atFrame))
      : (last ? last.f : 0) + 10;
  if (keys.some((key) => key.f === frame)) {
    return { ...clip, keys };
  }
  const before = [...keys].reverse().find((key) => key.f <= frame) ?? last;
  const nextKey: Keyframe = {
    f: frame,
    v: { ...(before?.v ?? {}) },
    ease: "easeInOut",
  };
  // 必须排序：在播放头处插帧会落在中间，不排的话关键帧数组就不再按时间有序
  return withClipChannels({ ...clip, keys: sortKeyframes([...keys, nextKey]) });
}

/** 在末尾插入一个关键帧（帧号 = 最后一帧 + 10，值沿用最后一帧） */
export function addKeyframe(clip: AnimationClip): AnimationClip {
  return addKeyframeAt(clip);
}

/** 删除一个关键帧（至少保留一个） */
export function removeKeyframe(clip: AnimationClip, index: number): AnimationClip {
  const keys = sortKeyframes(clip.keys ?? []);
  if (keys.length <= 1 || index < 0 || index >= keys.length) return clip;
  keys.splice(index, 1);
  return withClipChannels({ ...clip, keys });
}

/** 通道列表跟随关键帧里实际出现的通道（用户只填 y 时就不要写 x） */
function withClipChannels(clip: AnimationClip): AnimationClip {
  const used = new Set<string>();
  for (const key of clip.keys ?? []) {
    for (const channel of Object.keys(key.v ?? {})) {
      used.add(channel);
    }
  }
  const channels = (["x", "y", "scale", "rotate", "alpha"] as const).filter((channel) =>
    used.has(channel),
  );
  return { ...clip, channels: channels.length > 0 ? channels : clip.channels };
}

/** 新建整套动画装备（挂在元素上） */
export function createSpriteAnimation(clips: AnimationClip[] = []): {
  version: number;
  timebase: { unit: string; fps: number };
  clips: AnimationClip[];
} {
  return { version: ANIMATION_VERSION, timebase: { unit: "frame", fps: ANIMATION_FPS }, clips };
}

/** 预设的展示名（面板标题用） */
export function presetLabel(preset: PresetId): string {
  return PRESET_LABELS[preset];
}

/** 预设影响的通道（面板里给个"作用在哪"的提示） */
export function presetChannels(preset: PresetId): string[] {
  return PRESET_CHANNELS[preset].slice();
}
