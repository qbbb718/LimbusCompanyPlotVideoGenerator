/**
 * @module 摄像机模式（世界视图）
 *
 * 「最终效果」看的是后端渲出来的成片；这个模式看的是**没渲染 UI 的世界**：
 * 背景全图 + 立绘 + 临时图片铺在一块可缩放/平移的画布上，上面浮着一个 16:9 的取景框。
 *
 * <h3>交互</h3>
 * <table>
 *   <tr><td>拖动</td><td>移镜（默认工具）；按住 Alt 临时切成"移元素"</td></tr>
 *   <tr><td>拖动取景框的边框</td><td>始终是移镜（不管当前工具）</td></tr>
 *   <tr><td>滚轮</td><td>推拉镜头（以指针为中心）</td></tr>
 *   <tr><td>Ctrl + 滚轮</td><td>缩放**视图**（只是看得更近，不影响成片）</td></tr>
 *   <tr><td>空格 + 拖动</td><td>平移视图</td></tr>
 *   <tr><td>F / 0</td><td>适配视图 / 镜头复位</td></tr>
 * </table>
 *
 * <p>世界边界：参考框（背景归位框 ∪ 画布）每边再留一个取景框的余地，镜头最多摇到
 * 「世界完全不在画面里」为止——夹取逻辑在 previewLayout.clampCamera，这里只负责调用。
 *
 * <p>元素拖动直接复用最终效果模式那套（PreviewHitLayer + previewDrag），
 * 只是把坐标系换成世界坐标：给 hit 层传 `worldPerCssPixel = 1 / 视图缩放`。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImageSize, PreviewLayer, PreviewRect, RecordCamera } from "./previewLayout";
import PreviewSceneLayer from "./PreviewSceneLayer";
import type { SceneLayerItem } from "./PreviewSceneLayer";
import PreviewHitLayer from "./PreviewHitLayer";
import type { DragPoint } from "./previewDrag";
import type { CameraKeyframe, CameraEasing } from "./cameraView";
import { useCameraPlayback } from "./useCameraPlayback";
import {
  CAMERA_EASINGS,
  DEFAULT_CAMERA_EASING,
  IDENTITY_CAMERA,
  cameraAt,
  cameraKeyframe,
  cameraMoveFrames,
  cameraProgressOf,
  isAnimatedCamera,
  withKeyframe,
  cameraRectOf,
  cssToWorld,
  moveCameraBy,
  normalizeCamera,
  viewTransformOf,
  zoomCameraAt,
  zoomViewAt,
} from "./cameraView";

/** 摄像机模式的两把工具 */
export type CameraTool = "camera" | "elements";

