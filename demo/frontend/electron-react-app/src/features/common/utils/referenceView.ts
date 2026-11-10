/**
 * 截图舞台的"查看视图"变换（纯函数，方便单测）
 *
 * <h2>职责边界</h2>
 * 这里只负责**看**：把 1920×1080 的画面坐标系映射到舞台的 CSS 像素。
 * 它**不参与**任何校准计算 —— 反推用的还是 {@link referenceCrop} 里那套
 * （立绘像素 → 画面像素 → faceX/faceY/length），所以放大到 400%、平移到角落，
 * 写回的裁剪参数与导出结果都一个字不变。
 *
 * <h2>变换</h2>
 * <pre>
 *   css   = frame · scale + pan
 *   frame = (css − pan) / scale
 * </pre>
 * `scale` 是**绝对**比例（1 = 画面像素与屏幕像素 1:1），所以「100%」和「适应窗口」是两个
 * 不同的状态：窗口里那张 16:9 画面通常只有 50%~70%，要看清细节就得放到 100% 以上。
 *
 * <h2>边界</h2>
 * - 比例：下限 25%（窗口特别小时允许缩到"适应"为止），上限 400% 且至少 4× 适应
 *   —— 保证"至少能放大 4 倍看细节"，同时不会把画面缩成一个小点。
 * - 平移：画面比舞台小时**居中**；比舞台大时不允许露出空白（pan 夹在 [舞台−画面, 0]）。
 */

import { FRAME_HEIGHT, FRAME_WIDTH } from "./referenceCrop";

/** 舞台（视口）的 CSS 尺寸 */
export interface Viewport {
  width: number;
  height: number;
}

/** 查看视图：画面像素 → 舞台 CSS 像素 */
export interface ReferenceView {
  /** CSS 像素 / 画面像素 */
  scale: number;
  /** 画面左上角在舞台里的 X（CSS 像素） */
  panX: number;
  /** 画面左上角在舞台里的 Y（CSS 像素） */
  panY: number;
}

/** 缩放下限（绝对比例，25%） */
export const MIN_VIEW_SCALE = 0.25;
/** 缩放上限（绝对比例，400%） */
export const MAX_VIEW_SCALE = 4;
/** 上限至少要是"适应"的这么多倍，保证小窗口里也能放大看细节 */
export const MIN_ZOOM_IN_OVER_FIT = 4;

/** 按钮 / 键盘每次缩放的倍率（1.1 = 每次 +10%） */
export const VIEW_ZOOM_STEP = 1.1;
/** 滚轮灵敏度：标准鼠标一格 deltaY≈100 → 约 ×1.105 */
export const WHEEL_ZOOM_SENSITIVITY = 0.001;
/** Alt+滚轮（立绘缩放）的灵敏度：一格约 ×1.03，比按钮细很多 */
export const WHEEL_PORTRAIT_ZOOM_SENSITIVITY = 0.0003;
/** 一帧里累计滚轮量算出来的倍率夹取范围（挡住"甩一下飞出太阳系"） */
const MAX_FRAME_FACTOR = 2;
const MIN_FRAME_FACTOR = 0.5;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** 有效尺寸（宽高都是正数） */
const usable = (viewport?: Viewport | null): viewport is Viewport =>
  !!viewport &&
  Number.isFinite(viewport.width) &&
  Number.isFinite(viewport.height) &&
  viewport.width > 0 &&
  viewport.height > 0;

/** 舞台宽度 / 画面宽度 = "适应窗口"时的比例 */
export const fitScale = (viewport: Viewport): number =>
  usable(viewport) ? viewport.width / FRAME_WIDTH : 1;

/** 比例上下限（随窗口变化） */
export const viewScaleBounds = (
  viewport: Viewport,
): { min: number; max: number } => {
  const fit = fitScale(viewport);
  return {
    // 窗口特别小（fit < 25%）时，至少还能缩到"适应"
    min: Math.min(MIN_VIEW_SCALE, fit),
    max: Math.max(MAX_VIEW_SCALE, fit * MIN_ZOOM_IN_OVER_FIT),
  };
};

/** 把比例夹进上下限 */
export const clampViewScale = (
  scale: number,
  viewport: Viewport,
): number => {
  const bounds = viewScaleBounds(viewport);
  return clamp(Number.isFinite(scale) ? scale : bounds.min, bounds.min, bounds.max);
};

/** "适应窗口"：画面正好铺满舞台并居中 */
export const fitView = (viewport: Viewport): ReferenceView => {
  const scale = fitScale(viewport);
  const width = FRAME_WIDTH * scale;
  const height = FRAME_HEIGHT * scale;
  return {
    scale,
    panX: (viewport.width - width) / 2,
    panY: (viewport.height - height) / 2,
  };
};

/** 100%：1 个画面像素 = 1 个屏幕像素（放不下就以左上角对齐，由 clampView 居中/夹取） */
export const actualSizeView = (viewport: Viewport): ReferenceView =>
  clampView({ scale: 1, panX: 0, panY: 0 }, viewport);

