/**
 * @module 情绪动画（序列帧）时序与几何内核（前端）
 *
 * 与后端 `com.lbc_plot.render.video.anim.SequenceTiming` /
 * `EmotionAnimPlacement` **逐行对应**，靠共享夹具
 * `demo/src/test/resources/animation-fixtures.json` 的 `sequenceTiming` /
 * `emotionPlacement` 段对拍（见 `sequenceTiming.test.ts`）。
 *
 * <h2>为什么必须两端各写一份、而不是后端出个接口算</h2>
 * 预览要"实时播放"，每帧都发一次 HTTP 是不可能的（30fps × 上百帧）。
 * 所以位置与帧号必须在前端本地算出来；而一旦两端各算一份，唯一能保证一致的办法
 * 就是"同一份输入、同一份纯函数、同一份夹具"——和立绘移动动画用的是同一套办法。
 *
 * <h2>本模块禁止</h2>
 * 读 `Date.now()` / `Math.random()` / React 状态 / DOM 尺寸。它必须是纯函数，
 * 能在 Node 里被单测直接调用。
 */
import type { LoopMode } from "./animationTypes";

/** 该帧不显示任何图（还没开始 / 已播完 / 没有帧）；与后端 `SequenceTiming.NO_FRAME` 一致 */
export const NO_FRAME = -1;

/** 素材编号的 4 位补零宽度（与后端 `AnimationClipStore.FRAME_NAME_FORMAT` 一致） */
const FRAME_NAME_WIDTH = 4;

/* ==================== 时序 ==================== */

/** 一轮总帧数 = Σ frameHolds；非法值（≤0）按 1 帧算 */
export function totalFrames(frameHolds: readonly number[] | null | undefined): number {
  if (!frameHolds || frameHolds.length === 0) return 0;
  let total = 0;
  for (const hold of frameHolds) {
    total += hold > 0 ? hold : 1;
  }
  return total;
}

/** 帧数（图有几张） */
export function frameCount(frameHolds: readonly number[] | null | undefined): number {
  return frameHolds ? frameHolds.length : 0;
}

/**
 * 求某一轮之内的局部帧号。
 *
 * @returns `[0, totalFrames)`，或 {@link NO_FRAME}
 */
export function localFrame(
  frameHolds: readonly number[] | null | undefined,
  loop: LoopMode | null | undefined,
  iterations: number | null | undefined,
  startFrame: number,
  frameIndex: number,
): number {
  const length = totalFrames(frameHolds);
  if (length <= 0) return NO_FRAME;
  const t = frameIndex - (startFrame || 0);
  if (t < 0) return NO_FRAME;

  const mode: LoopMode = loop ?? "once";
  const finite = typeof iterations === "number" && Number.isFinite(iterations) ? iterations : 0;

  switch (mode) {
    case "hold":
      return Math.min(t, length - 1);
    case "loop": {
      if (finite > 0 && t >= length * finite) return NO_FRAME;
      return t % length;
    }
    case "pingpong": {
      if (finite > 0 && t >= length * finite) return NO_FRAME;
      const period = length * 2;
      const m = t % period;
      const local = m <= length ? m : period - m;
      // m === length 时两个分支都给 length（越界一帧），夹回最后一帧
      return Math.min(local, length - 1);
    }
    case "once":
    default:
      return t >= length ? NO_FRAME : t;
  }
}

/** 局部帧号 → 第几张图（0 起）；越界返回 {@link NO_FRAME} */
export function frameIndexAt(
  frameHolds: readonly number[] | null | undefined,
  local: number,
): number {
  if (!frameHolds || frameHolds.length === 0 || local < 0) return NO_FRAME;
  let accumulated = 0;
  for (let i = 0; i < frameHolds.length; i += 1) {
    const hold = frameHolds[i] > 0 ? frameHolds[i] : 1;
    accumulated += hold;
    if (local < accumulated) return i;
  }
  return NO_FRAME;
}

/**
 * 透明度包络（含用户设的整体不透明度乘子）。
 *
 * <p>淡出以**最后一帧为 0**：`(len-1-local)/fadeOut`。与 clip 的 `envelope` 口径不同，
 * 理由见后端 `SequenceTiming` 的类注释（那段是唯一权威，别在这里另写一套）。
 * 淡入淡出帧数会被收敛到 `len-1` 以内，所以单帧序列不会永远不可见。
 */
export function alphaAt(
  frameHolds: readonly number[] | null | undefined,
  local: number,
  fadeInFrames: number,
  fadeOutFrames: number,
  opacity: number,
): number {
  const length = totalFrames(frameHolds);
  if (local === NO_FRAME || length <= 0) return 0;
  let weight = 1;
  const fadeIn = Math.min(Math.max(0, fadeInFrames || 0), length - 1);
  const fadeOut = Math.min(Math.max(0, fadeOutFrames || 0), length - 1);
  if (fadeIn > 0) weight *= clamp01(local / fadeIn);
  if (fadeOut > 0) weight *= clamp01((length - 1 - local) / fadeOut);
  const base = Number.isFinite(opacity) ? clamp01(opacity) : 1;
  return clamp01(base * weight);
}

/** 一次求值的结果 */
export interface SequenceSample {
  /** 第几张图（0 起）；{@link NO_FRAME} = 不画 */
  imageIndex: number;
  /** 该帧在一轮里的局部帧号；{@link NO_FRAME} = 不画 */
  localFrame: number;
  /** 最终不透明度 */
  alpha: number;
}

/**
 * 一次求完：这一帧该显示第几张图、多透明。
 *
 * <p>**渲染端与预览端都只调这一个方法**——分散调用 `localFrame` + `frameIndexAt`
 * 很容易漏掉"loop 模式必须把 fadeOut 归零"这条规则，然后循环接缝上一淡一显。
 */
