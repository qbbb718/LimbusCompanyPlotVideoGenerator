import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { loadImageElement } from "@features/common/utils/imageUtils";
import { ImageSize, PortraitCropState } from "@features/common/utils/portraitCrop";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  PortraitAlignment,
  alignmentFromCrop,
  clampAlignmentScale,
  cropCenterX,
  defaultAlignment,
  deriveCropFromAlignment,
  headBoxInFrame,
  isSixteenByNine,
  portraitRectInFrame,
  screenshotRectInFrame,
} from "@features/common/utils/referenceCrop";
import {
  ReferenceView,
  VIEW_ZOOM_STEP,
  Viewport,
  WHEEL_PORTRAIT_ZOOM_SENSITIVITY,
  actualSizeView,
  clampView,
  clampViewScale,
  fitView,
  formatZoomPercent,
  isActualSizeView,
  isFitView,
  normalizeWheelDelta,
  parseZoomPercent,
  wheelZoomFactor,
  zoomPercent,
  zoomViewAt,
} from "@features/common/utils/referenceView";
import createLogger from "../utils/logger";
import "./ReferenceCropDialog.css";

const log = createLogger("ReferenceCropDialog");

/** 立绘叠加层的默认不透明度：太低看不出对齐，太高看不见截图底下的原角色 */
const DEFAULT_OPACITY = 0.55;
/** 立绘缩放的按钮步长（5%）；更细的调整用 Alt+滚轮（每格约 3%） */
const ZOOM_STEP = 1.05;
/** 方向键微调的步长（帧像素）；按住 Shift 走大步 */
const NUDGE_STEP = 1;
const NUDGE_STEP_LARGE = 10;

interface ReferenceCropDialogProps {
  /** 正在编辑的立绘（data URL / blob URL / 后端 URL 都行） */
  portraitUrl: string;
  /** 当前裁剪参数（打开时以它为初始对齐，可能是还没保存的裁剪器状态） */
  currentCrop: PortraitCropState;
  /** 角色身高（cm）：决定靶带（头部方框）在画面里的纵向位置 */
  characterHeight?: number;
  /** 立绘自身的水平微调（设计画布像素） */
  adjX?: number;
  adjY?: number;
  /** 点「写回裁剪框」：参数是原图像素的裁剪框 */
  onApply: (crop: PortraitCropState) => void;
  onClose: () => void;
}

/**
 * @component 按截图反推裁剪框
 *
 * <p>「资源管理 → 角色 → 编辑立绘 → 按截图校准」打开：玩家自己截的一张 16:9 游戏画面当底板，
 * 待校准的立绘半透明叠在上面。把立绘缩放到与截图里的角色**一样大**、并把**头部竖直中心**
 * 对到那条蓝色靶带的中心线上，点「写回裁剪框」就把 `faceX / faceY / length` 反推出来
 * 写回裁剪器。
 *
 * <p><b>只取缩放和竖直位置</b>：`length` 由缩放决定，`faceY` 由头部方框中心的竖直位置决定
 * （角色身高 → `anchorY`）；**水平方向完全不从截图读** —— 原作里角色的左右站位是镜头调度，
 * 同一角色各场景都不一样，拿它反推只会把整个裁剪框带偏。`faceX` 沿用当前裁剪框的水平中心，
 * 只按新的 `length` 重新居中。所以角色站在画面哪个位置都能校准。
 *
 * <p><b>查看视图（缩放 / 平移）与校准数据严格分离</b>：舞台上的放大缩小只是
 * {@link ReferenceView} —— 画面坐标系到 CSS 像素的仿射变换，画在 `.reference-crop-frame` 的
 * `transform` 上。它不参与任何反推计算，所以放大到 400%、平移到角落都不改 `faceX/faceY/length`，
 * 也不影响导出。靶带、立绘、截图都在同一个 frame 里，因而永远同步缩放、保持对齐。
 *
 * <p>这里刻意<b>不做</b>自动图像配准：真实截图里有对话框、其他角色、压暗和特效，
 * 自动匹配容易给出一个"看着差不多"但偏了几十个像素的结果；人眼对齐一次就有唯一解，
 * 而且用户能立刻看出对不对。
 */