/** 平移夹取：画面比舞台小就居中，比舞台大就不许露白 */
export const clampViewPan = (
  view: ReferenceView,
  viewport: Viewport,
): ReferenceView => {
  if (!usable(viewport)) return view;
  const width = FRAME_WIDTH * view.scale;
  const height = FRAME_HEIGHT * view.scale;
  return {
    scale: view.scale,
    panX:
      width <= viewport.width
        ? (viewport.width - width) / 2
        : clamp(view.panX, viewport.width - width, 0),
    panY:
      height <= viewport.height
        ? (viewport.height - height) / 2
        : clamp(view.panY, viewport.height - height, 0),
  };
};

/** 先夹比例、再夹平移 */
export const clampView = (
  view: ReferenceView,
  viewport: Viewport,
): ReferenceView =>
  clampViewPan(
    { ...view, scale: clampViewScale(view.scale, viewport) },
    viewport,
  );

/**
 * 以舞台上的某一点为锚点缩放：锚点下的画面内容保持不动。
 *
 * @param anchorX 锚点在舞台里的 X（CSS 像素，相对舞台左上角）
 * @param anchorY 锚点在舞台里的 Y
 */
export const zoomViewAt = (
  view: ReferenceView,
  nextScale: number,
  anchorX: number,
  anchorY: number,
): ReferenceView => {
  if (!Number.isFinite(nextScale) || nextScale <= 0) return view;
  const ratio = nextScale / view.scale;
  return {
    scale: nextScale,
    panX: anchorX - (anchorX - view.panX) * ratio,
    panY: anchorY - (anchorY - view.panY) * ratio,
  };
};

/** 画面坐标 → 舞台 CSS */
export const frameToCss = (
  view: ReferenceView,
  x: number,
  y: number,
): { x: number; y: number } => ({
  x: x * view.scale + view.panX,
  y: y * view.scale + view.panY,
});

/** 舞台 CSS → 画面坐标（拖动立绘、滚轮锚点都走它） */
export const cssToFrame = (
  view: ReferenceView,
  x: number,
  y: number,
): { x: number; y: number } => {
  const scale = view.scale > 0 ? view.scale : 1;
  return { x: (x - view.panX) / scale, y: (y - view.panY) / scale };
};

/** 当前视图是否就是"适应窗口" */
export const isFitView = (
  view: ReferenceView,
  viewport: Viewport,
): boolean =>
  usable(viewport) && Math.abs(view.scale - fitScale(viewport)) < 1e-6;

/** 当前视图是否是 100% */
export const isActualSizeView = (view: ReferenceView): boolean =>
  Math.abs(view.scale - 1) < 1e-6;

/** 比例 → 百分比数字（保留 0.1 级） */
export const zoomPercent = (scale: number): number =>
  Math.round(scale * 1000) / 10;

/** 比例 → 显示文字（57.3% / 50% / 100%） */
export const formatZoomPercent = (scale: number): string =>
  `${zoomPercent(scale)}%`;

/**
 * 解析用户输入的缩放比例。
 *
 * <p>接受 `150`、`150%`、`1.5x`（倍率）三种写法；解析不出来返回 null。
 * 返回值是**绝对比例**（150 → 1.5），调用方再夹进上下限。
 */
export const parseZoomPercent = (text: string): number | null => {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 倍率写法：1.5x / 2×
  const multiple = /^([0-9]*\.?[0-9]+)\s*[x×]$/i.exec(trimmed);
  if (multiple) {
    const value = Number(multiple[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  // 百分比写法：150 / 150% / 37.5 %
  const percent = /^([0-9]*\.?[0-9]+)\s*%?$/.exec(trimmed);
  if (!percent) return null;
  const value = Number(percent[1]);
  return Number.isFinite(value) && value > 0 ? value / 100 : null;
};

/** 把 wheel 的 deltaY 归一到"像素"口径（行 / 页模式换算） */
export const normalizeWheelDelta = (
  deltaY: number,
  deltaMode = 0,
): number => {
  if (!Number.isFinite(deltaY)) return 0;
  if (deltaMode === 1) return deltaY * 16; // DOM_DELTA_LINE
  if (deltaMode === 2) return deltaY * 400; // DOM_DELTA_PAGE
  return deltaY;
};

/**
 * 一帧累计的滚轮量 → 缩放倍率。
 *
 * <p>正数 delta（向下滚）缩小、负数放大；结果夹在 [0.5, 2]，
 * 所以高精度滚轮 / 触控板的小增量会被平滑放大，也不会一次跳过头。
 */
export const wheelZoomFactor = (
  deltaY: number,
  sensitivity = WHEEL_ZOOM_SENSITIVITY,
): number => {
  const raw = Math.exp(-normalizeWheelDelta(deltaY) * sensitivity);
  return clamp(raw, MIN_FRAME_FACTOR, MAX_FRAME_FACTOR);
};
