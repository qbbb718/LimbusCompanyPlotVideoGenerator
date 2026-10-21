/**
 * @module 预览热区层
 *
 * 把几何模块算出来的每个图层铺成一个**可点击的按钮**，叠在栅格图上面；
 * 点击交给「命中集合 + 循环下钻」判定（见 hitCycle.ts），所以叠在一起的
 * 多个立绘 / 临时图片都能被依次选中，而不是永远只能点到最上面那个。
 *
 * <h3>为什么按钮只负责"位置和可访问性"，点击交给外层容器</h3>
 * 每个图层一个 `<button>`，按图层 `z` 设 `z-index`：浏览器层叠规则天然等于后端绘制顺序，
 * 不用手写"谁在上面"。但**鼠标点击在容器上统一处理**——只有容器知道这一点的完整命中集合
 * （DOM 事件只会落在最上面那个按钮上），循环下钻必须靠它。
 * 键盘（Enter/Space）点某个按钮时 `event.detail === 0`，直接选该按钮对应的元素，不参与循环，
 * 这样 Tab 走查仍然是"一个元素一个焦点的确定性行为"。
 *
 * <h3>层级</h3>
 * 热区层在栅格图之上、调试叠框（pointer-events: none）之下；
 * 右下角的调试开关 z-index 更高，不会被热区挡住。
 */
import React, { useEffect, useRef } from "react";
import type { ImageSize, PreviewLayer } from "./previewLayout";
import { resolveCycledHit } from "./hitCycle";
import type { HitCycleState } from "./hitCycle";

interface PreviewHitLayerProps {
  /** 几何模块产出的全部图层（本层只负责摆位置与接收点击） */
  layers: PreviewLayer[];
  /** 百分比坐标的分母：预览图尺寸 */
  frame: ImageSize;
  /** 当前选中的图层 key（用于画选中框，也决定循环状态是否延续） */
  selectedKey?: string | null;
  /** 点击某个元素 */
  onSelect: (layer: PreviewLayer) => void;
  /** 点击空白（没有元素的位置）——用于取消选中 */
  onClear?: () => void;
}

const percent = (value: number, total: number): string =>
  total > 0 ? `${(value / total) * 100}%` : "0%";

/**
 * 把鼠标事件的客户端坐标换算成**预览图像素**。
 *
 * <p>容器（= 舞台）的 DOM 尺寸与 `frame` 是同一个宽高比，所以按比例缩放即可。
 * 还没完成布局（宽度为 0，或 jsdom 环境）时返回 null，调用方走兜底逻辑。
 */
const toFramePoint = (
  event: React.MouseEvent<HTMLDivElement>,
  element: HTMLElement | null,
  frame: ImageSize,
): { x: number; y: number } | null => {
  const rect = element?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((event.clientX - rect.left) / rect.width) * frame.width,
    y: ((event.clientY - rect.top) / rect.height) * frame.height,
  };
};

/**
 * 热区层。
 *
 * <p>定位一律用百分比（分母是预览图尺寸），所以舞台随窗口缩放时热区自动跟随，
 * 不需要重新计算像素。
 */
const PreviewHitLayer: React.FC<PreviewHitLayerProps> = ({
  layers,
  frame,
  selectedKey = null,
  onSelect,
  onClear,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** 循环下钻的记忆：上次命中的集合与下标（组件内即可，不需要上行到编辑器） */
  const cycleRef = useRef<HitCycleState | null>(null);

  // 外部把选中清掉（切记录 / 点空白）时，循环记忆一起作废：
  // 否则下一次点同一片重叠区会从上一次的"下一层"接着走，而不是从最上层开始。
  useEffect(() => {
    if (!selectedKey) cycleRef.current = null;
  }, [selectedKey]);

  /**
   * 处理一次"点击某个坐标"：
   * 有命中 → 按循环规则选一个；没命中（空白）→ 取消选中。
   */
  const handleClick = (event: React.MouseEvent<HTMLDivElement>, topmostKey?: string) => {
    const point = toFramePoint(event, containerRef.current, frame);
    if (!point) {
      // 量不到舞台尺寸（极端情况）：退化成"选中最上层"，至少不会点空
      const fallback =
        layers.find((layer) => layer.key === topmostKey) ??
        [...layers].sort((a, b) => b.z - a.z)[0];
      cycleRef.current = null;
      if (fallback) onSelect(fallback);
      else onClear?.();
      return;
    }

    // 循环记忆由上一段代码在"选中被外部清空"时重置，这里直接沿用
    const { layer, state } = resolveCycledHit(layers, point, cycleRef.current);
    cycleRef.current = state;
    if (layer) onSelect(layer);
    else onClear?.();
  };

  if (frame.width <= 0 || frame.height <= 0) return null;

  // 按 z 升序渲染：DOM 顺序 = 绘制顺序，后渲染的在上层
  const ordered = [...layers].sort((a, b) => a.z - b.z);

  return (
    <div
      ref={containerRef}
      className="preview-hit-layer"
      onClick={handleClick}
    >
      {ordered.map((layer) => (
        <button
          key={layer.key}
          type="button"
          className={`preview-hit kind-${layer.kind}${
            selectedKey === layer.key ? " selected" : ""
          }`}
          style={{
            left: percent(layer.outRect.x, frame.width),
            top: percent(layer.outRect.y, frame.height),
            width: percent(layer.outRect.w, frame.width),
            height: percent(layer.outRect.h, frame.height),
            zIndex: layer.z,
          }}
          aria-label={layer.label}
          aria-pressed={selectedKey === layer.key}
          title={`${layer.label}（点击编辑）`}
          onClick={(event) => {
            // 键盘触发（Enter/Space）的 click 没有坐标（detail === 0）：
            // 直接选中这个按钮对应的元素，不参与循环下钻。
            if (event.detail === 0) {
              event.stopPropagation();
              cycleRef.current = null;
              onSelect(layer);
              return;
            }
            // 鼠标点击：交给外层的 handleClick 统一判定（它才知道完整命中集合）
          }}
        />
      ))}
    </div>
  );
};

export default PreviewHitLayer;
