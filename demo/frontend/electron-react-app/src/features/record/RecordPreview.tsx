import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Record } from "@types";
import ApiService from "@services/ApiService";
import "./RecordEditor.css";
import "./preview/preview.css";
import { buildPreviewGeometry, sceneToOutput, DESIGN_HEIGHT, DESIGN_WIDTH } from "./preview/previewLayout";
import type { PreviewLayer } from "./preview/previewLayout";
import { readLayerPosition } from "./preview/previewDrag";
import type { DragPoint } from "./preview/previewDrag";
import { buildSceneImageMap, UI_IMAGE_URLS } from "./preview/previewAssets";
import { useImageSizes } from "./preview/useImageSizes";
import { useElementSize } from "./preview/useElementSize";
import PreviewSceneLayer from "./preview/PreviewSceneLayer";
import type { SceneLayerItem } from "./preview/PreviewSceneLayer";
import PreviewDebugOverlay from "./preview/PreviewDebugOverlay";
import PreviewHitLayer from "./preview/PreviewHitLayer";
import CameraModeView from "./preview/CameraModeView";
import {
  cameraAt,
  cameraMoveFrames,
  cameraProgressOf,
  coverScaleForBackground,
  isAnimatedCamera,
} from "./preview/cameraView";
import { sceneLayerKey } from "./preview/previewLayout";
import type { RecordCamera } from "@types";
import { useCameraPlayback } from "./preview/useCameraPlayback";

interface RecordPreviewProps {
  selectedRecord: Record;
  videoWidth: number;
  videoHeight: number;
  /**
   * 是否按剧情模式渲染（全局设置里的"剧情类型"：剧情 → true，人格故事 → false）。
   * 后端 renderPre(record, plot, w, h) 用它决定是否叠加立绘/黑边与 0.8 缩放，
   * 所以切换剧情类型时预览图必须重新取一次（见下面的 useEffect 依赖）。
   */
  plot: boolean;
  records: Record[];
  selectedRecordIndex: number;
  setSelectedRecordIndex: (index: number) => void;
  /** 当前选中的元素（画选中框）；不传表示没有选中 */
  selectedElementKey?: string | null;
  /**
   * 点击预览里的元素。由 RecordEditor 决定「切到哪个页签、定位到属性面板哪一块」，
   * 预览组件本身不关心页签（见 previewTargets.ts）。
   */
  onSelectElement?: (layer: PreviewLayer) => void;
  /** 点击空白处：取消选中 */
  onClearSelection?: () => void;

  /* ===== P2 拖拽：四个都用上才开启拖动 ===== */
  /** 真正开始拖动（越过阈值）时回调一次，带上起点，供 Esc 还原 */
  onElementDragStart?: (layer: PreviewLayer, start: DragPoint) => void;
  /** 拖动中：元素的新位置（设计画布像素，已按帧合并） */
  onElementDragMove?: (layer: PreviewLayer, position: DragPoint) => void;
  /** 松手 */
  onElementDragEnd?: (layer: PreviewLayer) => void;
  /** Esc / 指针取消：调用方负责把位置还原到起点 */
  onElementDragCancel?: (layer: PreviewLayer) => void;
  /**
   * 强制重渲染令牌（每次变化都跳过后端磁盘缓存重渲一张）。
   *
   * <p>用于"撤销"这种把记录改回**旧内容**的操作：后端缓存按 `uuid + 尺寸 + plot` 存，
   * 记录变干净（isDirty=false）时会命中上一次渲的图，画面就停在撤销之前的样子。
   */
  refreshToken?: number;
  /** 摄像机模式里调整了镜头（由 RecordEditor 写回记录） */
  onCameraChange?: (camera: RecordCamera) => void;
  /** 「铺满背景」：把第 index 张背景的 scale 改成给定值 */
  onBackgroundScaleChange?: (index: number, scale: number) => void;
}

/**
 * 预览请求的防抖时间。
 *
 * <p>以前每改一个值都会立刻发一次渲染请求：拖滑杆/拖元素时一秒钟能发几十次，
 * 后端排队渲染、预览图一路闪。这里合并成"停手 150ms 之后只发一次"，
 * 既不影响"改完立刻看到结果"的手感，又把请求量压到原来的几十分之一。
 */
const PREVIEW_DEBOUNCE_MS = 150;

