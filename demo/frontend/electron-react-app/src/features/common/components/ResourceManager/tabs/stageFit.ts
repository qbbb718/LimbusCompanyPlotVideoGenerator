/**
 * @module 序列帧动画预览：舞台等比适配
 *
 * 预览区要求**固定长宽比**（合成图由后端按 1280 × 720 渲，即 16:9）：容器怎么缩放，
 * 舞台都按比例缩到"能放下的最大矩形"并**居中**，多余空间留白，永远不拉伸。
 *
 * <h3>为什么不用 CSS 的 aspect-ratio + max-width/max-height</h3>
 * 两个方向同时受限时，被 clamp 的那一轴不会反过来改变另一轴（浏览器把它当"指定尺寸"），
 * 比例当场就破了，表现就是预览图被压扁/拉长。所以沿用项目里已有的做法
 * （见 `features/record/preview/useElementSize.ts` 的模块说明）：**实测容器像素 +
 * 自己算等比矩形**，舞台的宽高用 px 写死，叠层再用百分比铺在里面，
 * 保证"舞台 == 图片 == 百分比坐标系"三者严格一致。
 */

/** 一个矩形的像素尺寸 */
export interface BoxSize {
  width: number;
  height: number;
}

/** 四周留白（px）：让舞台的圆角/描边在视口里露出来，而不是被视口边缘切掉 */
export const STAGE_GUTTER = 4;

/**
 * 求能放进 `container` 的最大等比矩形。
 *
 * @param container 视口尺寸（CSS 像素）
 * @param content   内容原始尺寸（只用来取长宽比）
 * @param gutter    四周留白：宽高各扣 `2 × gutter`
 * @returns 舞台尺寸（px，向下取整保证不超出容器）；量不到尺寸时返回 `null`
 */
export function fitStage(
  container: BoxSize,
  content: BoxSize,
  gutter: number = STAGE_GUTTER,
): BoxSize | null {
  const ratio = content.width > 0 && content.height > 0 ? content.width / content.height : 0;
  const maxWidth = Math.floor(container.width - gutter * 2);
  const maxHeight = Math.floor(container.height - gutter * 2);
  if (ratio <= 0 || maxWidth <= 0 || maxHeight <= 0) {
    return null;
  }
  // 先判断是哪一轴顶住了，再让另一轴由比例推出来：这样**受限的那一轴正好贴边**，
  // 另一轴最多因为取整少 1px，比例误差 < 1px（视觉上看不出来）。
  if (maxWidth / ratio <= maxHeight) {
    return { width: maxWidth, height: Math.max(1, Math.floor(maxWidth / ratio)) };
  }
  return { width: Math.max(1, Math.floor(maxHeight * ratio)), height: maxHeight };
}
