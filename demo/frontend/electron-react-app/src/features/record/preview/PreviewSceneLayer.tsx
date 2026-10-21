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
}

interface PreviewSceneLayerProps {
  /** 按绘制顺序排列（数组后面的画在上层） */
  items: SceneLayerItem[];
  /** 百分比坐标的分母：输出图尺寸（最终效果）或世界框尺寸（摄像机模式） */
  frame: ImageSize;
  className?: string;
}

const percent = (value: number, total: number): string =>
  total > 0 ? `${(value / total) * 100}%` : "0%";

/**
 * 场景层。
 *
 * <p>定位一律用百分比：舞台尺寸随窗口变化时不用重新计算，也不会因为四舍五入累积出偏差。
 */
const PreviewSceneLayer: React.FC<PreviewSceneLayerProps> = ({
  items,
  frame,
  className = "",
}) => {
  if (frame.width <= 0 || frame.height <= 0) return null;

  return (
    <div className={`preview-scene-layer ${className}`.trim()} aria-hidden="true">
      {items.map((item) => {
        const style: React.CSSProperties = {
          left: percent(item.rect.x, frame.width),
          top: percent(item.rect.y, frame.height),
          width: percent(item.rect.w, frame.width),
          height: percent(item.rect.h, frame.height),
        };

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
      })}
    </div>
  );
};

export default PreviewSceneLayer;
