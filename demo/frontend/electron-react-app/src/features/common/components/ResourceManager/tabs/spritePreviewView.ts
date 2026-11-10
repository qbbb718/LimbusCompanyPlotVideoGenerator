/**
 * @module 序列帧动画预览：查看视图（缩放 + 平移）
 *
 * 缩略图摆放是"对着画面调"的活：16:9 舞台放进预览栏后通常只有原图的 50%~80%，
 * 缩略图相对头部偏一两个像素根本看不出来。所以给预览加一层**只影响看**的视图缩放/平移。
 *
 * <h3>为什么视图不参与保存</h3>
 * `poster.offsetX / offsetY / scale` 才是素材上真正存的东西。视图缩放只改舞台的显示尺寸与位移，
 * 叠加层仍然用百分比铺在舞台里，拖动换算是从 `getBoundingClientRect()` 现算的。
 * 因此放大到 400% 再拖缩略图，写回的偏移/缩放与在 100% 下拖出来的**完全一致**。
 *
 * <h3>为什么用"相对适应窗口"的倍数，而不是绝对像素比例</h3>
 * 舞台一开始就是"能放进视口的最大 16:9 矩形"（`fitStage`）。若百分比用绝对比例
 * （100% = 1 个输出像素对 1 个屏幕像素），窗口一变初始读数就变成 57.3% 这种数字，
 * 用户还得先找一次"适应"。这里 1 = 适应窗口（初始值就是 100%），
 * 放大只是把舞台按倍数撑大，窗口怎么拉，初始视图永远是完整的整幅画面。
 *
 * <h3>边界</h3>
 * - 缩放：1（100%，= 适应窗口）~ {@link VIEW_ZOOM_MAX}（400%）。不允许缩到 100% 以下：
 *   适应已经能看见整幅画面，再缩小只会多出空白。
 * - 平移：画面还没铺满视口的那一轴**强制居中**（pan = 0）；铺满之后夹在
 *   `±(显示尺寸 − 视口尺寸) / 2`，保证怎么拖都不会露出舞台外的空白。
 *
 * 这里的函数全是纯函数，几何由 `spritePreviewView.test.ts` 锁住。
 */

import type { BoxSize } from "./stageFit";

/** 视图平移量（CSS 像素，相对"居中"位置） */
export interface PreviewView {
  /** 相对适应窗口的缩放倍数：1 = 100% = 适应窗口 */
  zoom: number;
  /** 舞台中心的水平位移（正 = 向右） */
  panX: number;
  /** 舞台中心的竖直位移（正 = 向下） */
  panY: number;
}

/** 缩放下限：1 = 适应窗口（不允许再缩小） */
export const VIEW_ZOOM_MIN = 1;
/** 缩放上限：400%，够把头部附近放到"一个像素都数得清" */
export const VIEW_ZOOM_MAX = 4;
/**
 * 按钮每次缩放走的**百分点**（0.1 = 10%）。
 *
 * <p>用加法而不是乘 1.1：100 → 110 → 120 … → 400 每一档都是整数百分比，
 * 读数不会出现 146.4% 这种数字；更细的档位由 `Ctrl+滚轮`（约 10%/格，触控板更细）
 * 与输入框（精确到 0.1%）提供。
 */
export const VIEW_ZOOM_STEP = 0.1;

/** 两个尺寸都必须是正数，否则所有几何都没有意义 */
const usable = (size?: BoxSize | null): size is BoxSize =>
  !!size &&
  Number.isFinite(size.width) &&
  Number.isFinite(size.height) &&
  size.width > 0 &&
  size.height > 0;

const clamp = (value: number, min: number, max: number): number => {
  const result = Math.min(max, Math.max(min, value));
  // `-0` 会跟着 Object.is / toEqual 一路传下去，统一成 0（否则测试与样式里会看到 -0px）
  return result === 0 ? 0 : result;
};

/** 初始视图：正好适应窗口 */
export const fitView = (): PreviewView => ({ zoom: VIEW_ZOOM_MIN, panX: 0, panY: 0 });

/** 把缩放夹进 [100%, 400%]；非数字按 100% 处理 */
export function clampViewZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return VIEW_ZOOM_MIN;
  return clamp(zoom, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX);
}

