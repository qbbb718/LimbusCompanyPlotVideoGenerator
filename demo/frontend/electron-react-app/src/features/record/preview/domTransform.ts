/**
 * @module 立绘动画 - 预览层 DOM 变换
 *
 * 把后端那套「世界像素变换」翻译成 CSS `transform`。
 *
 * <h2>为什么位移要用元素自身的百分比</h2>
 * 世界矩形 W 经相机 zoom、剧情模式 0.8 缩放、输出分辨率缩放 k 之后，屏幕上的宽是
 * {@code w_screen = W · zoom · 0.8 · k}。位移 dx（世界像素）投射到屏幕是
 * {@code dx_screen = dx · zoom · 0.8 · k}。两者相除：
 * <pre>dx_screen / w_screen = dx / W</pre>
 * —— zoom、0.8、k **全部抵消**。所以只要把 `dx / W` 写成百分比，无论预览图怎么缩放、
 * 相机怎么推拉、用户选了 720p 还是 4K，位移都自动正确，且**不触发 layout**（只动 transform）。
 *
 * <h2>顺序必须是 translate → rotate → scale</h2>
 * CSS 的 transform 列表是从右往左作用到点上的，所以这个顺序等价于
 * 「先绕锚点缩放、再绕锚点旋转、最后平移」，与后端
 * {@code p' = A + R(θ)·S(s)·(p − A) + d} 完全一致。写反顺序会让位移被旋转带偏。
 */

import type { TransformState } from "../animation/animationTypes";
import { isIdentityTransform } from "../animation/animationTypes";

/** 一个元素的动画样式（直接铺到 DOM 上） */
export interface SpriteDomStyle {
  /** `translate(..%) rotate(..deg) scale(..)` */
  transform: string;
  /** 锚点在本元素盒子里的百分比位置 */
  transformOrigin: string;
  /** 不透明度；只有真需要时才给（恒等时不写，避免多一层合成） */
  opacity?: number;
}

/** 矩形（只要宽高；世界坐标或输出坐标都行，因为用的是比例） */
export interface SizeLike {
  w: number;
  h: number;
}

/** 矩形（带左上角，换算"共同原点"时用） */
export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 生成一个立绘 / 临时图片的动画样式。
 *
 * @param baseRect  元素在**世界坐标**里的矩形（不能是输出坐标，否则百分比会被 k 污染）
 * @param transform 该帧的动画变换
 * @param anchor    锚点（0~1，相对元素盒子）
 * @returns 恒等时返回 `null` —— 调用方此时**不要加任何 style**，
 *          这样 DOM 层与被后端渲出来的栅格图逐像素一致（也才是"没配动画就完全不变"）
 */
export function spriteDomStyle(
  baseRect: SizeLike,
  transform: TransformState | null | undefined,
  anchor: { x: number; y: number },
): SpriteDomStyle | null {
  if (!transform || isIdentityTransform(transform)) {
    return null;
  }
  if (baseRect.w <= 0 || baseRect.h <= 0) {
    return null;
  }

  const txPct = (transform.x / baseRect.w) * 100;
  const tyPct = (transform.y / baseRect.h) * 100;
  const precision = (value: number): number => Math.round(value * 10000) / 10000;

  const style: SpriteDomStyle = {
    transform:
      `translate(${precision(txPct)}%, ${precision(tyPct)}%) ` +
      `rotate(${precision(transform.rotate)}deg) ` +
      `scale(${precision(transform.scale)})`,
    transformOrigin: `${precision(clamp01(anchor.x) * 100)}% ${precision(clamp01(anchor.y) * 100)}%`,
  };
  if (Math.abs(transform.alpha - 1) > 1e-4) {
    style.opacity = Math.round(clamp01(transform.alpha) * 1000) / 1000;
  }
  return style;
}

/**
 * 父子的**共同变换原点**：把父级的锚点（一个绝对点）换算成子元素盒子里的百分比。
 *
 * <h2>为什么需要它</h2>
 * 情绪动画等"子级"元素在 DOM 里是立绘的**兄弟节点**（都绝对定位在同一个场景层里），
 * 想让子级跟着父级一起旋转/缩放，就必须给子级套**同一个** transform 字符串。
 * 但 `transform-origin` 是相对各自盒子计算的——如果子级直接抄父级的百分比，
 * 旋转中心就会变成子元素自己的对应位置，表现为"立绘在抖、汗滴绕着画面中心甩出去"。
 *
 * <p>正确做法：把父级锚点这个**绝对点 A** 分别换算到两个元素的盒子里，
 * 于是 `O + T(p − O)` 中的 `O` 都是同一个 A，两个兄弟节点等价于父子节点。
 *
 * @param parentRect 父元素矩形（与子元素同一坐标系）
 * @param anchor     父元素锚点（0~1）
 * @param childRect  子元素矩形（同一坐标系）
 * @returns 子元素盒子里的百分比原点（允许 &lt;0 或 &gt;1，CSS 支持）
 */
export function sharedTransformOrigin(
  parentRect: RectLike,
  anchor: { x: number; y: number },
  childRect: RectLike,
): { x: number; y: number } {
  if (childRect.w <= 0 || childRect.h <= 0) {
    return { x: anchor.x, y: anchor.y };
  }
  const anchorX = parentRect.x + clamp01(anchor.x) * parentRect.w;
  const anchorY = parentRect.y + clamp01(anchor.y) * parentRect.h;
  return {
    x: (anchorX - childRect.x) / childRect.w,
    y: (anchorY - childRect.y) / childRect.h,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