interface CameraModeViewProps {
  /** 全量图层（世界层 + UI 层；这里只用世界层） */
  layers: PreviewLayer[];
  /** 世界参考框（背景归位框 ∪ 画布） */
  worldRef: PreviewRect;
  /** 世界框 = 参考框 + 每边一个取景框余地（镜头可活动范围） */
  worldBox: PreviewRect;
  camera: RecordCamera | undefined;
  /** 图层 key → 原图地址 */
  sceneImages: Record<string, string>;
  /** 当前记录的时长（帧），播放摇镜用 */
  durationFrames: number;
  /** 舞台可用尺寸（CSS 像素） */
  stageSize: ImageSize;
  selectedKey: string | null;
  onCameraChange: (camera: RecordCamera) => void;
  onSelectLayer: (layer: PreviewLayer) => void;
  onClearSelection?: () => void;
  /** 元素拖动（与最终效果模式共用） */
  getLayerPosition: (layer: PreviewLayer) => DragPoint | null;
  onLayerDragStart: (layer: PreviewLayer, start: DragPoint) => void;
  onLayerMove: (layer: PreviewLayer, position: DragPoint) => void;
  onLayerDragEnd: (layer: PreviewLayer) => void;
  onLayerDragCancel: (layer: PreviewLayer) => void;
  /** 「铺满背景」：把当前背景放大到盖住取景框；不传则按钮隐藏 */
  onCoverBackground?: () => void;
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
  camera,
  sceneImages,
  durationFrames,
  stageSize,
  selectedKey,
  onCameraChange,
  onSelectLayer,
  onClearSelection,
  getLayerPosition,
  onLayerDragStart,
  onLayerMove,
  onLayerDragEnd,
  onLayerDragCancel,
  onCoverBackground,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [tool, setTool] = useState<CameraTool>("camera");
  const [altHeld, setAltHeld] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [viewZoom, setViewZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  /** Alt 临时反转工具（按你说的"留修改余地"：默认移镜，按住 Alt 变成移元素） */
  const effectiveTool: CameraTool = altHeld
    ? tool === "camera"
      ? "elements"
      : "camera"
    : tool;

  const normalized = normalizeCamera(camera);
  /** 正在编辑哪一帧：起点还是终点（终点缺省时与起点重合，拖一下就自动生成 to） */
  const [keyframe, setKeyframe] = useState<"start" | "end">("start");
  /** 运镜时长输入框的草稿：允许中途为空，失焦时回落到真实值 */
  const [moveDraft, setMoveDraft] = useState<string | null>(null);
  const editing = cameraKeyframe(normalized, keyframe);
  const animated = isAnimatedCamera(normalized);
  /** 运镜时长（帧）：播放就播这么多帧，走完停住 */
  const moveFrames = cameraMoveFrames(normalized);
  /** 记录比运镜还短时，按记录长度播（与导出一样会被截断） */
  const playFrames = durationFrames > 0 ? Math.min(moveFrames, durationFrames) : moveFrames;
  const playback = useCameraPlayback(playFrames);
  // 播放时取景框走插值，否则停在被编辑的那一帧
  const shown =
    playback.t != null
      ? cameraAt(normalized, cameraProgressOf(playback.elapsedFrames, moveFrames))
      : editing;
  const frameRect = cameraRectOf(shown);
  // 另一帧的虚影：一眼看出镜头会往哪走
  const ghostRect =
    animated && playback.t == null
      ? cameraRectOf(cameraKeyframe(normalized, keyframe === "start" ? "end" : "start"))
      : null;

  /** 把改动写回"正在编辑的那一帧" */
  const applyEditing = useCallback(
    (next: CameraKeyframe) => onCameraChange(withKeyframe(camera, keyframe, next)),
    [camera, keyframe, onCameraChange],
  );

  /**
   * 视图"适配"的基准：世界参考框再外扩 8%。
   *
   * <p>不直接用世界框——它含「一帧余地」，适配后真正的内容只占屏幕 1/3，
   * 一进摄像机模式就得先放大才能干活。
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
    startCamera: RecordCamera;
  } | null>(null);
  const panDragRef = useRef<{
    startClient: { x: number; y: number };
    startPan: { x: number; y: number };
  } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // 一动手就停播：否则镜头一边被动画推、一边被手推
    if (playback.playing) playback.stop();
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
      if (playback.playing) playback.stop();
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
  }, [stageSize, worldBox, viewBox, viewZoom, pan, transform, editing, normalized, applyEditing, playback]);

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
        setViewZoom(1);
        setPan({ x: 0, y: 0 });
        return;
      }
      if (event.key === "0") {
        applyEditing(IDENTITY_CAMERA);
      }
    },
    [applyEditing],
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

  const zoomBy = (factor: number) => {
    applyEditing(
      zoomCameraAt(editing, editing.zoom * factor, {
        x: editing.centerX,
        y: editing.centerY,
      }, worldBox),
    );
  };

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

        <PreviewSceneLayer items={sceneItems} frame={worldSize} />

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

      <div className="camera-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <div className="camera-tool-group" role="group" aria-label="编辑哪一帧">
          <button
            type="button"
            className={keyframe === "start" ? "active" : ""}
            onClick={() => setKeyframe("start")}
            title="编辑起点镜头（= 没有 to 时就是这条记录唯一的镜头）"
          >
            ◆ 起点
          </button>
          <button
            type="button"
            className={keyframe === "end" ? "active" : ""}
            onClick={() => setKeyframe("end")}
            title="编辑终点镜头；拖一下就会自动生成「起止镜头」"
          >
            ◇ 终点
          </button>
        </div>

        {animated && (
          <select
            className="camera-easing-select"
            value={normalized.easing ?? DEFAULT_CAMERA_EASING}
            onChange={(event) =>
              onCameraChange({
                ...normalized,
                easing: event.target.value as CameraEasing,
              })
            }
            title="起点 → 终点之间的缓动"
          >
            {CAMERA_EASINGS.map((easing) => (
              <option key={easing} value={easing}>
                {easing === "linear"
                  ? "匀速"
                  : easing === "easeIn"
                    ? "慢入"
                    : easing === "easeOut"
                      ? "慢出"
                      : "慢入慢出"}
              </option>
            ))}
          </select>
        )}

        {animated && (
          <label className="camera-move-frames" title="镜头从起点走到终点用多少帧（30fps，最小 1）">
            运镜
            <input
              type="number"
              min={1}
              step={1}
              value={moveDraft ?? String(moveFrames)}
              onChange={(event) => {
                const raw = event.target.value;
                setMoveDraft(raw);
                const next = Math.round(Number(raw));
                if (Number.isFinite(next) && next >= 1) {
                  onCameraChange({ ...normalized, moveFrames: Math.min(9999, next) });
                }
              }}
              onBlur={() => setMoveDraft(null)}
            />
            帧
          </label>
        )}

        <button
          type="button"
          className={playback.playing ? "active" : ""}
          onClick={() => (playback.playing ? playback.stop() : playback.play())}
          disabled={!animated}
          title={animated ? "按记录时长播放一遍镜头" : "先编辑终点镜头，才有可播的动画"}
        >
          {playback.playing ? "⏹ 停止" : "▶ 播放"}
        </button>

        <div className="camera-tool-group" role="group" aria-label="拖动工具">
          <button
            type="button"
            className={tool === "camera" ? "active" : ""}
            onClick={() => setTool("camera")}
            title="拖动移镜（快捷键 C），按住 Alt 临时切成移元素"
          >
            🎥 移镜
          </button>
          <button
            type="button"
            className={tool === "elements" ? "active" : ""}
            onClick={() => setTool("elements")}
            title="拖动移元素（快捷键 E），按住 Alt 临时切成移镜"
          >
            🖐 移元素
          </button>
        </div>

        <span className="camera-zoom-readout">
          {altHeld ? `Alt：${effectiveTool === "camera" ? "移镜" : "移元素"}` : ""}
        </span>

        <span className="camera-center-readout" title="镜头取景中心（世界坐标）">
          中心 {Math.round(shown.centerX)}, {Math.round(shown.centerY)}
        </span>

        <div className="camera-zoom-controls">
          <button type="button" onClick={() => zoomBy(1 / 1.25)} title="拉远（滚轮也以指针为中心推拉）">
            −
          </button>
          <span className="camera-zoom-value">{editing.zoom.toFixed(2)}×</span>
          <button type="button" onClick={() => zoomBy(1.25)} title="推近">
            ＋
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setViewZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          title="视图适配世界（F）"
        >
          适配
        </button>
        <button
          type="button"
          onClick={() => applyEditing(IDENTITY_CAMERA)}
          title="镜头复位（0）"
        >
          复位
        </button>
        {onCoverBackground && (
          <button type="button" onClick={onCoverBackground} title="把背景放大到盖住取景框">
            铺满背景
          </button>
        )}
      </div>

      <div className="camera-hint">
        拖动移镜 · 滚轮推拉 · Ctrl+滚轮缩放视图 · 空格+拖动平移 · F 适配 · 0 复位 · Alt 临时切换工具
      </div>
    </div>
  );
};

export default CameraModeView;
