/**
 * @module 预览可见性（素材页签 →「在预览画面里看到它」）
 *
 * 属性面板里点一张素材卡片时，预览要把它**指出来**。成片视图只显示取景框内的画面：
 * 素材被拖出画面、或者镜头推近之后跑出取景框，选中框就落在画面之外——
 * 用户点了一张卡片，画面却没有任何变化。这时需要临时切到**世界视图**
 * （`CameraModeView` 画的是整个世界），素材所在的那块世界才有地方显示。
 *
 * <p>这里只放"看不看得见"的**纯几何判断**，真正的切视图动作留给 RecordPreview：
 * 纯函数好测边界（贴边 / 半张在画面里 / 完全在外），也不会和摄像机状态纠缠。
 *
 * @see RecordPreview 的 revealRequest effect
 * @see CameraModeView 世界视图
 */
import type { ImageSize, PreviewRect } from "./previewLayout";

/**
 * 判定"看得见"的最低可见比例（交集面积 / 素材面积）。
 *
 * <p>取 8%：一张半张露在画面外的立绘仍然算看得见（用户能看到它的主体），
 * 但只剩一条边（被拖走 / 推镜后只露几像素）就值得切到世界视图找一找了。
 */
export const REVEAL_MIN_VISIBLE_RATIO = 0.08;

/** 两个矩形的交集面积（没有交集 = 0） */
export function intersectionArea(a: PreviewRect, b: PreviewRect): number {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (!(width > 0) || !(height > 0)) return 0;
  return width * height;
}

/**
 * @function 图层在画面里露出多少
 * @param rect  图层矩形（预览图像素坐标 = `PreviewLayer.outRect`）
 * @param frame 画面尺寸（= 设置里选的视频宽高）
 * @returns 0~1 的可见比例；矩形无效（宽高非正）时按 0
 */
export function visibleRatioOf(rect: PreviewRect, frame: ImageSize): number {
  if (!(rect.w > 0) || !(rect.h > 0)) return 0;
  const frameRect: PreviewRect = {
    x: 0,
    y: 0,
    w: Math.max(0, frame.width),
    h: Math.max(0, frame.height),
  };
  return intersectionArea(rect, frameRect) / (rect.w * rect.h);
}

/**
 * @function 这个图层要不要切到世界视图才看得到
 * @param rect     图层在成片预览里的矩形
 * @param frame    画面尺寸
 * @param minRatio 可见比例下限（缺省 {@link REVEAL_MIN_VISIBLE_RATIO}）
 * @returns true = 露得太少，建议切世界视图定位
 */
export function shouldRevealInWorld(
  rect: PreviewRect,
  frame: ImageSize,
  minRatio: number = REVEAL_MIN_VISIBLE_RATIO,
): boolean {
  return visibleRatioOf(rect, frame) < minRatio;
}
