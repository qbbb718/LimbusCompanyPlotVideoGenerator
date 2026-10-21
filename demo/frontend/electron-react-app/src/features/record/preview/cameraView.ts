/**
 * @module 摄像机模式 → 视图与镜头运算
 *
 * 摄像机模式下有两套「缩放/平移」很容易搞混，这里把它们彻底分开：
 *
 * | | 作用对象 | 存哪 | 影响成片吗 |
 * | --- | --- | --- | --- |
 * | **镜头 camera** | 取景框在世界里的位置与缩放 | 记录（每条记录一个） | **是** |
 * | **视图 view** | 编辑时怎么看这个世界（缩放 + 平移） | 组件内部状态 | 否 |
 *
 * 所以滚轮改镜头（推拉），Ctrl+滚轮改视图（看近看远），空格拖动平移视图。
 * 所有换算都是纯函数，方便单测；世界边界的夹取复用 previewLayout 的 {@link clampCamera}。
 */
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  MIN_CAMERA_ZOOM,
  MAX_CAMERA_ZOOM,
  backgroundWorldRect,
  clampCamera,
} from "./previewLayout";
import type { BackgroundVisual } from "@types";
import { MAX_BACKGROUND_SCALE } from "../properties/visualCoordinates";
import type {
  ImageSize,
  PreviewRect,
  RecordCamera,
} from "./previewLayout";

/** 视图缩放范围（相对"刚好放下世界"的倍数） */
export const MIN_VIEW_ZOOM = 0.2;
export const MAX_VIEW_ZOOM = 6;

/** 缺省镜头（= 没有摄像机） */
export const IDENTITY_CAMERA: RecordCamera = {
  centerX: DESIGN_WIDTH / 2,
  centerY: DESIGN_HEIGHT / 2,
  zoom: 1,
};

/** 一帧镜头（起点 / 终点的形状；RecordCamera 去掉动画字段之后就是它） */
export type CameraKeyframe = Pick<RecordCamera, "centerX" | "centerY" | "zoom">;

/**
 * 镜头从起点走到终点的**默认时长（帧）**。
 *
 * <p>与后端 Camera.DEFAULT_MOVE_FRAMES 一致。只有在"镜头会动"时才有意义：
 * 24 帧 @30fps = 0.8 秒，比一句台词的时长短，所以摇完会停住等台词播完。
 */
export const DEFAULT_CAMERA_MOVE_FRAMES = 24;

/** 取镜头的移动时长（帧）：缺省 / 非法（<1、小数、NaN）一律回退 24 */
export function cameraMoveFrames(
  camera: RecordCamera | null | undefined,
): number {
  const raw = num(camera?.moveFrames, DEFAULT_CAMERA_MOVE_FRAMES);
  if (!(raw >= 1)) return DEFAULT_CAMERA_MOVE_FRAMES;
  return Math.round(raw);
}

/**
 * 已播/已渲 frameIndex 帧时的镜头进度（0~1）。
 *
 * <p>`moveFrames` 帧内走完：第 0 帧还在起点，第 `moveFrames - 1` 帧到终点，之后**停住**。
 * 后端 RenderOfVideo 用同一个公式（帧序 - 1 的分母也一样），所以预览与成片一致。
 */
