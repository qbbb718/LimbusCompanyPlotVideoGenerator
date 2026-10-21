/**
 * @module 预览对位自检层
 *
 * 把几何模块算出来的矩形**原样叠在栅格图上**。这是整条交互链路的地基：
 * 热区、选中框、拖拽跟手、摄像机取景框全都复用同一份几何，如果叠框和画面里的
 * 立绘/背景对不上，后面所有交互都会错位，所以这里要能一眼看出偏差。
 *
 * 调试入口在预览舞台右下角（「▦ 框」「◧ 场景」两个小开关）。
 */
import React from "react";
import type { ImageSize, PreviewLayer, PreviewRect } from "./previewLayout";
import { sceneToOutput } from "./previewLayout";

interface PreviewDebugOverlayProps {
  /** 几何模块算出的图层（已含摄像机与场景变换） */
  layers: PreviewLayer[];
  /** 预览图尺寸（= 百分比坐标的分母） */
  frame: ImageSize;
  /** 是否显示图层名称标签（框太小时可以关掉，只留颜色） */
  showLabels?: boolean;
}

const percent = (value: number, total: number): string =>
  total > 0 ? `${(value / total) * 100}%` : "0%";

const boxStyle = (rect: PreviewRect, frame: ImageSize): React.CSSProperties => ({
  left: percent(rect.x, frame.width),
  top: percent(rect.y, frame.height),
  width: percent(rect.w, frame.width),
  height: percent(rect.h, frame.height),
});

/**
 * 对位叠框。
 *
 * <p>除了每个元素自己的框，还额外画一条「0.8 场景框」参考线：它是
 * {@code composer.addImageLayerScaled(coImage, 192, 108, 0.8f)} 的作用范围，
 * 用来验证场景缩放这一步没算错（立绘整体偏一点，看这条线最直观）。
 */
const PreviewDebugOverlay: React.FC<PreviewDebugOverlayProps> = ({
  layers,
  frame,
  showLabels = true,
}) => {
  if (frame.width <= 0 || frame.height <= 0) return null;

  // 场景画布（1920×1080）在输出图里的位置：校验 0.8 缩放 + (192,108) 偏移
  const sceneBox = sceneToOutput(
    { x: 0, y: 0, w: 1920, h: 1080 },
    frame,
  );

  return (
    <div className="preview-debug-layer" aria-hidden="true">
      <div
        className="preview-debug-scene-box"
        style={boxStyle(sceneBox, frame)}
      />
      {layers.map((layer) => (
        <div
          key={layer.key}
          className={`preview-debug-box kind-${layer.kind}`}
          style={boxStyle(layer.outRect, frame)}
        >
          {showLabels && (
            <span className="preview-debug-label">{layer.label}</span>
          )}
        </div>
      ))}
    </div>
  );
};

export default PreviewDebugOverlay;
