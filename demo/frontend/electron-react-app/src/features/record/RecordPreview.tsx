import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Record } from "@types";
import ApiService from "@services/ApiService";
import "./RecordEditor.css";
import "./preview/preview.css";
import { buildPreviewGeometry } from "./preview/previewLayout";
import { buildSceneImageMap, UI_IMAGE_URLS } from "./preview/previewAssets";
import { useImageSizes } from "./preview/useImageSizes";
import { useElementSize } from "./preview/useElementSize";
import PreviewSceneLayer from "./preview/PreviewSceneLayer";
import type { SceneLayerItem } from "./preview/PreviewSceneLayer";
import PreviewDebugOverlay from "./preview/PreviewDebugOverlay";
import PreviewHitLayer from "./preview/PreviewHitLayer";
import type { PreviewLayer } from "./preview/previewLayout";

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
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** 正在向后端要新图（**旧图继续显示**，不再像以前那样先卸载再加载，避免闪一下黑） */
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 对位自检：显示几何叠框 */
  const [showRects, setShowRects] = useState(false);
  /** 对位自检：用 DOM 场景层重绘场景（栅格图同时压暗） */
  const [showScene, setShowScene] = useState(false);

  const blobUrlRef = useRef<string | null>(null);
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
        // 1. record 是 dirty 且首次渲染（lastHash 不存在）→ 强制刷新
        // 2. record 是 dirty 且视觉内容自上次渲染后已变化 → 强制刷新
        // 3. record 是 clean 或内容未变 → 使用磁盘缓存
        const forceRefresh = currentlyDirty && lastHash !== currentHash;

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
  }, [selectedRecord, videoWidth, videoHeight, plot, applyPreviewUrl]);

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
      }),
    [selectedRecord, plot, videoWidth, videoHeight, sceneImages, sizes],
  );

  /** 场景层的绘制列表（只要世界坐标的图层） */
  const sceneItems = useMemo<SceneLayerItem[]>(
    () =>
      geometry.layers
        .filter((layer) => layer.space === "world")
        .map((layer) => ({
          key: layer.key,
          src: sceneImages[layer.key] ?? "",
          rect: layer.outRect,
          dim: layer.dim,
        }))
        .filter((item) => item.src),
    [geometry, sceneImages],
  );

  const frameSize = { width: videoWidth || 1920, height: videoHeight || 1080 };

  return (
    <div className="preview-container">
      <div className="preview-image" ref={containerRef}>
        {stage && (
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
                // 开着 DOM 场景层时把栅格图压暗，才能看出两层是不是严丝合缝
                style={{ opacity: showScene ? 0.35 : 1 }}
              />
            )}

            {showScene && sceneItems.length > 0 && (
              <PreviewSceneLayer items={sceneItems} frame={frameSize} />
            )}

            {/* 热区：点元素 → 切页签 + 定位到属性面板；点空白 → 取消选中 */}
            <PreviewHitLayer
              layers={geometry.layers}
              frame={frameSize}
              selectedKey={selectedElementKey}
              onSelect={(layer) => onSelectElement?.(layer)}
              onClear={onClearSelection}
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
