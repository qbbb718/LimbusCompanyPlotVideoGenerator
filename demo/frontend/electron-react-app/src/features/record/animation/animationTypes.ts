/**
 * @module 立绘动画求值内核（前端）
 *
 * 类型与常量：与后端 `com.lbc_plot.render.video.anim` 包一一对应。
 *
 * 这套内核存在的唯一理由：**预览与成片必须是同一个函数算出来的**。
 * 预览走浏览器 DOM，成片走 Java2D 逐帧，两条路径无法互测；能保证一致的办法只有
 * "同一份输入、同一份纯函数、同一份夹具"（见 `demo/src/test/resources/animation-fixtures.json`）。
 *
 * 因此本模块禁止：读 `Date.now()`、读 `Math.random()`、读 `devicePixelRatio`、
 * 依赖任何 React 状态。它必须能在 Node 里被单测直接调用。
 */

/** 动画通道：所有效果最终都归到这五个量上 */
export type AnimChannel = "x" | "y" | "scale" | "rotate" | "alpha";

/** 通道合成方式；缺省由通道决定（位移旋转加法、缩放透明度乘法） */
export type BlendMode = "add" | "mul" | "replace";

/** 循环模式 */
export type LoopMode = "once" | "loop" | "pingpong" | "hold";

/** 缓动曲线：与摄像机（cameraView.easeProgress）同一组，另加 step */
export type EasingName = "linear" | "easeIn" | "easeOut" | "easeInOut" | "step";

/** 一次播放播完后的收尾方式 */
export type OnEndMode = "reset" | "hold";

/** 程序化预设 id */
export type PresetId = "bounce" | "shake" | "breathe" | "sway" | "blink" | "pulse";

/** 一帧的变换结果（相对静态姿态的增量） */
export interface TransformState {
  /** 世界像素位移（+ 向右） */
  x: number;
  /** 世界像素位移（+ 向下） */
  y: number;
  /** 缩放乘子（1 = 原样） */
  scale: number;
  /** 旋转角度（度，顺时针为正） */
  rotate: number;
  /** 不透明度乘子（1 = 不透明） */
  alpha: number;
}

/** 一个关键帧：`f` 是相对 clip 起点的帧号，`v` 只写需要变化的通道 */
export interface Keyframe {
  f: number;
  v: Partial<TransformState>;
  /** 本段（本帧 → 下一帧）的缓动；缺省 linear */
  ease?: EasingName;
  /** 等价于 ease = "step" */
  hold?: boolean;
}

/**
 * 一条动画片段。
 *
 * 单类 + `kind` 判别，不做联合类型/多态：旧版本软件读到不认识的 kind 时，最坏结果是
 * "这条 clip 不生效"，而不是整份工程打不开。
 */
export interface AnimationClip {
  /** 稳定 id（编辑器选中 / 删除 / 撤销用） */
  id: string;
  kind: "preset" | "keyframes";
  /** 缺省 true */
  enabled?: boolean;

  /* 时间（单位一律是帧 @30fps） */
  /** 延迟启动（相对记录开头），缺省 0 */
  startFrame?: number;
  /** 提前结束（绝对帧号）；缺省 = 跟记录结束。显式设置时不参与时长计算 */
  endFrame?: number | null;
  /** 单次播放长度（帧） */
  durationFrames: number;
  /** 缺省 once */
  loop?: LoopMode;
  /** 循环次数；缺省 = 无限（仅 loop / pingpong 有意义） */
  iterations?: number | null;
  /** 速度倍率（影响成片，不只是预览）；缺省 1 */
  timeScale?: number | null;

  /* 预设 */
  preset?: PresetId | string;
  params?: Record<string, number | string | boolean>;

  /* 关键帧 */
  channels?: AnimChannel[];
  keys?: Keyframe[];

  /* 通用 */
  blend?: BlendMode;
  priority?: number;
  /** 入场权重包络帧数，缺省 0 */
  fadeInFrames?: number;
  /** 出场权重包络帧数，缺省 0；loop 模式必须为 0 */
  fadeOutFrames?: number;
  /** 缺省 reset */
  onEnd?: OnEndMode;

  /* 预设来源（套用时写入，只读展示） */
  sourcePresetId?: string;
  sourcePresetVersion?: number;
}

/** 挂在**一个**立绘 / 临时图片身上的整套动画 */
export interface SpriteAnimation {
  version?: number;
  /** 时间基准：fps 是契约断言（全项目恒 30），不是配置项 */
  timebase?: { unit: string; fps: number };
  /** 缺省 true */
  enabled?: boolean;
  /** 锚点（0~1）；缺省按元素类型取（立绘脚底 / 图片中心） */
  anchor?: { x: number; y: number };
  clips: AnimationClip[];
}

