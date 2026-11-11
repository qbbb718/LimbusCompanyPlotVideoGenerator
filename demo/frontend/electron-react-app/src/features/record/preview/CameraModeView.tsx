/**
 * @module 摄像机世界视图（「摄像机」页签的编辑画布）
 *
 * 「最终效果」看的是后端渲出来的成片；这个视图看的是**没渲染 UI 的世界**：
 * 背景全图 + 立绘 + 临时图片铺在一块可缩放/平移的画布上，上面浮着一个 16:9 的取景框。
 *
 * <h3>控件在右，画布在左</h3>
 * 起止镜头、缓动、运镜帧数、播放、复位、铺满背景、拖动工具这些**控件全部在「摄像机」页签里**
 * （`properties/CameraProperties.tsx`），本组件只负责"在画布上动手"：
 * 状态由 `useCameraEditor` 统一持有，这里的每一次拖动/滚轮都写回那份共享状态。
 *
 * <h3>交互</h3>
 * <table>
 *   <tr><td>拖动</td><td>移镜（当前工具）；按住 Alt 临时切成另一种工具</td></tr>
 *   <tr><td>拖动取景框的边框</td><td>始终是移镜（不管当前工具）</td></tr>
 *   <tr><td>滚轮</td><td>推拉镜头（以指针为中心）</td></tr>
 *   <tr><td>Ctrl + 滚轮</td><td>缩放**视图**（只是看得更近，不影响成片）</td></tr>
 *   <tr><td>空格 + 拖动</td><td>平移视图</td></tr>
 *   <tr><td>F / 0</td><td>适配视图 / 镜头复位（与页签里的按钮等价）</td></tr>
 * </table>
 *
 * <p>世界边界：参考框（背景归位框 ∪ 画布）每边再留一个取景框的余地，镜头最多摇到
 * 「世界完全不在画面里」为止——夹取逻辑在 previewLayout.clampCamera，这里只负责调用。
 *
 * <p>元素拖动直接复用最终效果模式那套（PreviewHitLayer + previewDrag），
 * 只是把坐标系换成世界坐标：给 hit 层传 `worldPerCssPixel = 1 / 视图缩放`。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImageSize, PreviewLayer, PreviewRect } from "./previewLayout";
import PreviewSceneLayer from "./PreviewSceneLayer";
import type { SceneLayerItem } from "./PreviewSceneLayer";
import PreviewHitLayer from "./PreviewHitLayer";
import type { DragPoint } from "./previewDrag";
import type { CameraEditor, CameraTool } from "./useCameraEditor";
import {
  cameraKeyframe,
  cameraRectOf,
  cssToWorld,
  moveCameraBy,
  viewTransformOf,
  zoomCameraAt,
  zoomViewAt,
} from "./cameraView";
import type { CameraKeyframe } from "./cameraView";

interface CameraModeViewProps {
  /** 全量图层（世界层 + UI 层；这里只用世界层） */
  layers: PreviewLayer[];
  /** 世界参考框（背景归位框 ∪ 画布） */
  worldRef: PreviewRect;
  /** 世界框 = 参考框 + 每边一个取景框余地（镜头可活动范围） */
  worldBox: PreviewRect;
  /** 图层 key → 原图地址 */
  sceneImages: Record<string, string>;
  /** 舞台可用尺寸（CSS 像素） */
  stageSize: ImageSize;
  selectedKey: string | null;
  /**
   * 摄像机编辑状态（与「摄像机」页签共用同一份）。
   *
   * <p>本组件只读取其中"现在编辑哪一帧、工具是什么、视图缩放多少"，
   * 写入一律走 `applyEditing`，页签里的控件因此会同步跟着动。
   */
  editor: CameraEditor;
  onSelectLayer: (layer: PreviewLayer) => void;
  onClearSelection?: () => void;
  /** 元素拖动（与最终效果模式共用） */
  getLayerPosition: (layer: PreviewLayer) => DragPoint | null;
  onLayerDragStart: (layer: PreviewLayer, start: DragPoint) => void;
  onLayerMove: (layer: PreviewLayer, position: DragPoint) => void;
  onLayerDragEnd: (layer: PreviewLayer) => void;
  onLayerDragCancel: (layer: PreviewLayer) => void;
  /**
   * T 巢滤镜（画面层染色）：世界视图里也把它画出来，
   * 否则「摄像机」页签构图时看到的配色和成片不是同一个，取景会误判。
   */
  tone?: boolean;
}

const FRAME_EDGES = ["n", "s", "e", "w"] as const;

/** 焦点在输入类控件里时不要抢快捷键（否则在文本框里打 f 会重置视图） */
const isTypingTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element || !element.tagName) return false;
  const tag = element.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || element.isContentEditable;
};