export function sampleSequence(
  frameHolds: readonly number[] | null | undefined,
  loop: LoopMode | null | undefined,
  iterations: number | null | undefined,
  startFrame: number,
  fadeInFrames: number,
  fadeOutFrames: number,
  opacity: number,
  frameIndex: number,
): SequenceSample {
  const local = localFrame(frameHolds, loop, iterations, startFrame, frameIndex);
  if (local === NO_FRAME) {
    return { imageIndex: NO_FRAME, localFrame: NO_FRAME, alpha: 0 };
  }
  const mode: LoopMode = loop ?? "once";
  const looping = mode === "loop" || mode === "pingpong";
  return {
    imageIndex: frameIndexAt(frameHolds, local),
    localFrame: local,
    alpha: alphaAt(frameHolds, local, fadeInFrames, looping ? 0 : fadeOutFrames, opacity),
  };
}

/** 这一帧是否要画（与后端 `SequenceTiming.Sample.visible()` 同语义） */
export function isSampleVisible(sample: SequenceSample): boolean {
  return sample.imageIndex !== NO_FRAME && sample.alpha > 1e-4;
}

/**
 * 代表帧的采样结果：**静止画面**显示的那一帧与它的透明度。
 *
 * <p>与后端 `EmotionAnim.posterImageIndex()` / `posterAlpha()` 逐行对应。
 * 为什么静止时要专门算一次而不是直接用第 0 帧：带淡入的动画第 0 帧是全透明的，
 * 编辑器里会看起来"素材没导入成功"。
 *
 * @param posterFrame 用户挑的代表帧序号（会被夹到 `[0, totalFrames-1]`）
 */
export function posterSample(
  frameHolds: readonly number[] | null | undefined,
  posterFrame: number,
  loop: LoopMode | null | undefined,
  fadeInFrames: number,
  fadeOutFrames: number,
  opacity: number,
): SequenceSample {
  const length = totalFrames(frameHolds);
  if (length <= 0) {
    return { imageIndex: NO_FRAME, localFrame: NO_FRAME, alpha: 0 };
  }
  const requested = Number.isFinite(posterFrame) ? Math.round(posterFrame) : 0;
  const local = Math.min(Math.max(0, requested), length - 1);
  const mode: LoopMode = loop ?? "once";
  const looping = mode === "loop" || mode === "pingpong";
  return {
    imageIndex: frameIndexAt(frameHolds, local),
    localFrame: local,
    alpha: alphaAt(frameHolds, local, fadeInFrames, looping ? 0 : fadeOutFrames, opacity),
  };
}

/* ==================== 几何 ==================== */

/** 与后端一致的矩形（场景画布坐标，可以带小数） */
export interface PlacementRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 脸框中心相对立绘矩形左上角的偏移 = `(face + length/2) · renderScale` */
export function faceOffset(face: number, length: number, renderScale: number): number {
  return (face + length / 2) * renderScale;
}

/**
 * 头部方框在场景里的边长（像素）。
 *
 * <p>立绘的裁剪框 `length` 会被归一化到恒定的 183（`DEFAULT_CHARACTER_HEAD_LENGTH`），
 * 所以头部方框恒为 `length · renderScale = 183 · 用户缩放`——**与角色身高、站位、裁剪框大小无关**。
 * 这就是"相对头部区域"能跨角色复用的根本原因，也是代表帧偏移量的长度单位。
 */
export function headSize(length: number, renderScale: number): number {
  const safeLength = length > 0 ? length : 1;
  const safeScale = Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
  return safeLength * safeScale;
}

/**
 * 情绪动画的绘制矩形（**未套立绘移动动画之前**的场景画布坐标）。
 *
 * <p>素材以画布中心对齐到脸框中心，再叠加偏移与缩放；尺寸乘 `userScale`
 * （用户把立绘放大 2 倍时，贴脸的特效必须跟着变大）。
 *
 * <p><b>偏移的单位是头部长度</b>（见 {@link headSize}）：`offsetY = -0.3` 表示
 * "脸框中心往上 0.3 个头宽"，换任何一个角色都是同一个相对位置。
 *
 * <p>换算成输出坐标由调用方负责（`sceneToOutput`），这里只管场景空间。
 */
export function spriteRect(
  faceCenterX: number,
  faceCenterY: number,
  headSizeValue: number,
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
  userScale: number,
  offsetX: number,
  offsetY: number,
): PlacementRect {
  const safeWidth = Math.max(1, canvasWidth || 0);
  const safeHeight = Math.max(1, canvasHeight || 0);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const safeUserScale = Number.isFinite(userScale) && userScale > 0 ? userScale : 1;
  const head = Number.isFinite(headSizeValue) && headSizeValue > 0 ? headSizeValue : 1;
  const factor = safeScale * safeUserScale;
  const w = safeWidth * factor;
  const h = safeHeight * factor;
  return {
    x: faceCenterX + (Number.isFinite(offsetX) ? offsetX : 0) * head - w / 2,
    y: faceCenterY + (Number.isFinite(offsetY) ? offsetY : 0) * head - h / 2,
    w,
    h,
  };
}

/* ==================== 素材地址 ==================== */

/** 素材帧目录的 HTTP 前缀（与后端 `AnimationClipController` 的 frameBaseUrl 一致） */
export function frameBaseUrl(clipId: string): string {
  return `/assets/animation-clips/${clipId}/frames/`;
}

/** 第 index 张帧图（0 起）的站内路径；文件名从 1 开始补零到 4 位 */
export function frameUrl(clipId: string, index: number): string {
  const fileNumber = Math.max(0, Math.floor(index)) + 1;
  return `${frameBaseUrl(clipId)}${String(fileNumber).padStart(FRAME_NAME_WIDTH, "0")}.png`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