/** 舞台在某个缩放下的显示尺寸（px） */
export function viewStageSize(base: BoxSize, zoom: number): BoxSize {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : VIEW_ZOOM_MIN;
  return { width: base.width * safeZoom, height: base.height * safeZoom };
}

/**
 * 每个轴允许的最大平移量。
 *
 * <p>显示尺寸比视口小的轴返回 0（那一轴必须居中）；比视口大时最多挪到"舞台边缘贴住视口边缘"。
 */
export function maxViewPan(
  base: BoxSize,
  viewport: BoxSize,
  zoom: number,
): { x: number; y: number } {
  if (!usable(base) || !usable(viewport)) return { x: 0, y: 0 };
  const shown = viewStageSize(base, zoom);
  return {
    x: Math.max(0, (shown.width - viewport.width) / 2),
    y: Math.max(0, (shown.height - viewport.height) / 2),
  };
}

/** 夹平移：露白的轴回中，放大的轴不许拖出空白 */
export function clampViewPan(
  view: PreviewView,
  base: BoxSize,
  viewport: BoxSize,
): PreviewView {
  if (!usable(base) || !usable(viewport)) {
    return { zoom: view.zoom, panX: 0, panY: 0 };
  }
  const limit = maxViewPan(base, viewport, view.zoom);
  return {
    zoom: view.zoom,
    panX: clamp(view.panX, -limit.x, limit.x),
    panY: clamp(view.panY, -limit.y, limit.y),
  };
}

/** 先夹缩放、再夹平移 */
export function clampView(view: PreviewView, base: BoxSize, viewport: BoxSize): PreviewView {
  return clampViewPan({ ...view, zoom: clampViewZoom(view.zoom) }, base, viewport);
}

/** 拖拽平移：相对当前视图位移 (dx, dy)（CSS 像素）后夹进边界 */
export function panViewBy(
  view: PreviewView,
  base: BoxSize,
  viewport: BoxSize,
  dx: number,
  dy: number,
): PreviewView {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return view;
  return clampViewPan({ ...view, panX: view.panX + dx, panY: view.panY + dy }, base, viewport);
}

/**
 * 以视口里的某一点为锚点缩放：锚点下面的画面内容保持不动。
 *
 * <p>推导：舞台显示尺寸 `D = base · zoom`，居中时的左上角是 `(V − D) / 2`，
 * 平移 pan 之后是 `left = (V − D) / 2 + pan`。屏幕点 `s` 对应舞台坐标
 * `p = (s − left) / zoom`。缩放成 `zoom₂` 后要求 `p` 仍落在 `s`：
 * `pan₂ = s − p · zoom₂ − (V − D₂) / 2`。
 *
 * @param anchor 锚点（相对视口左上角，CSS 像素）
 */
export function zoomViewAt(
  view: PreviewView,
  nextZoom: number,
  anchor: { x: number; y: number },
  base: BoxSize,
  viewport: BoxSize,
): PreviewView {
  const zoom = clampViewZoom(nextZoom);
  if (!usable(base) || !usable(viewport) || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    return { zoom, panX: 0, panY: 0 };
  }
  const before = viewStageSize(base, view.zoom);
  const left = (viewport.width - before.width) / 2 + view.panX;
  const top = (viewport.height - before.height) / 2 + view.panY;
  // 锚点下面是舞台里的哪个点（舞台自身的 px 坐标系，不随视图缩放变化）
  const pointX = (anchor.x - left) / view.zoom;
  const pointY = (anchor.y - top) / view.zoom;

  const after = viewStageSize(base, zoom);
  return clampViewPan(
    {
      zoom,
      panX: anchor.x - pointX * zoom - (viewport.width - after.width) / 2,
      panY: anchor.y - pointY * zoom - (viewport.height - after.height) / 2,
    },
    base,
    viewport,
  );
}

/** 以视口中心为锚点缩放（按钮 / 输入框走它：画面中心的内容不会跑掉） */
export function zoomViewToCenter(
  view: PreviewView,
  nextZoom: number,
  base: BoxSize,
  viewport: BoxSize,
): PreviewView {
  return zoomViewAt(
    view,
    nextZoom,
    { x: viewport.width / 2, y: viewport.height / 2 },
    base,
    viewport,
  );
}