/** 世界矩形 → 世界框内的百分比定位 */
const rectStyle = (rect: PreviewRect, worldBox: PreviewRect): React.CSSProperties => ({
  left: `${((rect.x - worldBox.x) / worldBox.w) * 100}%`,
  top: `${((rect.y - worldBox.y) / worldBox.h) * 100}%`,
  width: `${(rect.w / worldBox.w) * 100}%`,
  height: `${(rect.h / worldBox.h) * 100}%`,
});

const CameraModeView: React.FC<CameraModeViewProps> = ({
  layers,
  worldRef,
  worldBox,
  sceneImages,
  stageSize,
  selectedKey,
  editor,
  onSelectLayer,
  onClearSelection,
  getLayerPosition,
  onLayerDragStart,
  onLayerMove,
  onLayerDragEnd,
  onLayerDragCancel,
  tone = false,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [altHeld, setAltHeld] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const {
    editing,
    shown,
    animated,
    keyframe,
    tool,
    viewZoom,
    pan,
    playback,
    applyEditing,
    setViewZoom,
    setPan,
    resetCamera,
    resetView,
    stop,
  } = editor;

  /** Alt 临时反转工具（"留修改余地"：按住 Alt 切成另一种） */
  const effectiveTool: CameraTool = altHeld
    ? tool === "camera"
      ? "elements"
      : "camera"
    : tool;

  const frameRect = cameraRectOf(shown);
  // 另一帧的虚影：一眼看出镜头会往哪走
  const ghostRect =
    animated && playback.t == null
      ? cameraRectOf(
          cameraKeyframe(
            editor.camera,
            keyframe === "start" ? "end" : "start",
          ),
        )
      : null;

  /**
   * 视图"适配"的基准：世界参考框再外扩 8%。
   *
   * <p>不直接用世界框——它含「一帧余地」，适配后真正的内容只占屏幕 1/3，
   * 一进摄像机视图就得先放大才能干活。
   */
  const viewBox = useMemo(() => {
    const padding = Math.max(worldRef.w, worldRef.h) * 0.08;
    return {
      x: worldRef.x - padding,
      y: worldRef.y - padding,
      w: worldRef.w + padding * 2,
      h: worldRef.h + padding * 2,
    };
  }, [worldRef]);

  const transform = useMemo(
    () => viewTransformOf(stageSize, worldBox, viewZoom, pan, viewBox),
    [stageSize, worldBox, viewZoom, pan, viewBox],
  );

  /* ===================== 拖动（移镜 / 平移视图） ===================== */

  const cameraDragRef = useRef<{
    startClient: { x: number; y: number };
    startCamera: CameraKeyframe;
  } | null>(null);
  const panDragRef = useRef<{
    startClient: { x: number; y: number };
    startPan: { x: number; y: number };
  } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // 一动手就停播：否则镜头一边被动画推、一边被手推
    if (playback.playing) stop();
    const target = event.target as HTMLElement;

    // 空格 + 拖动：平移视图（优先级最高，任何工具下都能用）
    if (spaceHeld) {
      panDragRef.current = {
        startClient: { x: event.clientX, y: event.clientY },
        startPan: { x: pan.x, y: pan.y },
      };
      stageRef.current?.setPointerCapture?.(event.pointerId);
      return;
    }

    // 取景框的边框带永远是"移镜"手柄；工具=移镜时整块都能拖
    const onFrameEdge = target?.dataset?.cameraEdge === "1";
    if (onFrameEdge || effectiveTool === "camera") {
      cameraDragRef.current = {
        startClient: { x: event.clientX, y: event.clientY },
        startCamera: editing,
      };
      stageRef.current?.setPointerCapture?.(event.pointerId);
    }
    // 工具=移元素且没点在边框上：交给 PreviewHitLayer 处理
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const cameraDrag = cameraDragRef.current;
    if (cameraDrag) {
      const worldDelta = {
        x: (event.clientX - cameraDrag.startClient.x) / (transform.scale || 1),
        y: (event.clientY - cameraDrag.startClient.y) / (transform.scale || 1),
      };
      applyEditing(moveCameraBy(cameraDrag.startCamera, worldDelta, worldBox));
      return;
    }

    const panDrag = panDragRef.current;
    if (panDrag) {
      setPan({
        x: panDrag.startPan.x + (event.clientX - panDrag.startClient.x),
        y: panDrag.startPan.y + (event.clientY - panDrag.startClient.y),
      });
    }
  };

  const handlePointerUp = () => {
    cameraDragRef.current = null;
    panDragRef.current = null;
  };

  /* ===================== 滚轮：推拉镜头 / 缩放视图 ===================== */

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (playback.playing) stop();
      const rect = element.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      if (event.ctrlKey || event.metaKey) {
        // 视图缩放（只看近看远，不动镜头）
        const next = zoomViewAt(
          point,
          stageSize,
          worldBox,
          viewZoom,
          pan,
          Math.exp(-event.deltaY * 0.002),
          viewBox,
        );
        setViewZoom(next.viewZoom);
        setPan(next.pan);
        return;
      }

      // 推拉镜头：以指针下的世界点为锚
      const anchor = cssToWorld(point, transform, worldBox);
      const factor = Math.exp(-event.deltaY * 0.0015);
      applyEditing(zoomCameraAt(editing, editing.zoom * factor, anchor, worldBox));
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [
    stageSize,
    worldBox,
    viewBox,
    viewZoom,
    pan,
    transform,
    editing,
    applyEditing,
    playback,
    setViewZoom,
    setPan,
    stop,
  ]);

  /* ===================== 键盘：Alt 反转工具 / 空格平移 / F 适配 / 0 复位 ===================== */

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Alt") setAltHeld(true);
      if (isTypingTarget(event.target)) return;

      if (event.code === "Space") {
        event.preventDefault();
        setSpaceHeld(true);
        return;
      }
      const key = event.key?.toLowerCase();
      if (key === "f") {
        resetView();
        return;
      }
      if (event.key === "0") {
        resetCamera();
      }
    },
    [resetCamera, resetView],
  );

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") setAltHeld(false);
      if (event.code === "Space") setSpaceHeld(false);
    };
    const handleBlur = () => {
      setAltHeld(false);
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [handleKeyDown]);

  /* ===================== 渲染 ===================== */

  const worldSize: ImageSize = { width: worldBox.w, height: worldBox.h };

  /** 世界层（坐标平移到世界框原点，百分比才对） */
  const worldLayers = useMemo(
    () =>
      layers
        .filter((layer) => layer.space === "world")
        .map((layer) => ({
          ...layer,
          outRect: {
            x: layer.baseRect.x - worldBox.x,
            y: layer.baseRect.y - worldBox.y,
            w: layer.baseRect.w,
            h: layer.baseRect.h,
          },
        })),
    [layers, worldBox],
  );

  const sceneItems = useMemo<SceneLayerItem[]>(
    () =>
      worldLayers.flatMap((layer) => {
        const src = sceneImages[layer.key];
        return src
          ? [{ key: layer.key, src, rect: layer.outRect, dim: layer.dim }]
          : [];
      }),
    [worldLayers, sceneImages],
  );

  /**
   * 选中的世界图层：世界视图里补一层**不可交互**的选中框。
   *
   * <p>负责画 `.preview-hit.selected` 的热区层只在「移元素」工具下挂载；
   * 而"属性面板点卡片 → 临时切世界视图定位"走进来时工具仍是「移镜」，
   * 不画这一层的话用户看不到自己刚点的是哪张素材。
   * 「移元素」工具下热区层自己会画，这里不重复。
   */
  const selectedWorldLayer =
    effectiveTool === "elements"
      ? null
      : worldLayers.find((layer) => layer.key === selectedKey) ?? null;

  return (
    <div
      ref={stageRef}
      className={`camera-stage${spaceHeld ? " panning" : ""}${
        effectiveTool === "elements" ? " editing-elements" : ""
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="camera-world"
        style={{
          left: transform.left,
          top: transform.top,
          width: transform.width,
          height: transform.height,
        }}
      >
        {/* 世界参考框：背景归位范围，镜头夹取的基准 */}
        <div className="camera-world-ref" style={rectStyle(worldRef, worldBox)} />

        <PreviewSceneLayer items={sceneItems} frame={worldSize} tone={tone} />

        {/* 选中框：只做提示，不吃事件（拖动仍然交给下面的热区层 / 取景框边框） */}
        {selectedWorldLayer && (
          <div
            className="camera-selected-outline"
            style={rectStyle(selectedWorldLayer.outRect, worldBox)}
            data-testid="camera-selected-outline"
            title={`已选中：${selectedWorldLayer.label}`}
          />
        )}

        {effectiveTool === "elements" && (
          <PreviewHitLayer
            layers={worldLayers}
            frame={worldSize}
            selectedKey={selectedKey}
            onSelect={onSelectLayer}
            onClear={onClearSelection}
            getLayerPosition={getLayerPosition}
            onLayerDragStart={onLayerDragStart}
            onLayerMove={onLayerMove}
            onLayerDragEnd={onLayerDragEnd}
            onLayerDragCancel={onLayerDragCancel}
            worldPerCssPixel={1 / (transform.scale || 1)}
          />
        )}

        {/* 另一帧的虚影：不挡事件，只用来提示镜头会往哪走 */}
        {ghostRect && (
          <div
            className="camera-frame-ghost"
            style={rectStyle(ghostRect, worldBox)}
            title={keyframe === "start" ? "终点取景框" : "起点取景框"}
          />
        )}

        {/* 取景框：框外压暗，四边各一条可拖的边框带 */}
        <div className="camera-frame" style={rectStyle(frameRect, worldBox)}>
          <span className="camera-frame-label">🎥 {shown.zoom.toFixed(2)}×</span>
          {FRAME_EDGES.map((side) => (
            <div
              key={side}
              data-camera-edge="1"
              className={`camera-frame-edge edge-${side}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CameraModeView;