/**
 * 情绪动画（序列帧）：挂在**一个立绘**身上的帧序列特效。
 *
 * <p>与 {@link SpriteAnimation} 正交：`anim` 决定立绘"怎么动"，本类型决定"脸上额外画一段动画"。
 * 后者是前者的子级，会跟着立绘一起位移/旋转/缩放。
 *
 * <p><b>时序是内联快照</b>：`frameHolds` 存的是"每张图占几帧"，从素材复制过来之后就与素材脱钩
 * （改素材不会回溯老工程，这是刻意的：画面稳定性优先）。理由与预设套用=内联快照完全一致，
 * 见 `presetFile.ts` 的说明。
 *
 * <p>与后端 `com.lbc_plot.render.video.anim.EmotionAnim` 一一对应。
 */
export interface EmotionAnim {
  version?: number;
  /** 素材 id（决定帧图目录） */
  clipId: string;
  /** 素材显示名（快照；素材缺失时靠它提示"丢了哪个动画"） */
  name?: string;
  /** 素材画布宽（快照；决定绘制尺寸） */
  canvasWidth: number;
  /** 素材画布高（快照） */
  canvasHeight: number;
  /** 每帧持续帧数（快照，时序的唯一权威） */
  frameHolds: number[];
  /** once / hold / loop / pingpong；缺省 once */
  loop?: LoopMode;
  /** 循环次数；缺省 / null = 无限（仅 loop / pingpong 有意义） */
  iterations?: number | null;
  /** 延迟启动（帧，相对记录开头） */
  startFrame?: number;
  /**
   * 相对脸框中心的水平偏移，单位 = **头宽**（1.0 = 一个头宽，见 {@link EmotionPlacement}）。
   *
   * <p>挂上素材时由 `emotionAnimFromAsset` 照抄素材的 poster；剧情编辑页允许对**这一条记录**
   * 再微调（「立绘 → 情绪动画 → 摆放」），改的只是本记录的快照，素材本身不受影响。
   */
  offsetX?: number;
  /** 相对脸框中心的垂直偏移（单位：头宽，+ 向下） */
  offsetY?: number;
  /**
   * 素材整体缩放倍率（1 = 原始像素）。
   *
   * <p>与 `offsetX/offsetY` 同属"摆放"：可以从素材带来，也可以被剧情编辑页按记录微调。
   */
  scale?: number;
  /** 淡入帧数（序列局部时间） */
  fadeInFrames?: number;
  /** 淡出帧数；loop / pingpong 下会被强制视为 0 */
  fadeOutFrames?: number;
  /** 整体不透明度乘子（1 = 不透明） */
  opacity?: number;
  /** 代表帧：静止预览（栅格图）显示第几张；缺省 0 */
  posterFrame?: number;
}

/** 情绪动画是否可用（有素材 id + 有帧）。不可用就完全跳过，保证没挂动画的记录逐像素不变 */
export function isEmotionAnimUsable(anim: EmotionAnim | null | undefined): boolean {
  return (
    !!anim &&
    typeof anim.clipId === "string" &&
    anim.clipId.trim() !== "" &&
    Array.isArray(anim.frameHolds) &&
    anim.frameHolds.length > 0
  );
}

/**
 * 情绪动画的**摆放**：画在哪、多大。
 *
 * <p>它是 {@link EmotionAnim} 的一个子集，单独抽出来是因为摆放有**两个来源**：
 * 素材上的 `poster`（作者在「资源管理 → 序列帧动画」里对着脸调好的原始摆放）和
 * 记录里的 `offsetX / offsetY / scale`（这条记录此刻用的摆放）。剧情编辑页允许就地微调
 * 后者，于是"这条记录有没有动过摆放"就退化成两个摆放的一次比较
 * （{@link isSamePlacement}；与素材对账在 `animationClipAsset.isPlacementInSync`）。
 */
export interface EmotionPlacement {
  /** 相对脸框中心的水平偏移，单位 = 头宽（1.0 = 一个头宽） */
  offsetX: number;
  /** 相对脸框中心的垂直偏移（+ 向下），单位 = 头宽 */
  offsetY: number;
  /** 素材缩放倍率（1 = 原始像素） */
  scale: number;
}

/**
 * 摆放的取值范围：与 `projectFile.normalizeEmotionAnim` 的夹取边界、
 * 「资源管理 → 序列帧动画」预览（拖动夹 ±20、滚轮夹 0.01~20）保持一致。
 * 三处只需一个**下限/上限口径**，UI 的滑杆再在这个范围内选一段好用的区间。
 */
export const EMOTION_OFFSET_LIMIT = 20;
export const EMOTION_SCALE_MIN = 0.01;
export const EMOTION_SCALE_MAX = 20;