export function cameraProgressOf(
  frameIndex: number,
  moveFrames: number | null | undefined,
): number {
  const total = Math.max(1, Math.round(num(moveFrames, DEFAULT_CAMERA_MOVE_FRAMES)));
  if (total <= 1) return frameIndex > 0 ? 1 : 0;
  return clamp(num(frameIndex, 0) / (total - 1), 0, 1);
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
/** 缓动曲线（与后端 Camera.ease 一一对应，改公式要两边一起改） */
export const CAMERA_EASINGS = ["linear", "easeIn", "easeOut", "easeInOut"] as const;
export type CameraEasing = (typeof CAMERA_EASINGS)[number];
/**
 * 新建运镜时的默认缓动：**慢出**。
 *
 * <p>镜头从起点冲到终点再"停住"会显得很生硬；慢出（起速快、收尾慢）最接近常见运镜的习惯，
 * 也是"拖一下就生成终点"时最不容易踩坑的默认值。想要匀速可以在下拉里改回「匀速」。
 */
export const DEFAULT_CAMERA_EASING: CameraEasing = "easeOut";

/**
 * 缓动进度：入参出参都是 0~1。
 *
 * <p>三次曲线（quad 太"软"、sine 起止速度不够）：
 * `easeIn = t³`、`easeOut = 1-(1-t)³`、`easeInOut = t<0.5 ? 4t³ : 1-4(1-t)³`。
 */
export function easeProgress(t: number, easing?: CameraEasing): number {
  const clamped = clamp(num(t, 0), 0, 1);
  switch (easing ?? DEFAULT_CAMERA_EASING) {
    case "easeIn":
      return clamped * clamped * clamped;
    case "easeOut":
      return 1 - Math.pow(1 - clamped, 3);
    case "easeInOut":
      return clamped < 0.5
        ? 4 * clamped * clamped * clamped
        : 1 - 4 * Math.pow(1 - clamped, 3);
    case "linear":
    default:
      return clamped;
  }
}


const normalizeZoom = (value: unknown): number => {
  const raw = num(value, 1);
  return raw > 0 ? clamp(raw, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM) : 1;
};

/** 归一化一帧镜头 */
export function normalizeKeyframe(
  frame: Partial<CameraKeyframe> | null | undefined,
): CameraKeyframe {
  return {
    centerX: num(frame?.centerX, DESIGN_WIDTH / 2),
    centerY: num(frame?.centerY, DESIGN_HEIGHT / 2),
    zoom: normalizeZoom(frame?.zoom),
  };
}

/**
 * 归一化镜头：非数字按缺省，zoom 收敛到 [0.5, 4]。
 * 与后端 Camera.getZoomFactor()、projectFile.normalizeCamera 同一套兜底：
 * **zoom <= 0 当作 1**（0 会让取景框尺寸发散，不是"缩到最小"）。
 *
 * <p>保留 `to` / `easing`：C2 的起止镜头就靠它们，归一化不能把它们丢掉。
 */
export function normalizeCamera(
  camera: RecordCamera | null | undefined,
): RecordCamera {
  if (!camera) return IDENTITY_CAMERA;
  const start = normalizeKeyframe(camera);
  const easing = CAMERA_EASINGS.includes(camera.easing as CameraEasing)
    ? (camera.easing as CameraEasing)
    : DEFAULT_CAMERA_EASING;
  if (!camera.to) return start;
  return {
    ...start,
    to: normalizeKeyframe(camera.to),
    easing,
    moveFrames: cameraMoveFrames(camera),
  };
}

/** 取镜头在某个位置的帧：`which = "end"` 且没有终点时，等同于起点（静止镜头） */
export function cameraKeyframe(
  camera: RecordCamera | null | undefined,
  which: "start" | "end",
): CameraKeyframe {
  const normalized = normalizeCamera(camera);
  if (which === "start") {
    return {
      centerX: normalized.centerX,
      centerY: normalized.centerY,
      zoom: normalized.zoom,
    };
  }
  return normalizeKeyframe(normalized.to ?? normalized);
}

/**
 * 写回某一帧镜头（编辑器用）。
 *
 * @param which start = 直接改这一层；end = 写进 `to`（并保留缓动）
 */
export function withKeyframe(
  camera: RecordCamera | null | undefined,
  which: "start" | "end",
  frame: CameraKeyframe,
): RecordCamera {
  const normalized = normalizeCamera(camera);
  const key = normalizeKeyframe(frame);
  if (which === "start") {
    if (!normalized.to) return key;
    return {
      ...key,
      to: normalized.to,
      easing: normalized.easing ?? DEFAULT_CAMERA_EASING,
      moveFrames: cameraMoveFrames(normalized),
    };
  }
  return {
    ...normalized,
    to: key,
    easing: normalized.easing ?? DEFAULT_CAMERA_EASING,
    moveFrames: cameraMoveFrames(normalized),
  };
}

/** 镜头在动吗（有终点且与起点不同） */
export function isAnimatedCamera(camera: RecordCamera | null | undefined): boolean {
  if (!camera?.to) return false;
  const start = normalizeCamera(camera);
  const end = normalizeKeyframe(camera.to);
  return (
    Math.abs(start.centerX - end.centerX) > 0.5 ||
    Math.abs(start.centerY - end.centerY) > 0.5 ||
    Math.abs(start.zoom - end.zoom) > 1e-4
  );
}

/**
 * 取 t（0~1）时刻的镜头。
 *
 * <p>静止镜头永远返回起点；动画镜头按缓动插值。渲染（DOM 播放与后端出片）都用它，
 * 前端与后端必须是同一条曲线，否则预览与成片对不上。
 */
export function cameraAt(
  camera: RecordCamera | null | undefined,
  t: number,
): CameraKeyframe {
  const normalized = normalizeCamera(camera);
  const start = cameraKeyframe(normalized, "start");
  if (!isAnimatedCamera(normalized)) return start;

  const end = cameraKeyframe(normalized, "end");
  const progress = easeProgress(t, normalized.easing);
  return {
    centerX: start.centerX + (end.centerX - start.centerX) * progress,
    centerY: start.centerY + (end.centerY - start.centerY) * progress,
    zoom: start.zoom + (end.zoom - start.zoom) * progress,
  };
}

/** 镜头是否恒等（= 与没有摄像机一样） */
export function isIdentityCamera(camera: RecordCamera | null | undefined): boolean {
  if (!camera) return true;
  const normalized = normalizeCamera(camera);
  return (
    Math.abs(normalized.zoom - 1) < 1e-4 &&
    Math.abs(normalized.centerX - DESIGN_WIDTH / 2) < 0.5 &&
    Math.abs(normalized.centerY - DESIGN_HEIGHT / 2) < 0.5
  );
}

/** 取景框在世界坐标里的矩形（= 镜头看到的那一块） */
export function cameraRectOf(camera: RecordCamera): PreviewRect {
  const { centerX, centerY, zoom } = normalizeCamera(camera);
  const w = DESIGN_WIDTH / zoom;
  const h = DESIGN_HEIGHT / zoom;
  return { x: centerX - w / 2, y: centerY - h / 2, w, h };
}

/** 世界坐标 → 视图（CSS 像素）的变换 */
export interface ViewTransform {
  /** 世界框左上角在舞台里的 CSS 坐标 */
  left: number;
  top: number;
  /** 世界框的 CSS 尺寸 */
  width: number;
  height: number;
  /** CSS 像素 / 世界像素 */
  scale: number;
}

/** "刚好放下整个世界"的缩放倍数 */
export function fitScale(
  stageSize: ImageSize,
  worldBox: PreviewRect,
): number {
  if (
    stageSize.width <= 0 ||
    stageSize.height <= 0 ||
    worldBox.w <= 0 ||
    worldBox.h <= 0
  ) {
    return 1;
  }
  return Math.min(stageSize.width / worldBox.w, stageSize.height / worldBox.h);
}

/**
 * 算出世界框在舞台里的位置与大小。
 *
 * @param viewZoom 相对"刚好放下"的倍数；1 = 适配
 * @param pan      视图平移（CSS 像素）
 * @param fitBox   用哪个矩形来"适配"；缺省 = 世界框本身。
 *                 实际使用时传世界参考框（背景/画布）稍微外扩一点，
 *                 否则世界框含一帧余地，适配后内容只占屏幕 1/3，看不清楚。
 */
export function viewTransformOf(
  stageSize: ImageSize,
  worldBox: PreviewRect,
  viewZoom: number,
  pan: { x: number; y: number },
  fitBox: PreviewRect = worldBox,
): ViewTransform {
  const scale =
    fitScale(stageSize, fitBox) * clamp(viewZoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
  const width = worldBox.w * scale;
  const height = worldBox.h * scale;
  return {
    scale,
    width,
    height,
    // 让 fitBox 居中，再把世界框按它与 fitBox 的偏移摆好
    left:
      (stageSize.width - fitBox.w * scale) / 2 +
      pan.x -
      (fitBox.x - worldBox.x) * scale,
    top:
      (stageSize.height - fitBox.h * scale) / 2 +
      pan.y -
      (fitBox.y - worldBox.y) * scale,
  };
}

/** 舞台 CSS 坐标 → 世界坐标 */
export function cssToWorld(
  point: { x: number; y: number },
  transform: ViewTransform,
  worldBox: PreviewRect,
): { x: number; y: number } {
  const scale = transform.scale > 0 ? transform.scale : 1;
  return {
    x: worldBox.x + (point.x - transform.left) / scale,
    y: worldBox.y + (point.y - transform.top) / scale,
  };
}

/**
 * 按世界位移移动镜头（结果夹在世界框内）。
 *
 * <p>「世界框」= 参考框每边各留一个取景框（见 previewLayout.worldBoxOf），
 * 所以镜头最多能摇到「世界完全不在画面里」为止。
 */
export function moveCameraBy(
  camera: RecordCamera,
  worldDelta: { x: number; y: number },
  worldBox: PreviewRect,
): RecordCamera {
  const current = normalizeCamera(camera);
  return clampCamera(
    {
      centerX: current.centerX + worldDelta.x,
      centerY: current.centerY + worldDelta.y,
      zoom: current.zoom,
    },
    worldBox,
  );
}

/**
 * 以某个世界点为锚点推拉镜头：锚点在画面里的相对位置保持不变。
 *
 * <p>滚轮推拉就是它——不这么做的话，指针指向的细节会在缩放时"跑掉"。
 */
export function zoomCameraAt(
  camera: RecordCamera,
  nextZoom: number,
  anchorWorld: { x: number; y: number },
  worldBox: PreviewRect,
): RecordCamera {
  const current = normalizeCamera(camera);
  const zoom = clamp(num(nextZoom, current.zoom), MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);

  const before = cameraRectOf(current);
  // 锚点落在取景框里的相对位置（0 = 左/上边，1 = 右/下边）
  const rx = (anchorWorld.x - before.x) / before.w;
  const ry = (anchorWorld.y - before.y) / before.h;

  const afterW = DESIGN_WIDTH / zoom;
  const afterH = DESIGN_HEIGHT / zoom;
  return clampCamera(
    {
      // 让锚点缩放后仍落在同一个相对位置
      centerX: anchorWorld.x - (rx - 0.5) * afterW,
      centerY: anchorWorld.y - (ry - 0.5) * afterH,
      zoom,
    },
    worldBox,
  );
}

/**
 * 视图缩放时保持指针下的世界点不动（Ctrl+滚轮）。
 *
 * @returns 新的 { viewZoom, pan }
 */
export function zoomViewAt(
  point: { x: number; y: number },
  stageSize: ImageSize,
  worldBox: PreviewRect,
  viewZoom: number,
  pan: { x: number; y: number },
  factor: number,
  fitBox: PreviewRect = worldBox,
): { viewZoom: number; pan: { x: number; y: number } } {
  const before = viewTransformOf(stageSize, worldBox, viewZoom, pan, fitBox);
  const anchor = cssToWorld(point, before, worldBox);

  const nextZoom = clamp(viewZoom * factor, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
  const scale = fitScale(stageSize, fitBox) * nextZoom;

  // 让 anchor 世界点缩放后仍落在指针下 → 反推 pan
  // 由 left = (stage - fitBox*scale)/2 + pan - (fitBox - worldBox)*scale
  //   = point - (anchor - worldBox)*scale 解出 pan
  const baseLeft =
    (stageSize.width - fitBox.w * scale) / 2 - (fitBox.x - worldBox.x) * scale;
  const baseTop =
    (stageSize.height - fitBox.h * scale) / 2 - (fitBox.y - worldBox.y) * scale;
  return {
    viewZoom: nextZoom,
    pan: {
      x: point.x - (anchor.x - worldBox.x) * scale - baseLeft,
      y: point.y - (anchor.y - worldBox.y) * scale - baseTop,
    },
  };
}

/**
 * 背景「铺满画面」需要的最小 scale。
 *
 * <p>后端背景是 contain（完整放进 1920×1080×scale 的目标框），所以横长条背景在 scale=1 时
 * 会上下留黑、世界也只有画布那么大、镜头无处可摇。这个值把它放大到刚好盖住当前取景框：
 * 先按 scale=1 量出绘制尺寸，再按「取景框 / 绘制尺寸」的最大比例放大。
 *
 * @param background 背景视觉元素（用它的原图与路径，scale 会被忽略）
 * @param imageSize  背景原图尺寸
 * @param camera     当前镜头（决定取景框多大）
 */
export function coverScaleForBackground(
  background: BackgroundVisual,
  imageSize: ImageSize,
  camera: RecordCamera,
): number {
  const atOne = backgroundWorldRect(
    { ...background, scale: 1, posX: 0, posY: 0 } as BackgroundVisual,
    imageSize,
  );
  if (atOne.w <= 0 || atOne.h <= 0) return 1;

  const { zoom } = normalizeCamera(camera);
  const frameW = DESIGN_WIDTH / zoom;
  const frameH = DESIGN_HEIGHT / zoom;
  // 取「刚好盖住取景框」的比例，但**不缩小**：背景本来就比取景框大时保持 1，
  // 否则点一下"铺满"反而把世界变小、镜头更没地方摇。
  const scale = Math.max(1, frameW / atOne.w, frameH / atOne.h);
  // 后端把 scale 夹在 [0.1, 4]（BackgroundVisual.normalizeScale / MAX_BACKGROUND_SCALE），超出没有意义
  return clamp(Math.round(scale * 1000) / 1000, 0.1, MAX_BACKGROUND_SCALE);
}