/**
 * 剧情记录预览。
 *
 * <p>结构分成三层，后续的交互/摄像机能力都挂在这三层上：
 * <ol>
 *   <li><b>栅格图</b>：后端 {@code POST /api/records/preview} 渲染的 PNG，画面的唯一真值；</li>
 *   <li><b>几何</b>：{@code previewLayout} 按后端同一套公式算出每个元素在图上的矩形；</li>
 *   <li><b>叠层</b>：DOM 场景层（可重绘背景/立绘/临时图片）与调试叠框。</li>
 * </ol>
 *
 * <p>第 2、3 层目前只用于「对位自检」（右下角的「▦ 框」「◧ 场景」开关）：
 * 叠框与画面严丝合缝，才说明几何是准的，之后的点击命中、拖拽、摄像机取景才有意义。
 */
const RecordPreview: React.FC<RecordPreviewProps> = ({
  selectedRecord,
  videoWidth,
  videoHeight,
  plot,
  records,
  selectedRecordIndex,
  setSelectedRecordIndex,
  selectedElementKey = null,
  onSelectElement,
  onClearSelection,
  onElementDragStart,
  onElementDragMove,
  onElementDragEnd,
  onElementDragCancel,
  refreshToken = 0,
  onCameraChange,
  onBackgroundScaleChange,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** 正在向后端要新图（**旧图继续显示**，不再像以前那样先卸载再加载，避免闪一下黑） */
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 对位自检：显示几何叠框 */
  const [showRects, setShowRects] = useState(false);
  /** 对位自检：用 DOM 场景层重绘场景（栅格图同时压暗） */
  const [showScene, setShowScene] = useState(false);
  /**
   * 正在拖动元素。
   *
   * <p>拖拽期间**隐藏栅格图、改用 DOM 场景层**：栅格图是后端渲的，一次要几十上百毫秒，
   * 跟不上鼠标；DOM 场景层用同一套几何，每一帧都能立刻重画。
   * 同时**暂停预览图请求**，松手之后才重新要一张（否则拖动中会白渲十几次）。
   */
  const [isDragging, setIsDragging] = useState(false);
  /**
   * 预览模式：`effect` = 看后端渲的成片；`camera` = 看没渲染 UI 的世界并调镜头。
   *
   * <p>摄像机模式不显示栅格图（那张图是取景后的结果，没法用来显示世界全图），
   * 也**不发预览图请求**——镜头一动记录就变，每动一下都让后端重渲一遍纯属浪费。
   */
  const [viewMode, setViewMode] = useState<"effect" | "camera">("effect");
  /** 运镜时长（帧）：预览与成片用同一个数字，这里只是把它读出来 */
  const moveFrames = cameraMoveFrames(selectedRecord.camera);
  /** 记录比运镜还短时按记录播（与导出一样会被截断） */
  const playFrames =
    (selectedRecord.durationFrames ?? 0) > 0
      ? Math.min(moveFrames, selectedRecord.durationFrames)
      : moveFrames;
  /** 摇镜预览：播放这几帧，DOM 场景层跟着重投影 */
  const playback = useCameraPlayback(playFrames);

  const blobUrlRef = useRef<string | null>(null);
  // 上次渲染时用的强制刷新令牌：撤销之后记录"变回旧内容"，磁盘缓存会命中旧图，必须跳过缓存
  const lastRefreshTokenRef = useRef(refreshToken);
  // 记录上次成功渲染时的视觉内容摘要。当 record 内容变化（编辑角色/背景/说话人等）
  // 时摘要不匹配，即使 isDirty 保持 true 未翻转，也能正确触发 forceRefresh。
  const lastVisualHashRef = useRef<Map<string, string>>(new Map());

  /** 提取影响预览图渲染的视觉属性摘要 */
  const visualHash = (r: Record): string =>
    JSON.stringify({
      chars: r.chars,
      bg: r.bg,
      tempImages: r.tempImages,
      audioCommands: r.audioCommands,
      effects: r.effects,
      dialogue: {
        text: r.dialogue?.text,
        speakerC: r.dialogue?.speakerC,
        speakerName: r.dialogue?.speakerName,
        faction: r.dialogue?.faction,
        align: r.dialogue?.align,
        emotion: r.dialogue?.emotion,
        location: r.dialogue?.location,
        // 自由文本样式：任一开关变化都必须重渲染，否则后端会返回旧的缓存图
        freeText: r.dialogue?.freeText,
        bold: r.dialogue?.bold,
        italic: r.dialogue?.italic,
        hideUI: r.dialogue?.hideUI,
        freeTextColor: r.dialogue?.freeTextColor,
        freeTextFontSize: r.dialogue?.freeTextFontSize,
        freeTextX: r.dialogue?.freeTextX,
        freeTextY: r.dialogue?.freeTextY,
      },
      // 镜头也算视觉内容：改了取景必须重新取图，否则预览图停在旧构图
      camera: r.camera,
    });

  /**
   * 切换显示的预览图，并延迟释放上一张的 blob URL。
   *
   * <p>必须在**新图已经挂到 DOM 之后**才 revoke 旧 URL：以前是"先 revoke 再请求"，
   * 中途 `<img>` 的 src 指向已释放的 blob，画面会白一下。
   */
  const applyPreviewUrl = useCallback((next: string | null) => {
    const previous = blobUrlRef.current;
    blobUrlRef.current = next;
    setPreviewUrl(next);
    if (previous && previous !== next) {
      window.setTimeout(() => URL.revokeObjectURL(previous), 500);
    }
  }, []);

  useEffect(() => {
    // 拖拽期间不请求预览图：画面由 DOM 场景层实时顶上，
    // 松手后 isDragging 变 false，这个 effect 会带着最新记录重新跑一次。
    // 摄像机模式同理：那张图是取景后的成片，用不上；镜头一动就重渲纯属浪费。
    if (isDragging || viewMode === "camera" || playback.playing) return undefined;

    let cancelled = false;

    const loadPreview = async () => {
      if (!selectedRecord) return;

      setIsRefreshing(true);
      try {
        const uuid = selectedRecord.uuid;
        const currentlyDirty = selectedRecord.isDirty === true;
        const lastHash = lastVisualHashRef.current.get(uuid);
        const currentHash = visualHash(selectedRecord);

        // 决定是否强制刷新：
        // 1. 外部要求强制刷新（撤销 / 还原）→ 跳过磁盘缓存
        // 2. record 是 dirty 且视觉内容自上次渲染后已变化 → 强制刷新
        // 3. record 是 clean 或内容未变 → 使用磁盘缓存
        const tokenChanged = lastRefreshTokenRef.current !== refreshToken;
        if (tokenChanged) lastRefreshTokenRef.current = refreshToken;
        const forceRefresh =
          tokenChanged || (currentlyDirty && lastHash !== currentHash);

        const url = await ApiService.getRecordPreview(
          selectedRecord,
          videoWidth || 1920,
          videoHeight || 1080,
          forceRefresh,
          plot,
        );

        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }

        // 渲染成功后记录本次视觉摘要
        lastVisualHashRef.current.set(uuid, currentHash);
        applyPreviewUrl(url);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("渲染预览图失败:", err);
          setError("预览图渲染失败，请检查后端是否正常运行");
          applyPreviewUrl(null);
        }
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };

    // 防抖：连续编辑（打字 / 拖滑杆 / 拖元素）期间只发最后一次请求
    setIsRefreshing(true);
    const timer = window.setTimeout(() => {
      void loadPreview();
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // plot 变化（切换"剧情类型"）时重新取图：后端缓存按 plot 分开存，
    // 不需要 forceRefresh，但必须重新请求一次才能拿到另一种样式的图。
    // isDragging 进依赖：松手那一刻要用最新记录补一张。
    // refreshToken 进依赖：撤销要跳过后端磁盘缓存。
    // viewMode 进依赖：从摄像机模式切回最终效果时要立刻补一张（成片按新镜头渲）。
  }, [selectedRecord, videoWidth, videoHeight, plot, applyPreviewUrl, isDragging, refreshToken, viewMode, playback.playing]);

  // 组件卸载时清理 blob URL
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  /* ===================== 舞台尺寸与几何 ===================== */

  const { ref: containerRef, size: containerSize } = useElementSize<HTMLDivElement>();

  /** 舞台 = 在容器里按视频宽高比居中放大的最大矩形（px 绝对定位） */
  const stage = useMemo(() => {
    const containerWidth = containerSize.width;
    const containerHeight = containerSize.height;
    const width = videoWidth || 1920;
    const height = videoHeight || 1080;
    if (containerWidth <= 0 || containerHeight <= 0) return null;

    const scale = Math.min(containerWidth / width, containerHeight / height);
    const stageWidth = Math.max(1, Math.floor(width * scale));
    const stageHeight = Math.max(1, Math.floor(height * scale));
    return {
      left: Math.floor((containerWidth - stageWidth) / 2),
      top: Math.floor((containerHeight - stageHeight) / 2),
      width: stageWidth,
      height: stageHeight,
    };
  }, [containerSize.width, containerSize.height, videoWidth, videoHeight]);

  /** 图层 key → 原图地址（背景 / 立绘 / 临时图片） */
  const sceneImages = useMemo(
    () => buildSceneImageMap(selectedRecord),
    [selectedRecord],
  );

  const imageUrls = useMemo(
    () => [
      ...Object.keys(sceneImages).map((key) => sceneImages[key]),
      UI_IMAGE_URLS.dialogBox,
      UI_IMAGE_URLS.locationPlate,
    ],
    [sceneImages],
  );

  const { sizes } = useImageSizes(imageUrls);

  /** 播放用的镜头（t 时刻）：「最终效果」里摇镜预览就是每帧重算几何 */
  const playbackCamera =
    playback.t !== null
      ? cameraAt(
          selectedRecord.camera,
          cameraProgressOf(playback.elapsedFrames, moveFrames),
        )
      : undefined;

  /** 一条记录在预览图上的全部几何（矩形、世界框、缺失尺寸清单） */
  const geometry = useMemo(
    () =>
      buildPreviewGeometry(selectedRecord, {
        plot,
        videoWidth: videoWidth || 1920,
        videoHeight: videoHeight || 1080,
        sizeOf: (key) => {
          const url = sceneImages[key];
          return url ? sizes[url] : undefined;
        },
        dialogBoxSize: sizes[UI_IMAGE_URLS.dialogBox],
        locationSize: sizes[UI_IMAGE_URLS.locationPlate],
        // 镜头：预览图已经按它取景，热区也要跟着一起投影，否则框和画面对不上。
        // 播放时用插值后的镜头，DOM 场景层才会真的"摇"起来。
        camera: playbackCamera ?? selectedRecord.camera,
      }),
    [selectedRecord, plot, videoWidth, videoHeight, sceneImages, sizes, playbackCamera],
  );

  const frameSize = { width: videoWidth || 1920, height: videoHeight || 1080 };

  /**
   * 场景框在输出图里的矩形：设计画布中间 80%（`0.8` 缩放 + (192,108) 偏移）。
   *
   * <p>成片里场景只画到这一块，四周是黑边；DOM 场景层（播放/对位/拖动）必须按它裁剪，
   * 否则镜头一摇，背景会溢出到黑边上——看起来就是"黑框没了"。
   */
  const sceneBoxRect = sceneToOutput(
    { x: 0, y: 0, w: DESIGN_WIDTH, h: DESIGN_HEIGHT },
    frameSize,
  );

  /**
   * 「铺满背景」：把最上面那张**已加载出尺寸**的背景放大到盖住当前取景框。
   *
   * <p>为什么要它：后端背景是 contain（完整放进目标框），30:9 这种横长条在 scale=1 时
   * 只画成 1920×576、上下留黑，世界也只有画布那么大，镜头根本没地方摇。
   */
  const coverTargetIndex = useMemo(() => {
    const backgrounds = selectedRecord.bg ?? [];
    for (let index = backgrounds.length - 1; index >= 0; index--) {
      const url = sceneImages[sceneLayerKey("background", index)];
      if (url && sizes[url]) return index;
    }
    return -1;
  }, [selectedRecord.bg, sceneImages, sizes]);

  const coverBackground =
    coverTargetIndex >= 0 && onBackgroundScaleChange
      ? () => {
          const background = (selectedRecord.bg ?? [])[coverTargetIndex];
          const url = sceneImages[sceneLayerKey("background", coverTargetIndex)];
          const size = url ? sizes[url] : undefined;
          if (!background || !size) return;
          onBackgroundScaleChange(
            coverTargetIndex,
            coverScaleForBackground(background, size, {
              centerX: selectedRecord.camera?.centerX ?? 960,
              centerY: selectedRecord.camera?.centerY ?? 540,
              zoom: selectedRecord.camera?.zoom ?? 1,
            }),
          );
        }
      : undefined;

  /**
   * 场景层的绘制列表。
   *
   * <p>拖拽期间栅格图会隐藏、由这一层顶上，所以必须把**整幅画面**都画出来，而不只是世界层：
   * 背景/立绘/临时图片 → 边框暗角 → 对话框/地点牌（静态 PNG）。
   * 唯一的缺口是「角色名片」——它由后端按说话人实时生成，前端没有对应图片，
   * 所以拖动的那一两秒里名片会暂时消失（松手后预览图回来就恢复）。
   */
  const sceneItems = useMemo<SceneLayerItem[]>(() => {
    const srcOf = (layer: (typeof geometry.layers)[number]): string => {
      const worldSrc = sceneImages[layer.key];
      if (worldSrc) return worldSrc;
      if (layer.kind === "dialogBox") return UI_IMAGE_URLS.dialogBox;
      if (layer.kind === "locationPlate") return UI_IMAGE_URLS.locationPlate;
      return "";
    };

    const worldItems = geometry.layers
      .filter((layer) => layer.space === "world")
      .map((layer) => ({
        key: layer.key,
        src: srcOf(layer),
        rect: layer.outRect,
        dim: layer.dim,
        // 世界层要裁到场景框；边框与 UI 不裁（见 PreviewSceneLayer 的说明）
        clipWithScene: true,
      }))
      .filter((item) => item.src);

    const uiItems = geometry.layers
      .filter((layer) => layer.space === "design")
      .map((layer) => ({ key: layer.key, src: srcOf(layer), rect: layer.outRect }))
      .filter((item) => item.src);

    /**
     * 边框暗角：后端是 buildBorderMask() 现画的一张 1920×1080 黑色渐隐遮罩，
     * 画在场景画布 (0,0) 再随 0.8 一起缩放 → 预览图上正好是「0.8 场景框」那一块。
     * 这里用纯 CSS 渐变复刻（见 preview.css 的 .preview-scene-border），不读任何素材。
     */
    const borderItem: SceneLayerItem = {
      key: "borderMask",
      className: "preview-scene-border",
      rect: sceneToOutput(
        { x: 0, y: 0, w: DESIGN_WIDTH, h: DESIGN_HEIGHT },
        frameSize,
      ),
    };

    return [...worldItems, borderItem, ...uiItems];
    // frameSize 由 videoWidth/videoHeight 派生，依赖里写原始值更直观
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, sceneImages, sizes, videoWidth, videoHeight]);

  return (
    <div className="preview-container">
      {/* 两种看法：后端渲的成片 / 没渲染 UI 的世界（可移镜） */}
      <div className="preview-mode-bar" role="tablist" aria-label="预览模式">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "effect"}
          className={viewMode === "effect" ? "active" : ""}
          onClick={() => setViewMode("effect")}
          title="看最终成片；点画面里的元素可直接编辑"
        >
          🖼 最终效果
        </button>
        {viewMode === "effect" && (
          <button
            type="button"
            className={playback.playing ? "active" : ""}
            onClick={() => (playback.playing ? playback.stop() : playback.play())}
            disabled={!isAnimatedCamera(selectedRecord.camera)}
            title={
              isAnimatedCamera(selectedRecord.camera)
                ? "按记录时长播放一遍镜头（DOM 近似，台词不参与动画）"
                : "这条记录的镜头不会动：去「摄像机」模式把终点挪一下"
            }
          >
            {playback.playing ? "⏹ 停止" : "▶ 播放"}
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "camera"}
          className={viewMode === "camera" ? "active" : ""}
          onClick={() => setViewMode("camera")}
          title="看没渲染 UI 的世界并调整镜头（背景/立绘/临时图片受镜头影响）"
        >
          🎥 摄像机
        </button>
      </div>
      <div
        className={`preview-image${playback.playing ? " is-playing" : ""}`}
        ref={containerRef}
      >
        {viewMode === "camera" ? (
          <CameraModeView
            layers={geometry.layers}
            worldRef={geometry.worldRef}
            worldBox={geometry.worldBox}
            camera={selectedRecord.camera}
            durationFrames={selectedRecord.durationFrames ?? 0}
            sceneImages={sceneImages}
            stageSize={containerSize}
            selectedKey={selectedElementKey}
            onCameraChange={(camera) => onCameraChange?.(camera)}
            onSelectLayer={(layer) => onSelectElement?.(layer)}
            onClearSelection={onClearSelection}
            getLayerPosition={(layer) =>
              readLayerPosition(selectedRecord, layer.kind, layer.index)
            }
            onLayerDragStart={(layer, start) => {
              onElementDragStart?.(layer, start);
            }}
            onLayerMove={(layer, position) => onElementDragMove?.(layer, position)}
            onLayerDragEnd={(layer) => onElementDragEnd?.(layer)}
            onLayerDragCancel={(layer) => onElementDragCancel?.(layer)}
            onCoverBackground={coverBackground}
          />
        ) : (
          stage && (
          <div
            className="preview-stage"
            style={{
              left: stage.left,
              top: stage.top,
              width: stage.width,
              height: stage.height,
            }}
          >
            {previewUrl && (
              <img
                src={previewUrl}
                alt="记录预览图"
                className="preview-render"
                draggable={false}
                // 拖拽中完全隐藏（位置已经变了，旧图会"拖影"）；
                // 只是打开对位自检的「◧ 场景」时压暗，方便看出两层是否严丝合缝。
                style={{
                  opacity: isDragging || playback.playing ? 0 : showScene ? 0.35 : 1,
                }}
              />
            )}

            {(showScene || isDragging || playback.playing) && sceneItems.length > 0 && (
              <PreviewSceneLayer
                items={sceneItems}
                frame={frameSize}
                clipRect={sceneBoxRect}
              />
            )}

            {/* 热区：点元素 → 切页签 + 定位到属性面板；点空白 → 取消选中 */}
            <PreviewHitLayer
              layers={geometry.layers}
              frame={frameSize}
              selectedKey={selectedElementKey}
              onSelect={(layer) => onSelectElement?.(layer)}
              onClear={onClearSelection}
              // 拖拽：位置从当前记录里读（立绘读 adjX/adjY，背景与临时图片读 posX/posY）
              getLayerPosition={(layer) =>
                readLayerPosition(selectedRecord, layer.kind, layer.index)
              }
              onLayerDragStart={(layer, start) => {
                setIsDragging(true);
                onElementDragStart?.(layer, start);
              }}
              onLayerMove={(layer, position) =>
                onElementDragMove?.(layer, position)
              }
              onLayerDragEnd={(layer) => {
                setIsDragging(false);
                onElementDragEnd?.(layer);
              }}
              onLayerDragCancel={(layer) => {
                setIsDragging(false);
                onElementDragCancel?.(layer);
              }}
            />

            {showRects && (
              <PreviewDebugOverlay layers={geometry.layers} frame={frameSize} />
            )}

            {isRefreshing && previewUrl && (
              <div className="preview-refresh-chip">渲染中…</div>
            )}

            {!previewUrl && isRefreshing && (
              <div className="preview-status">
                <div className="preview-spinner" />
                <span>渲染预览中...</span>
              </div>
            )}

            {!previewUrl && !isRefreshing && error && (
              <div className="preview-status preview-error">
                <span>{error}</span>
              </div>
            )}

            {!previewUrl && !isRefreshing && !error && (
              <div className="preview-placeholder">预览图区域</div>
            )}

            {/* 对位自检开关：默认很淡，鼠标移上去才明显，不干扰正常预览 */}
            <div className="preview-debug-bar">
              {showRects && geometry.missingSizes.length > 0 && (
                <span
                  className="preview-debug-missing"
                  title={`这些图层缺少原图尺寸，未参与计算：${geometry.missingSizes.join(", ")}`}
                >
                  {geometry.missingSizes.length} 张缺尺寸
                </span>
              )}



              <button
                type="button"
                className={showRects ? "active" : ""}
                onClick={() => setShowRects((value) => !value)}
                title="显示几何计算出的元素框（对位自检：框应与画面里的立绘/背景重合）"
              >
                ▦ 框
              </button>

              <button
                type="button"
                className={showScene ? "active" : ""}
                onClick={() => setShowScene((value) => !value)}
                title="用 DOM 场景层重绘背景/立绘/临时图片（对位自检：应与画面完全重合）"
              >
                ◧ 场景
              </button>

              

            </div>
          </div>
          )
        )}
      </div>
      <div className="preview-timeline">
        <div className="timeline-track">
          {records.map((record, index) => (
            <div
              key={record.uuid}
              className={`timeline-block ${index === selectedRecordIndex ? "active" : ""}`}
              title={`#${index + 1} ${record.dialogue.freeText ? "自由文本" : record.dialogue.speakerName || "旁白"}: ${record.dialogue.text.substring(0, 20)}`}
              onClick={() => setSelectedRecordIndex(index)}
              style={{ width: `${100 / records.length}%` }}
            >
              <span className="timeline-label">{index + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecordPreview;