/** 摆放等价判据的容差：与 {@link isSequenceInSync} 用的同一套（1e-6，远小于一个输出像素） */
export const PLACEMENT_EPSILON = 1e-6;

/** 摆放的缺省值：贴脸框中心、素材原始尺寸（素材没有 poster / 手写工程缺字段时用它兜底） */
export function defaultEmotionPlacement(): EmotionPlacement {
  return { offsetX: 0, offsetY: 0, scale: 1 };
}

/**
 * 从记录（或素材的 poster）里读摆放。
 *
 * <p>兜底口径与后端 `EmotionAnim.safeScale()` / `Poster.safeOffsetX()` 一致：
 * 非数字按 0（缩放按 1），非正缩放按 1。**不做上下限夹取**——夹取发生在归一化
 * （`projectFile.normalizeEmotionAnim`）与写回时，这里只回答"现在画在哪"。
 *
 * @param source 带 offsetX / offsetY / scale 的对象（记录里的 EmotionAnim 或素材的 poster）
 */
export function emotionPlacementOf(
  source:
    | Partial<Pick<EmotionAnim, "offsetX" | "offsetY" | "scale">>
    | null
    | undefined,
): EmotionPlacement {
  const offsetX = source?.offsetX;
  const offsetY = source?.offsetY;
  const scale = source?.scale;
  return {
    offsetX: typeof offsetX === "number" && Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: typeof offsetY === "number" && Number.isFinite(offsetY) ? offsetY : 0,
    scale: typeof scale === "number" && Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
}

/**
 * 两份摆放是否等价。
 *
 * <p>用途：判断"这条记录改过摆放吗"（决定「还原」按钮是否可点、要不要提示已微调）。
 * 用容差而不是 `===`：滑杆/素材的浮点尾数（0.25000000000000006）不该算成一次改动。
 */
export function isSamePlacement(
  a: EmotionPlacement,
  b: EmotionPlacement,
  epsilon: number = PLACEMENT_EPSILON,
): boolean {
  return (
    Math.abs(a.offsetX - b.offsetX) <= epsilon &&
    Math.abs(a.offsetY - b.offsetY) <= epsilon &&
    Math.abs(a.scale - b.scale) <= epsilon
  );
}

/** 项目帧率（与 ProjectConfig.FRAME_RATE、useCameraPlayback.FRAME_RATE 一致） */
export const ANIMATION_FPS = 30;

/** 数据版本 */
export const ANIMATION_VERSION = 1;

/** 全部通道（顺序稳定，便于遍历与测试） */
export const ANIMATION_CHANNELS: AnimChannel[] = ["x", "y", "scale", "rotate", "alpha"];

/** 恒等变换：不动、不缩放、不旋转、不透明 */
export function identityTransform(): TransformState {
  return { x: 0, y: 0, scale: 1, rotate: 0, alpha: 1 };
}

/** 通道的恒等值（缩放/透明度是 1，其余是 0） */
export function defaultValueOf(channel: AnimChannel): number {
  return channel === "scale" || channel === "alpha" ? 1 : 0;
}

/**
 * 是否等于恒等变换（容差与后端 `TransformState.isIdentity` 一致）。
 *
 * 渲染端靠它判断"这一帧完全不用动"——所以容差要能吃掉浮点插值噪声（1e-15 级），
 * 同时小到肉眼不可见（0.01 世界像素）。
 */
export function isIdentityTransform(state: TransformState): boolean {
  return (
    Math.abs(state.x) < 0.01 &&
    Math.abs(state.y) < 0.01 &&
    Math.abs(state.scale - 1) < 1e-4 &&
    Math.abs(state.rotate) < 1e-4 &&
    Math.abs(state.alpha - 1) < 1e-4
  );
}

/** clip 是否启用（缺省视为启用） */
export function isClipEnabled(clip: AnimationClip): boolean {
  return clip.enabled !== false;
}

/** 整套动画是否启用 */
export function isAnimationEnabled(anim: SpriteAnimation | null | undefined): boolean {
  return !!anim && anim.enabled !== false;
}

/** 读一个数字参数；缺失/非法回落到默认值（与后端 paramDouble 同语义） */
export function paramNumber(
  clip: AnimationClip,
  key: string,
  fallback: number,
): number {
  const raw = clip.params ? clip.params[key] : undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** 读一个字符串参数（如 shake 的 style）；空缺省回落到 fallback */
export function paramString(
  clip: AnimationClip,
  key: string,
  fallback: string,
): string {
  const raw = clip.params ? clip.params[key] : undefined;
  if (raw === undefined || raw === null) return fallback;
  const text = String(raw).trim();
  return text === "" ? fallback : text;
}

/** clip 的时间倍率（非法值按 1 处理） */
export function timeScaleOf(clip: AnimationClip): number {
  const raw = clip.timeScale;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 1;
}
