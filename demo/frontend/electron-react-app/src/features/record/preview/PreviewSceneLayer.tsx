/**
 * @module DOM 场景层
 *
 * 用 DOM 把「背景 + 立绘 + 临时图片」按几何模块算出的矩形重绘一遍，
 * 再补上固定不动的边框暗角与对话框/地点牌——拖拽时栅格图会被隐藏，由这一层顶上。
 *
 * 三种用途：
 * 1. 对位自检（P0）：铺在半透明栅格图上面，肉眼比对是否严丝合缝；
 * 2. 拖拽跟手（P2）：拖元素时隐藏栅格图，用它实时跟手；
 * 3. 摄像机模式（C1）：换成"世界视图"的投影后，它就是世界全图。
 *
 * 组件本身只负责"按百分比摆放"，坐标系由调用方决定（`frame` 决定百分比的分母）。
 */
import React from "react";
import type { ImageSize, PreviewRect } from "./previewLayout";

/** 一个待绘制的场景元素 */
export interface SceneLayerItem {
  /** 稳定 key（= 图层 key），React 复用与调试都靠它 */
  key: string;
  /**
   * 图片地址。
   *
   * <p>与 {@link SceneLayerItem.className} 二选一：有 `src` 就画 `<img>`，
   * 没 `src` 但给了 `className` 就画一个纯 CSS 图层（用于边框暗角这类"没有素材"的层）。
   */
  src?: string;
  /** 纯 CSS 图层的类名（无 `src` 时生效） */
  className?: string;
  /** 在 `frame` 坐标系里的矩形 */
  rect: PreviewRect;
  /** 压暗：与后端 ImageDarkener.darkenImage(image, 0.5f) 对齐 */
  dim?: boolean;
  /**
   * 是否跟着"场景框"一起裁剪。
   *
   * <p>只有世界层（背景/立绘/临时图片）需要裁：它们能画到 1920×1080 之外。
   * **边框暗角与 UI（对话框、地点牌、名片）不能裁**——成片里 UI 是画在设计画布上的，
   * 对话框底部本来就压在下方黑边上；裁了就会被黑框咬掉一截。
   */
  clipWithScene?: boolean;
  /**
   * 移动动画的 DOM 样式（由 `domTransform.spriteDomStyle` 算出）。
   *
   * <p>**恒等时不要传**：不传就不加任何 style，DOM 层与被后端渲出来的栅格图逐像素一致
   * （"没配动画就完全不变"靠这条保证）。传了也只动 transform/opacity，不触发 layout。
   */
  transform?: string;
  /** 动画的变换原点（相对元素盒子的百分比） */
  transformOrigin?: string;
  /** 动画的不透明度（1 = 不传） */
  opacity?: number;
}

interface PreviewSceneLayerProps {
  /** 按绘制顺序排列（数组后面的画在上层） */
  items: SceneLayerItem[];
  /** 百分比坐标的分母：输出图尺寸（最终效果）或世界框尺寸（摄像机模式） */
  frame: ImageSize;
  /**
   * 裁剪矩形（与 `frame` 同一坐标系）。传了就按它裁掉外面 —— 最终效果里传"场景框"
   * （设计画布中间的 80%），摄像机模式不传（世界视图要看全）。
   */
  clipRect?: PreviewRect;
  className?: string;
}

const percent = (value: number, total: number): string =>
  total > 0 ? `${(value / total) * 100}%` : "0%";

/**
 * 场景层。
 *
 * <p>定位一律用百分比：舞台尺寸随窗口变化时不用重新计算，也不会因为四舍五入累积出偏差。
 *
 * <h3>为什么要裁到"场景框"</h3>
 * 成片里场景只占设计画布中间 80%（`0.8` 缩放 + (192,108) 偏移），四周是一圈黑。
 * 镜头一摇/一推，背景会被画到 1920×1080 之外——后端在合成场景画布时就裁掉了，
 * 这里也必须跟着裁：否则播放/对位时背景会溢出到黑边上，看起来"黑框没了"。
 */
const PreviewSceneLayer: React.FC<PreviewSceneLayerProps> = ({
  items,
  frame,
  className = "",
  clipRect,
}) => {
  if (frame.width <= 0 || frame.height <= 0) return null;

  /**
   * 把裁剪矩形换算成 `clip-path: inset()` 的百分比。
   *
   * <p>用 clip-path 而不是 overflow:hidden 的包裹层：百分比定位的基准仍然是整个 stage，
   * 不用把每个元素的坐标再换算一遍。
   */
  const clipStyle: React.CSSProperties | undefined = clipRect
    ? {
        clipPath: `inset(${percent(clipRect.y, frame.height)} ${
          frame.width > 0 ? `${((frame.width - clipRect.x - clipRect.w) / frame.width) * 100}%` : "0%"
        } ${
          frame.height > 0 ? `${((frame.height - clipRect.y - clipRect.h) / frame.height) * 100}%` : "0%"
        } ${percent(clipRect.x, frame.width)})`,
      }
    : undefined;

  const renderItem = (item: SceneLayerItem) => {
    const style: React.CSSProperties = {
      left: percent(item.rect.x, frame.width),
      top: percent(item.rect.y, frame.height),
      width: percent(item.rect.w, frame.width),
      height: percent(item.rect.h, frame.height),
    };
    // 动画样式：只有非恒等时调用方才传；只动 transform/opacity，不触发布局
    if (item.transform) {
      style.transform = item.transform;
      style.transformOrigin = item.transformOrigin ?? "50% 50%";
      if (typeof item.opacity === "number") {
        style.opacity = item.opacity;
      }
      // 播放中提升为合成层（只在真正有动画时才有代价）
      style.willChange = "transform";
    }

    // 没有图片的层（边框暗角）：用一个纯 CSS 的 div 画
    if (!item.src) {
      return (
        <div
          key={item.key}
          className={`preview-scene-shape ${item.className ?? ""}`.trim()}
          style={style}
        />
      );
    }

    return (
      <img
        key={item.key}
        src={item.src}
        alt=""
        draggable={false}
        className={`preview-scene-item${item.dim ? " dim" : ""}`}
        style={style}
      />
    );
  };

  /**
   * 分层：只有标了 `clipWithScene` 的（世界层）进裁剪容器；
   * 边框暗角与 UI 留在外面按原样绘制 —— 它们的坐标本来就该画到黑边上。
   */
  const clippedItems = clipRect ? items.filter((item) => item.clipWithScene) : [];
  const topItems = clipRect ? items.filter((item) => !item.clipWithScene) : items;

  return (
    <div className={`preview-scene-layer ${className}`.trim()} aria-hidden="true">
      {clipRect && (
        <div className="preview-scene-clip" style={clipStyle}>
          {clippedItems.map(renderItem)}
        </div>
      )}
      {topItems.map(renderItem)}
    </div>
  );
};

export default PreviewSceneLayer;