const ReferenceCropDialog: React.FC<ReferenceCropDialogProps> = ({
  portraitUrl,
  currentCrop,
  characterHeight,
  adjX = 0,
  adjY = 0,
  onApply,
  onClose,
}) => {
  const [portraitSize, setPortraitSize] = useState<ImageSize | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const [alignment, setAlignment] = useState<PortraitAlignment | null>(null);
  const [screenshot, setScreenshot] = useState<{
    url: string;
    size: ImageSize;
  } | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const [showGuide, setShowGuide] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // ---- 查看视图（只影响"看"，不影响校准结果）----
  const [stage, setStage] = useState<Viewport>({ width: 0, height: 0 });
  const [view, setView] = useState<ReferenceView>({
    scale: 1,
    panX: 0,
    panY: 0,
  });
  /** 缩放比例输入框的草稿：null = 没在编辑，显示当前比例 */
  const [zoomDraft, setZoomDraft] = useState<string | null>(null);
  /** 空格按住 = 平移预备态 */
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  /** 当前拖拽的模式：拖动立绘（校准）还是平移视图 */
  const [dragMode, setDragMode] = useState<"portrait" | "pan" | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 当前视图 / 舞台的最新值：指针与滚轮回调里要用，避免闭包读到旧值 */
  const viewRef = useRef(view);
  const stageRef = useRef(stage);
  /** 当前拖拽的指针与上一次位置（client 坐标） */
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    mode: "portrait" | "pan";
  } | null>(null);
  /** 截图 objectURL：换图 / 关闭时要回收 */
  const screenshotUrlRef = useRef<string | null>(null);
  /** 比例输入框按 Esc：标记"这次失焦是取消"，别把被放弃的输入提交上去 */
  const cancelZoomRef = useRef(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  /* ---------------- 立绘尺寸 ---------------- */

  useEffect(() => {
    let cancelled = false;
    setPortraitError(null);
    loadImageElement(portraitUrl).then(
      (image) => {
        if (cancelled) return;
        if (!image.naturalWidth || !image.naturalHeight) {
          setPortraitError("读不到立绘原图尺寸，无法反推裁剪框。");
          return;
        }
        setPortraitSize({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      },
      (error) => {
        if (cancelled) return;
        log("读取立绘尺寸失败", error);
        setPortraitError("立绘图片加载失败，无法反推裁剪框。");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [portraitUrl]);

  /* ---------------- 初始对齐 = 当前裁剪 ---------------- */

  useEffect(() => {
    if (!portraitSize || alignment) return;
    const fromCrop = alignmentFromCrop({
      crop: currentCrop,
      characterHeight,
      adjX,
      adjY,
    });
    const initial =
      fromCrop ?? defaultAlignment({ portraitSize, characterHeight });
    setAlignment(initial);
  }, [portraitSize, alignment, currentCrop, characterHeight, adjX, adjY]);

  /* ---------------- 舞台尺寸与"适应窗口" ---------------- */

  // 用 layout effect：先量出尺寸再画第一帧，否则舞台会以一帧 scale(0) 闪一下
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const rect = viewport.getBoundingClientRect();
      const next: Viewport = { width: rect.width, height: rect.height };
      if (next.width <= 0 || next.height <= 0) return;

      const previous = stageRef.current;
      // 之前是"适应窗口"（或还没量过）→ 继续跟着窗口；否则保持当前比例只夹平移
      const wasFit = previous.width <= 0 || isFitView(viewRef.current, previous);
      const nextView = wasFit
        ? fitView(next)
        : clampView(viewRef.current, next);

      stageRef.current = next;
      viewRef.current = nextView;
      setStage(next);
      setView(nextView);
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  /* ---------------- 关闭 / 卸载时回收截图 URL ---------------- */

  useEffect(
    () => () => {
      if (screenshotUrlRef.current) {
        URL.revokeObjectURL(screenshotUrlRef.current);
        screenshotUrlRef.current = null;
      }
    },
    [],
  );

  // Esc 关闭（与「预览」弹窗一致；编辑立绘弹窗本身不吃 Esc，别让用户按了没反应）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // 空格 = 平移预备态（松键 / 切窗口都要复位，否则光标会一直卡在 grab）
  useEffect(() => {
    const isInteractive = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return (
        element.tagName === "BUTTON" ||
        element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.tagName === "SELECT" ||
        element.isContentEditable
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      if (isInteractive(event.target)) return;
      // 空格默认会滚动页面 / 触发按钮，这里接管成"准备平移"
      event.preventDefault();
      setIsSpaceDown(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setIsSpaceDown(false);
    };
    const onBlur = () => setIsSpaceDown(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  /* ---------------- 视图缩放 ---------------- */

  /** 统一入口：所有视图改动都写 ref，指针 / 滚轮回调才不会读到旧值 */
  const applyView = useCallback(
    (updater: (current: ReferenceView) => ReferenceView) => {
      setView((current) => {
        const next = updater(current);
        viewRef.current = next;
        return next;
      });
    },
    [],
  );

  /** 缩放到指定比例（以舞台中心为锚点，再夹进边界） */
  const zoomViewTo = useCallback(
    (targetScale: number) => {
      const currentStage = stageRef.current;
      if (currentStage.width <= 0) return;
      applyView((current) => {
        const nextScale = clampViewScale(targetScale, currentStage);
        return clampView(
          zoomViewAt(
            current,
            nextScale,
            currentStage.width / 2,
            currentStage.height / 2,
          ),
          currentStage,
        );
      });
    },
    [applyView],
  );

  const zoomViewBy = useCallback(
    (factor: number) => zoomViewTo(viewRef.current.scale * factor),
    [zoomViewTo],
  );

  const fitToWindow = useCallback(() => {
    const currentStage = stageRef.current;
    if (currentStage.width <= 0) return;
    applyView(() => fitView(currentStage));
  }, [applyView]);

  const goActualSize = useCallback(() => {
    const currentStage = stageRef.current;
    if (currentStage.width <= 0) return;
    applyView(() => actualSizeView(currentStage));
  }, [applyView]);

  /** 提交缩放比例输入框：150 / 150% / 1.5x 都认，非法输入直接还原 */
  const commitZoomDraft = useCallback(() => {
    if (cancelZoomRef.current) {
      // 上一次是按 Esc 取消的：丢掉草稿，别把被放弃的输入提交上去
      cancelZoomRef.current = false;
      setZoomDraft(null);
      return;
    }
    if (zoomDraft === null) return;
    const parsed = parseZoomPercent(zoomDraft);
    setZoomDraft(null);
    if (parsed === null) return;
    zoomViewTo(parsed);
  }, [zoomDraft, zoomViewTo]);

  /** 以舞台上的某一点为中心缩放视图（滚轮用） */
  const zoomViewAroundPoint = useCallback(
    (factor: number, anchorX: number, anchorY: number) => {
      const currentStage = stageRef.current;
      if (currentStage.width <= 0) return;
      applyView((current) => {
        const nextScale = clampViewScale(current.scale * factor, currentStage);
        return clampView(
          zoomViewAt(current, nextScale, anchorX, anchorY),
          currentStage,
        );
      });
    },
    [applyView],
  );

  /* ---------------- 滚轮：视图缩放（Alt = 立绘缩放） ---------------- */

  /** 以帧里的某一点为中心缩放立绘（校准） */
  const zoomPortraitAt = useCallback(
    (factor: number, frameX: number, frameY: number) => {
      setAlignment((current) => {
        if (!current) return current;
        const scale = clampAlignmentScale(current.scale * factor);
        const applied = scale / current.scale;
        return {
          scale,
          x: frameX - (frameX - current.x) * applied,
          y: frameY - (frameY - current.y) * applied,
        };
      });
    },
    [],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // 一帧内的滚轮量合并后再算倍率：触控板一次滑动会发几十个事件，
    // 逐个 setState 既卡又会把"小增量"放大成一连串跳变。
    let frame: number | null = null;
    let pending = { delta: 0, x: 0, y: 0 };

    const flush = () => {
      frame = null;
      const { delta, x, y } = pending;
      pending = { delta: 0, x, y };
      if (!delta) return;
      if (stageRef.current.width <= 0) return;
      zoomViewAroundPoint(wheelZoomFactor(delta), x, y);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.altKey) {
        // Alt+滚轮 = 立绘缩放（更细：每格约 3%），以画面中心为锚点
        event.preventDefault();
        zoomPortraitAt(
          wheelZoomFactor(event.deltaY, WHEEL_PORTRAIT_ZOOM_SENSITIVITY),
          FRAME_WIDTH / 2,
          FRAME_HEIGHT / 2,
        );
        return;
      }

      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      pending = {
        delta: pending.delta + normalizeWheelDelta(event.deltaY, event.deltaMode),
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      if (frame === null) {
        if (typeof requestAnimationFrame === "function") {
          frame = requestAnimationFrame(flush);
        } else {
          flush();
        }
      }
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      if (frame !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame);
      }
    };
  }, [zoomPortraitAt, zoomViewAroundPoint]);

  /* ---------------- 拖拽：立绘 or 平移 ---------------- */

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const wantsPan = event.button === 1 || isSpaceDown;
      if (!wantsPan && !alignment) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        mode: wantsPan ? "pan" : "portrait",
      };
      setIsDragging(true);
      setDragMode(wantsPan ? "pan" : "portrait");
      // 让方向键微调立刻可用（画布本身是 tabIndex=0 的）
      event.currentTarget.focus();
    },
    [alignment, isSpaceDown],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;

      if (drag.mode === "pan") {
        const currentStage = stageRef.current;
        applyView((current) =>
          clampView(
            {
              ...current,
              panX: current.panX + dx,
              panY: current.panY + dy,
            },
            currentStage,
          ),
        );
        return;
      }

      // 立绘拖动：屏幕像素 ÷ 当前视图比例 = 画面像素，任意缩放下都跟手
      const scale = viewRef.current.scale > 0 ? viewRef.current.scale : 1;
      setAlignment((current) =>
        current
          ? { ...current, x: current.x + dx / scale, y: current.y + dy / scale }
          : current,
      );
    },
    [applyView],
  );

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    setDragMode(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  /* ---------------- 键盘 ---------------- */

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
      const delta: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      const move = delta[event.key];
      if (move) {
        event.preventDefault();
        setAlignment((current) =>
          current
            ? { ...current, x: current.x + move.x, y: current.y + move.y }
            : current,
        );
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomViewBy(VIEW_ZOOM_STEP);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomViewBy(1 / VIEW_ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        fitToWindow();
      } else if (event.key === "1") {
        event.preventDefault();
        goActualSize();
      }
    },
    [fitToWindow, goActualSize, zoomViewBy],
  );

  /* ---------------- 选择截图 ---------------- */

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // 允许连续选同一张图：清掉 value，下次 change 才会触发
      event.target.value = "";
      if (!file) return;

      setScreenshotError(null);
      const url = URL.createObjectURL(file);
      try {
        const image = await loadImageElement(url);
        if (!image.naturalWidth || !image.naturalHeight) {
          throw new Error("截图尺寸为 0");
        }
        if (screenshotUrlRef.current) {
          URL.revokeObjectURL(screenshotUrlRef.current);
        }
        screenshotUrlRef.current = url;
        setScreenshot({
          url,
          size: { width: image.naturalWidth, height: image.naturalHeight },
        });
        log("已载入参考截图", {
          name: file.name,
          size: `${image.naturalWidth}x${image.naturalHeight}`,
        });
      } catch (error) {
        log("读取参考截图失败", error);
        URL.revokeObjectURL(url);
        setScreenshotError("这张图片读不出来，换一张试试（PNG / JPG 都行）。");
      }
    },
    [],
  );

  /* ---------------- 派生 ---------------- */

  const result = useMemo(
    () =>
      alignment && portraitSize
        ? deriveCropFromAlignment({
            alignment,
            portraitSize,
            characterHeight,
            // 水平位置不从截图读：沿用当前裁剪框的中心（无效时由内核退化为图片中心）
            centerX: cropCenterX(currentCrop) ?? undefined,
            adjY,
          })
        : null,
    [alignment, portraitSize, characterHeight, currentCrop, adjY],
  );

  /**
   * 竖直靶框：**只**画上下两条边 + 中间那条"头部中心"线。
   *
   * <p>水平位置不参与校准（截图里角色站哪边都行），所以这里故意不画左右边 ——
   * 画成一个方框会让人以为必须把角色拖到画面中间、把整个立绘横向挪过去。
   */
  const guide = useMemo(() => headBoxInFrame(characterHeight), [characterHeight]);
  const portraitRect = useMemo(
    () => portraitRectInFrame(alignment, portraitSize),
    [alignment, portraitSize],
  );
  const screenshotRect = useMemo(
    () => screenshotRectInFrame(screenshot?.size),
    [screenshot],
  );
  const screenshotIs16x9 = screenshot ? isSixteenByNine(screenshot.size) : true;

  /**
   * 反推用的水平中心（原图像素）= 当前裁剪框的中心（没有有效裁剪时退化为图片中心）。
   *
   * <p>它**不随拖动改变** —— 这就是"忽略水平位置"的落点：无论把立绘拖到截图左边还是右边，
   * 写回的 faceX 都让头保持在这个中心上，只是框的大小/纵向位置跟着校准走。
   */
  const horizontalCenter = useMemo(
    () =>
      cropCenterX(currentCrop) ?? (portraitSize ? portraitSize.width / 2 : 0),
    [currentCrop, portraitSize],
  );

  const resetToCurrentCrop = useCallback(() => {
    setAlignment(
      alignmentFromCrop({
        crop: currentCrop,
        characterHeight,
        adjX,
        adjY,
      }) ?? alignment,
    );
  }, [currentCrop, characterHeight, adjX, adjY, alignment]);

  const fitDisabled = stage.width > 0 && isFitView(view, stage);
  const actualSizeDisabled = isActualSizeView(view);
  const zoomInputValue =
    zoomDraft !== null ? zoomDraft : String(zoomPercent(view.scale));

  /* ---------------- 渲染 ---------------- */

  return (
    <div className="reference-crop-overlay">
      <div
        className="reference-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-crop-title"
      >
        <div className="reference-crop-header">
          <h3 id="reference-crop-title">按截图反推裁剪框</h3>
          <button
            type="button"
            className="reference-crop-close"
            onClick={onClose}
            aria-label="关闭按截图校准"
          >
            ×
          </button>
        </div>

        <div className="reference-crop-viewport-wrap">
          <div
            ref={viewportRef}
            className={`reference-crop-viewport ${
              isDragging ? "is-dragging" : ""
            } ${isSpaceDown ? "is-pan-ready" : ""} ${
              dragMode === "pan" ? "is-panning" : ""
            }`}
            role="application"
            aria-label="截图对齐画布"
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={handleKeyDown}
            onMouseDown={(event) => {
              // 中键拖动平移：顺手压掉 Chromium 的"自动滚动"光标
              if (event.button === 1) event.preventDefault();
            }}
          >
            <div
              className="reference-crop-frame"
              data-testid="reference-crop-frame"
              style={{
                width: FRAME_WIDTH,
                height: FRAME_HEIGHT,
                // 只影响"看"：平移 + 缩放，画面/立绘/靶带都在这里面，所以永远对齐
                transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.scale})`,
              }}
            >
              {screenshot && screenshotRect && (
                <img
                  className="reference-crop-shot"
                  src={screenshot.url}
                  alt="参考截图"
                  draggable={false}
                  style={{
                    left: screenshotRect.left,
                    top: screenshotRect.top,
                    width: screenshotRect.width,
                    height: screenshotRect.height,
                  }}
                />
              )}

              {portraitRect && (
                <img
                  className="reference-crop-portrait"
                  src={portraitUrl}
                  alt="待校准立绘"
                  draggable={false}
                  style={{
                    left: portraitRect.left,
                    top: portraitRect.top,
                    width: portraitRect.width,
                    height: portraitRect.height,
                    opacity,
                  }}
                />
              )}

              {showGuide && (
                <div
                  className="reference-crop-guide"
                  data-testid="reference-crop-guide"
                  style={{
                    left: 0,
                    top: guide.top,
                    width: FRAME_WIDTH,
                    height: guide.height,
                  }}
                >
                  <div
                    className="reference-crop-guide-center"
                    data-testid="reference-crop-guide-center"
                  />
                  <span>
                    头高 {Math.round(guide.height)}px · 对齐大小与竖直中心
                  </span>
                </div>
              )}
            </div>

            {!screenshot && (
              <div className="reference-crop-empty">
                <p>先选一张角色清晰的 16:9 游戏截图</p>
                <p className="reference-crop-empty-hint">
                  角色站在画面哪边都行 —— 只取头的<strong>大小</strong>和
                  <strong>竖直位置</strong>；对话框挡住腿没关系，要的是头部。
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="reference-crop-controls">
          <div className="reference-crop-row">
            <button
              type="button"
              className="reference-crop-pick"
              onClick={() => fileInputRef.current?.click()}
            >
              {screenshot ? "换一张截图" : "选择截图"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
              aria-label="选择参考截图文件"
              data-testid="reference-crop-file"
            />
            {screenshot && (
              <span className="reference-crop-shot-meta">
                {screenshot.size.width}×{screenshot.size.height}
                {screenshotIs16x9 ? "" : "（不是 16:9，画面已居中摆放）"}
              </span>
            )}

            <label className="reference-crop-slider">
              <span>不透明度 {Math.round(opacity * 100)}%</span>
              <input
                type="range"
                min={15}
                max={100}
                step={5}
                value={Math.round(opacity * 100)}
                aria-label="立绘不透明度"
                onChange={(event) =>
                  setOpacity(Number(event.target.value) / 100)
                }
              />
            </label>

            <label className="reference-crop-checkbox">
              <input
                type="checkbox"
                checked={showGuide}
                onChange={(event) => setShowGuide(event.target.checked)}
              />
              <span>显示靶带</span>
            </label>
          </div>

          <div className="reference-crop-row">
            {/* 查看视图缩放：只影响看，不影响校准结果 */}
            <div
              className="reference-crop-view-zoom"
              role="group"
              aria-label="查看视图缩放"
            >
              <button
                type="button"
                onClick={() => zoomViewBy(1 / VIEW_ZOOM_STEP)}
                aria-label="缩小视图"
                title="缩小视图（−10%）"
              >
                −
              </button>
              <label className="reference-crop-zoom-field">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="视图缩放比例（百分比，可输入 150、150% 或 1.5x）"
                  value={zoomInputValue}
                  onChange={(event) => setZoomDraft(event.target.value)}
                  onFocus={(event) => {
                    cancelZoomRef.current = false;
                    setZoomDraft(String(zoomPercent(viewRef.current.scale)));
                    event.currentTarget.select();
                  }}
                  onBlur={commitZoomDraft}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitZoomDraft();
                      event.currentTarget.blur();
                    } else if (event.key === "Escape") {
                      // 只取消输入，别把这个 Esc 冒泡成"关闭弹窗"
                      event.stopPropagation();
                      cancelZoomRef.current = true;
                      // 立刻把显示还原（失焦是异步的，别让用户看到被放弃的数字）
                      setZoomDraft(null);
                      event.currentTarget.blur();
                    }
                  }}
                  onKeyUp={(event) => event.stopPropagation()}
                />
                <span>%</span>
              </label>
              <button
                type="button"
                onClick={() => zoomViewBy(VIEW_ZOOM_STEP)}
                aria-label="放大视图"
                title="放大视图（+10%）"
              >
                ＋
              </button>
            </div>

            <button
              type="button"
              className="reference-crop-reset"
              onClick={fitToWindow}
              disabled={fitDisabled}
              title="缩放到适应窗口（快捷键 0）"
            >
              适应
            </button>
            <button
              type="button"
              className="reference-crop-reset"
              onClick={goActualSize}
              disabled={actualSizeDisabled}
              title="1 个画面像素 = 1 个屏幕像素（快捷键 1）"
            >
              1:1
            </button>

            <div className="reference-crop-zoom" role="group" aria-label="立绘缩放">
              <button
                type="button"
                onClick={() =>
                  zoomPortraitAt(1 / ZOOM_STEP, FRAME_WIDTH / 2, FRAME_HEIGHT / 2)
                }
                aria-label="缩小立绘"
                title="立绘缩小 5%（更细用 Alt+滚轮）"
              >
                −
              </button>
              <button
                type="button"
                onClick={() =>
                  zoomPortraitAt(ZOOM_STEP, FRAME_WIDTH / 2, FRAME_HEIGHT / 2)
                }
                aria-label="放大立绘"
                title="立绘放大 5%（更细用 Alt+滚轮）"
              >
                ＋
              </button>
            </div>
            <button
              type="button"
              className="reference-crop-reset"
              onClick={resetToCurrentCrop}
              title="把对齐恢复成当前裁剪框的位置（放弃这次拖动）"
            >
              恢复当前裁剪
            </button>
          </div>

          <div className="reference-crop-row">
            <span className="reference-crop-hint">
              滚轮缩放视图（以指针为中心）· 拖动立绘 / 方向键 1px（Shift 10px）·
              空格或中键拖动平移 · Alt+滚轮缩放立绘
              {screenshot && (
                <strong className="reference-crop-hint-strong">
                  只取「头的大小」和「竖直中心」：左右拖到哪都不影响结果，角色不必站在画面中间。
                </strong>
              )}
            </span>
          </div>

          {screenshot && (
            <p className="reference-crop-note">
              水平方向沿用当前裁剪框的中心（{Math.round(horizontalCenter)} px）——
              原作里角色的左右站位由镜头决定、同一角色各场景都不一样，拿它反推只会把框带偏。
              竖直位置则由角色身高决定，所以人物在哪一镜里站着都要对齐。
              舞台缩放只影响查看，不改任何裁剪参数。
            </p>
          )}

          {screenshotError && (
            <p className="reference-crop-error" role="alert">
              {screenshotError}
            </p>
          )}
          {portraitError && (
            <p className="reference-crop-error" role="alert">
              {portraitError}
            </p>
          )}

          {result && (
            <>
              <div className="reference-crop-readout">
                <span>
                  头框边长 <strong>{result.crop.length}</strong> px
                </span>
                <span>
                  左上角{" "}
                  <strong>
                    ({result.crop.faceX}, {result.crop.faceY})
                  </strong>
                </span>
                <span className="reference-crop-readout-raw">
                  角色身高 {Math.round(characterHeight || 171)}cm · 视图{" "}
                  {formatZoomPercent(view.scale)}
                </span>
              </div>
              {result.warnings.map((warning) => (
                <p
                  key={warning.code}
                  className="reference-crop-warning"
                  role="status"
                >
                  {warning.message}
                </p>
              ))}
            </>
          )}
        </div>

        <div className="reference-crop-footer">
          <button type="button" className="reference-crop-cancel" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="reference-crop-apply"
            disabled={!screenshot || !result}
            title={
              screenshot
                ? "把反推出来的 faceX / faceY / length 写回裁剪框"
                : "先选择一张参考截图"
            }
            onClick={() => {
              if (!result) return;
              log("写回裁剪框", { crop: result.crop, view });
              onApply(result.crop);
            }}
          >
            写回裁剪框
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReferenceCropDialog;
