/**
 * @component 序列帧动画 —— 缩略图摆放 + 播放预览
 *
 * 两个用途合在一个舞台上：
 * 1. **摆缩略图**（停止/暂停时）：拖动平移、滚轮缩放，结果存成"相对头部区域"的偏移与缩放倍率；
 * 2. **播放预览**：播放/停止（单键双态）+ 暂停 + 循环开关，按每帧持续帧数与淡入淡出真实地播一遍，
 *    用来验证节奏与透明度补间。
 *
 * 合成底板由后端渲（`POST /api/records/preview`，与成片同一条管线），所以背景 + 立绘 + UI
 * 的层叠关系天然正确；缩略图/序列帧是盖在最上面的 DOM 层，位置与大小实时算、不发请求。
 *
 * <h3>舞台为什么固定长宽比</h3>
 * 底板是 1280 × 720（16:9）。舞台按"能放进视口的最大 16:9 矩形"算成 px（见 `stageFit.ts`），
 * 居中显示、四周留白：窗口怎么拉，画面都只等比缩放，**不会拉伸变形**，叠层的百分比坐标系
 * 也永远与图片一致。纯 CSS 的 `aspect-ratio + max-width/max-height` 在两个方向同时受限时
 * 会破比例（被 clamp 的轴不会反推另一轴），所以这里实测容器像素自己算。
 *
 * <h3>播放按钮为什么只有一个</h3>
 * 播放与停止是同一个状态的两种取值，拆成两个按钮必然会有一帧"两个都亮/都不亮"的窗口期。
 * 所以只留一个切换键：`播放中 → 显示"⏹ 停止"，点击后停止并回到初始状态（显示缩略图）`；
 * 暂停是独立的第二键（只在播放中可用），用来把画面定在某帧上继续编辑摆放。
 *
 * <h3>播放到末尾的行为（明确定义）</h3>
 * <ul>
 *   <li>勾选「循环播放」：播到末尾从头再播一遍（淡入淡出每轮重演，正好验证补间）；</li>
 *   <li>不勾：播到末尾**自动停止并回到初始状态**（显示缩略图，变换解锁），不会停在半路。</li>
 * </ul>
 * 素材本身是 `loop` / `pingpong` 且设了次数时，"末尾"= 总帧数 × 次数。
 *
 * <h3>播放时为什么禁用变换</h3>
 * 播放中每一帧的 `src` 都在变，鼠标拖拽的视觉反馈会和逐帧刷新打架（用户拖的是"某一帧"的图，
 * 但下一帧已经换成另一张了）。所以播放中锁住拖拽/滚轮，暂停或停止后恢复可编辑。
 *
 * <h3>为什么记录的是"相对头部"而不是屏幕坐标</h3>
 * 同一段动画要能挂到不同角色身上。头部方框（立绘裁剪框）在场景里恒为
 * `183 × 用户缩放`（与角色身高、站位、裁剪框大小无关），所以把偏移存成
 * **头部长度的倍数**、把大小存成**缩放倍率**，换任何角色都落在同一个相对位置。
 *
 * <h3>视图缩放（与摆放参数严格分离）</h3>
 * 缩略图摆放是"对着画面调"的活：16:9 舞台放进预览栏后通常只有原图的 50%~80%，
 * 缩略图相对头部偏一两个像素根本看不出来。所以预览多了一层**只影响看**的视图：
 * <ul>
 *   <li>100% = 适应窗口，最多放大到 400%：按钮每次 ±10%、输入框可精确到 0.1%、
 *       `Ctrl/⌘ + 滚轮` 以指针为锚点连续缩放（见 `spritePreviewView.ts`）；</li>
 *   <li>放大后拖动画面**空白处**平移；拖缩略图仍然是移动缩略图；</li>
 *   <li>视图不进任何保存：写回的仍是"相对头部"的偏移与缩放倍率，
 *       在 400% 下拖出来的值与在 100% 下拖出来的完全一致（拖动换算是按实测舞台像素算的）。</li>
 * </ul>
 *
 * <h3>缩略图缩放的精度</h3>
 * 滚轮默认一格约 1%（原来是 16%，摆一个几十像素的符号一滚就过头）；
 * `Shift` 约 5% 快速调、`Alt` 约 0.1% 微调；面板上另有 ± 按钮（1% / Shift 5% / Alt 0.1%），
 * 与滚轮是同一套粒度。
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import log from "electron-log";

import ApiService from "@services/ApiService";
import type { Background, CharacterVisual, MyCharacter } from "@types";
import { buildPortraitImageUrl } from "@features/common/utils/portraitUtils";
import { useElementSize } from "@features/record/preview/useElementSize";
import { useImageSizes } from "@features/record/preview/useImageSizes";
import {
  DEFAULT_CAMERA,
  characterFaceCenter,
  characterHeadSize,
  characterWorldRect,
  sceneToOutput,
  worldToScene,
} from "@features/record/preview/previewLayout";
import type { LoopMode } from "@features/record/animation/animationTypes";
import {
  NO_FRAME,
  localFrameOfImage,
  posterSample,
  sampleSequence,
  spriteRect,
  totalFrames,
} from "@features/record/animation/sequenceTiming";
import type { SequenceSample } from "@features/record/animation/sequenceTiming";
import type { AnimationClipDto, AnimationClipPoster } from "@features/record/animation/animationClipAsset";
import {
  formatZoomPercentValue,
  parseZoomPercent,
  wheelZoomFactor,
} from "@features/common/utils/referenceView";
import { fitStage } from "./stageFit";
import type { BoxSize } from "./stageFit";
import {
  VIEW_ZOOM_MAX,
  VIEW_ZOOM_MIN,
  VIEW_ZOOM_STEP,
  clampView,
  clampViewZoom,
  fitView,
  panViewBy,
  viewStageSize,
  zoomViewAt,
  zoomViewToCenter,
} from "./spritePreviewView";
import type { PreviewView } from "./spritePreviewView";
import "./SpriteAnimationsTab.css";

/** 播放参数（来自编辑器草稿，改了立刻在预览里生效） */
export interface PreviewPlayback {
  loop: LoopMode;
  iterations: number | null;
  startFrame: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  opacity: number;
}

interface SpriteAnimationPreviewProps {
  clip: AnimationClipDto;
  poster: AnimationClipPoster;
  playback: PreviewPlayback;
  onPosterChange: (next: AnimationClipPoster) => void;
  /** 播放状态变化（上层据此禁用/恢复数字输入框） */
  onPlayingChange?: (playing: boolean) => void;
  /** 递增这个值 → 立刻停止播放（"选缩略图"是静态动作，边播边选看不清） */
  stopRequest?: number;
  characters: MyCharacter[];
  /** **原始路径**的背景列表（不要传补成绝对 URL 的展示值：后端会把 URL 当文件名拼） */
  backgrounds: Background[];
}

/** 预览渲染的输出尺寸（不跟成片走：这里只求"看得清、渲得快"；16:9 与成片一致） */
const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 720;

/** 舞台的固定长宽比（CSS 兜底用；量到视口尺寸后由 `fitStage` 算出 px） */
const PREVIEW_ASPECT = `${PREVIEW_WIDTH} / ${PREVIEW_HEIGHT}`;

/** 播放时钟的帧率：与全项目 timebase 一致 */
const PLAY_FPS = 30;

/** 缩略图缩放的上下限（与资源面板输入框的 min / max 一致） */
const SPRITE_SCALE_MIN = 0.01;
const SPRITE_SCALE_MAX = 20;

/**
 * 缩略图缩放的滚轮灵敏度：标准鼠标一格（`deltaY ≈ 100`）约 ×0.99（1%）。
 *
 * <p>倍率是 `exp(-deltaY × sensitivity)`（见 `referenceView.wheelZoomFactor`）：
 * 0.0001 → 一格约 1%。原来是 `1.0015^deltaY`（一格约 16%），摆一个几十像素的符号一滚就过头，
 * 所以整体调细；需要快调时按 `Shift`（约 5%/格），要抠最后一两个像素时按 `Alt`（约 0.1%/格）。
 * 三档与面板上的 ± 按钮（1% / Shift 5% / Alt 0.1%）是同一套粒度。
 */
const SPRITE_SCALE_WHEEL_SENSITIVITY = 0.0001;
/** Shift+滚轮：粗调，一格约 5% */
const SPRITE_SCALE_WHEEL_COARSE_SENSITIVITY = 0.0005;
/** Alt+滚轮：微调，一格约 0.1% */
const SPRITE_SCALE_WHEEL_FINE_SENSITIVITY = 0.00001;

/** 播放状态：停止 = 显示缩略图；播放/暂停 = 显示序列 */
type Phase = "stopped" | "playing" | "paused";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** 取一个角色的默认立绘（没有 defaultPortrait 时退回第一个） */
const defaultPortraitOf = (character: MyCharacter | undefined) => {
  const portraits = character?.portraits ?? [];
  return portraits.find((item) => item.defaultPortrait) ?? portraits[0];
};

const SpriteAnimationPreview: React.FC<SpriteAnimationPreviewProps> = ({
  clip,
  poster,
  playback,
  onPosterChange,
  onPlayingChange,
  stopRequest = 0,
  characters,
  backgrounds,
}) => {
  const [characterId, setCharacterId] = useState<string>("");
  const [backgroundId, setBackgroundId] = useState<string>("");
  const [rasterUrl, setRasterUrl] = useState<string>("");
  const [rendering, setRendering] = useState(false);
  const [loadError, setLoadError] = useState<string>("");
  const [bgError, setBgError] = useState<string>("");
  const [refreshToken, setRefreshToken] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const { ref: viewportRef, size: viewportSize } = useElementSize<HTMLDivElement>();

  /* ==================== 视图缩放（只影响看） ==================== */
  const [view, setView] = useState<PreviewView>(fitView);
  /** 视图缩放输入框的草稿：null = 没在编辑，显示当前比例 */
  const [zoomDraft, setZoomDraft] = useState<string | null>(null);
  /** 输入框按 Esc：标记"这次失焦是取消"，别把被放弃的输入提交上去 */
  const cancelZoomRef = useRef(false);
  const panDragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  /* ==================== 播放 ==================== */
  const [phase, setPhase] = useState<Phase>("stopped");
  const [loopPreview, setLoopPreview] = useState(true);
  const [elapsedFrames, setElapsedFrames] = useState(0);
  const elapsedRef = useRef(0);
  /** 已经处理过的 `stopRequest`：只对"新的一次请求"生效，重渲染不会反复停 */
  const stopRequestRef = useRef(stopRequest);

  const holds = clip.frameHolds ?? [];
  const total = totalFrames(holds);
  const loopMode: LoopMode = playback.loop ?? "once";
  const loopingAsset = loopMode === "loop" || loopMode === "pingpong";
  const transformEnabled = phase !== "playing";
  const playing = phase === "playing";

  /**
   * 事件回调（原生滚轮 / 指针拖拽）里要读**最新**值。
   *
   * <p>原生 `wheel` 监听只挂一次（否则每次改草稿都要 add/remove 一遍），
   * 回调读这些 ref 才不会拿到旧闭包里的 poster、舞台尺寸或播放状态。
   */
  const posterRef = useRef(poster);
  posterRef.current = poster;
  const onPosterChangeRef = useRef(onPosterChange);
  onPosterChangeRef.current = onPosterChange;
  const transformEnabledRef = useRef(transformEnabled);
  transformEnabledRef.current = transformEnabled;
  const viewportSizeRef = useRef(viewportSize);
  viewportSizeRef.current = viewportSize;
  const stageSizeRef = useRef<BoxSize | null>(null);

  /**
   * 这一遍播放总共要走的帧数。
   *
   * <p>`loop` / `pingpong` 一旦设了循环次数，素材只会播 `总帧数 × 次数` 帧，
   * 之后序列本身就"没有画"了——预览也必须停在那里，不能空转。
   */
  const playUntil = useMemo(() => {
    if (total <= 0) return 0;
    const iterations = playback.iterations ?? 0;
    if (loopingAsset && iterations > 0) return total * iterations;
    return total;
  }, [total, loopingAsset, playback.iterations]);

  // 换素材时把播放状态收回去
  useEffect(() => {
    setPhase("stopped");
    elapsedRef.current = 0;
    setElapsedFrames(0);
  }, [clip.id]);

  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  // 上层请求停止（例如进入"选择缩略图"）：直接回到初始状态
  useEffect(() => {
    if (stopRequest <= stopRequestRef.current) return;
    stopRequestRef.current = stopRequest;
    elapsedRef.current = 0;
    setElapsedFrames(0);
    setPhase("stopped");
  }, [stopRequest]);

  useEffect(() => {
    if (!playing || total <= 0 || playUntil <= 0) return undefined;
    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    let last = now();
    const timer = setInterval(() => {
      const current = now();
      const deltaFrames = Math.max(0, ((current - last) / 1000) * PLAY_FPS);
      last = current;
      const next = elapsedRef.current + deltaFrames;
      if (next >= playUntil) {
        if (loopPreview) {
          // 循环预览：回到开头再播一遍（淡入淡出每轮都会重演，正好用来验证补间）
          elapsedRef.current = next % playUntil;
          setElapsedFrames(elapsedRef.current);
          return;
        }
        // 不循环：播到末尾**停止并回到初始状态**（显示缩略图，变换解锁）
        elapsedRef.current = 0;
        setElapsedFrames(0);
        setPhase("stopped");
        return;
      }
      elapsedRef.current = next;
      setElapsedFrames(next);
    }, Math.round(1000 / PLAY_FPS));
    return () => clearInterval(timer);
  }, [playing, total, playUntil, loopPreview]);

  /** 单键双态：播放中 → 停止（回初始状态）；未播放 → 播放/继续 */
  const handleTogglePlay = () => {
    if (total <= 0) return;
    if (playing) {
      elapsedRef.current = 0;
      setElapsedFrames(0);
      setPhase("stopped");
      return;
    }
    if (phase === "stopped") {
      // 从初始状态开始：一定从第 0 帧起（暂停后继续则接着走）
      elapsedRef.current = 0;
      setElapsedFrames(0);
    }
    setPhase("playing");
  };

  const handlePause = () => setPhase((current) => (current === "playing" ? "paused" : current));

  /** 这一帧要显示第几张图、多透明 */
  const sample: SequenceSample = useMemo(() => {
    if (total <= 0) return { imageIndex: NO_FRAME, localFrame: NO_FRAME, alpha: 0 };
    if (phase === "stopped") {
      // 静止 = 缩略图（与剧情编辑里的栅格预览同一口径）。
      // poster.frame 是**图片序号**，posterSample 要的是**局部帧号**：每张停多帧时二者不等，
      // 必须先换算，否则"缩略图换了、预览却没变"。
      return posterSample(
        holds,
        localFrameOfImage(holds, poster.frame),
        loopMode,
        playback.fadeInFrames,
        playback.fadeOutFrames,
        playback.opacity,
      );
    }
    return sampleSequence(
      holds,
      loopMode,
      playback.iterations,
      playback.startFrame,
      playback.fadeInFrames,
      playback.fadeOutFrames,
      playback.opacity,
      Math.floor(elapsedFrames),
    );
  }, [
    total,
    phase,
    holds,
    poster.frame,
    loopMode,
    playback.iterations,
    playback.startFrame,
    playback.fadeInFrames,
    playback.fadeOutFrames,
    playback.opacity,
    elapsedFrames,
  ]);

  /** 只有带立绘的角色能当预览对象 */
  const usableCharacters = useMemo(
    () => characters.filter((character) => (character.portraits?.length ?? 0) > 0),
    [characters],
  );

  // 还没选（或原选择被删了）时自动落到第一个可用角色 / 第一张背景
  useEffect(() => {
    if (usableCharacters.length === 0) {
      setCharacterId("");
      return;
    }
    if (!usableCharacters.some((item) => item.characterID === characterId)) {
      setCharacterId(usableCharacters[0].characterID);
    }
  }, [usableCharacters, characterId]);

  useEffect(() => {
    if (backgrounds.length === 0) {
      setBackgroundId("");
      return;
    }
    if (!backgrounds.some((item) => item.uuid === backgroundId || item.name === backgroundId)) {
      setBackgroundId(String(backgrounds[0].uuid ?? backgrounds[0].name ?? ""));
    }
  }, [backgrounds, backgroundId]);

  const character = usableCharacters.find((item) => item.characterID === characterId);
  const portrait = defaultPortraitOf(character);
  const background = backgrounds.find(
    (item) => String(item.uuid ?? item.name ?? "") === backgroundId,
  );
  const backgroundPath = background?.path;
  const backgroundName = background?.name;
  const backgroundKey = background?.uuid;

  /* ==================== 背景可达性探测（失败要看得见） ==================== */
  //
  // 底板是后端渲的一整张图，背景缺失时只会"少一层"，前端看不出来。
  // 这里单独拿展示用的 URL 探一次：探不到就在舞台上给明确提示，
  // 而不是让用户对着黑底怀疑人生（后端日志里也有"背景图片未找到"的详细路径）。
  useEffect(() => {
    if (!backgroundPath && !backgroundName) {
      setBgError("");
      return undefined;
    }
    const displayUrl = ApiService.getBackgroundUrl(backgroundPath ?? "");
    if (!displayUrl) {
      setBgError("背景路径为空，预览里不会出现背景");
      return undefined;
    }
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled) setBgError("");
    };
    probe.onerror = () => {
      if (cancelled) return;
      log.warn("[序列帧动画] 背景图片加载失败:", backgroundPath, "->", displayUrl);
      setBgError(`背景图片加载失败：${backgroundName || backgroundPath}`);
    };
    probe.src = displayUrl;
    return () => {
      cancelled = true;
      probe.onload = null;
      probe.onerror = null;
    };
  }, [backgroundKey, backgroundPath, backgroundName]);

  /* ==================== 合成底板 ==================== */

  /** 合成用的"假记录"：只有背景 + 一个立绘 + 一点台词（让 UI 层出现在画面上） */
  const syntheticRecord = useMemo(() => {
    if (!character || !portrait || !background) return null;
    return {
      // uuid 进后端预览缓存键：换角色 / 换背景 / 点刷新都必须换一个 uuid，
      // 否则后端直接返回上一次缓存的 PNG，"刷新底板"按钮就成了摆设
      uuid: `anim-preview-${character.characterID}-${backgroundId}-${refreshToken}`,
      dialogue: {
        text: "预览台词",
        speakerName: "",
        speakerC: [],
        faction: "",
        emotion: "normal",
        align: "LEFT",
        speed: 1,
        freeText: false,
        hideUI: false,
        location: "default",
      },
      bg: [
        {
          // 这里必须是**记录里的路径**（/assets/... 或裸文件名）。
          // 传 ResourceManager 补过 http:// 的展示值，后端会把它当文件名拼，背景就静默变黑。
          background: { uuid: background.uuid, path: background.path, name: background.name },
          scale: 1,
          posX: 0,
          posY: 0,
          visible: true,
        },
      ],
      chars: [
        {
          chara: {
            characterID: character.characterID,
            characterName: character.characterName,
            height: character.height,
            faction: character.faction,
          },
          portrait,
          adjX: 0,
          adjY: 0,
          scale: 1,
          dim: false,
        },
      ],
      tempImages: [],
      effects: [],
      audioCommands: [],
    };
  }, [character, portrait, background, backgroundId, refreshToken]);

  /** 拉底板栅格图 */
  useEffect(() => {
    if (!syntheticRecord) {
      setRasterUrl("");
      return undefined;
    }
    let disposed = false;
    let created: string | null = null;
    setRendering(true);
    setLoadError("");
    ApiService.getRecordPreview(syntheticRecord as any, PREVIEW_WIDTH, PREVIEW_HEIGHT, false, true)
      .then((url) => {
        if (disposed) {
          URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setRasterUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return url;
        });
      })
      .catch((error: any) => {
        if (disposed) return;
        log.warn("[序列帧动画] 预览底板渲染失败:", error);
        setLoadError("预览底板渲染失败（后端可能没启动，详见后端日志）");
      })
      .finally(() => {
        if (!disposed) setRendering(false);
      });
    return () => {
      disposed = true;
      if (created) {
        // 卸载/换角色时释放上一张 blob，避免内存泄漏
        setTimeout(() => URL.revokeObjectURL(created as string), 0);
      }
    };
  }, [syntheticRecord, refreshToken]);

  /* ==================== 几何 ==================== */

  /** 立绘原图尺寸（算立绘矩形要用；没有它就算不出脸框中心） */
  const portraitUrl = useMemo(
    () => (portrait ? buildPortraitImageUrl(portrait.imagePath) : ""),
    [portrait],
  );
  const { sizes } = useImageSizes(portraitUrl ? [portraitUrl] : []);
  const portraitSize = portraitUrl ? sizes[portraitUrl] : undefined;

  /** 预览用的立绘视觉元素（与记录里同构，但没有用户偏移/缩放） */
  const characterVisual: CharacterVisual | null = useMemo(() => {
    if (!character || !portrait) return null;
    return {
      chara: {
        characterID: character.characterID,
        characterName: character.characterName,
        height: character.height,
        faction: character.faction,
      },
      portrait,
      posX: 0,
      posY: 0,
      adjX: 0,
      adjY: 0,
      scale: 1,
      dim: false,
    } as CharacterVisual;
  }, [character, portrait]);

  const output = { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };

  /** 立绘矩形（世界）→ 脸框中心 → 头部边长 → 缩略图矩形（输出像素） */
  const geometry = useMemo(() => {
    if (!characterVisual || !portraitSize) return null;
    const rect = characterWorldRect(characterVisual, portraitSize);
    const faceCenter = characterFaceCenter(characterVisual, rect);
    const head = characterHeadSize(characterVisual);
    const world = spriteRect(
      faceCenter.x,
      faceCenter.y,
      head,
      clip.canvasWidth,
      clip.canvasHeight,
      poster.scale,
      1, // 预览里立绘没有用户缩放
      poster.offsetX,
      poster.offsetY,
    );
    const out = sceneToOutput(worldToScene(world, DEFAULT_CAMERA), output);
    // 头部在预览图上的像素宽：拖拽时把像素位移换算回"几个头宽"
    const headOut = sceneToOutput(
      worldToScene({ x: 0, y: 0, w: head, h: head }, DEFAULT_CAMERA),
      output,
    ).w;
    return { out, headOut, headWorld: head, faceCenter };
  }, [characterVisual, portraitSize, clip.canvasWidth, clip.canvasHeight, poster, output.width, output.height]);

  /** 舞台 = 视口里能放下的最大 16:9 矩形（px）。量不到时退回 CSS 兜底 */
  const stageSize = useMemo(
    () =>
      fitStage(
        { width: viewportSize.width, height: viewportSize.height },
        { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT },
      ),
    [viewportSize.width, viewportSize.height],
  );
  stageSizeRef.current = stageSize;

  /**
   * 舞台的**显示**尺寸 = 适应尺寸 × 视图缩放。
   *
   * <p>舞台里的叠加层仍然按百分比铺，所以缩放只是把同一个坐标系整体放大，
   * 缩略图与底板的相对位置不会漂；拖动换算走实测 `getBoundingClientRect()`，也不用改。
   */
  const displayedStage = useMemo(
    () => (stageSize ? viewStageSize(stageSize, view.zoom) : null),
    [stageSize, view.zoom],
  );

  // 视口 / 舞台尺寸变了（拉窗口、切换布局）：把视图夹回边界，别停在"露白"的位置
  useEffect(() => {
    if (!stageSize) return;
    setView((current) => {
      const next = clampView(current, stageSize, viewportSize);
      return next.zoom === current.zoom && next.panX === current.panX && next.panY === current.panY
        ? current
        : next;
    });
  }, [stageSize, viewportSize]);

  /**
   * 原生滚轮监听：`Ctrl/⌘ + 滚轮` = 视图缩放（以指针为锚点），普通滚轮 = 缩略图缩放。
   *
   * <p>为什么不用 React 的 `onWheel`：React 17+ 把 wheel 注册成 passive 监听，
   * 里面 `preventDefault()` 会被忽略（页面 / 外层容器照样滚，Ctrl+滚轮还会触发窗口缩放）。
   * 这里用 `{ passive: false }` 的原生监听接管。
   */
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      const overStage = !!target?.closest?.(".sprite-preview-stage");

      // 视图缩放：只影响看，不写任何参数
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const base = stageSizeRef.current;
        const size = viewportSizeRef.current;
        // 滚轮是"直接操作视图"：丢掉输入框里还没提交的文本，
        // 否则鼠标移开失焦时会按旧草稿把视图又缩回去
        setZoomDraft(null);
        cancelZoomRef.current = false;
        if (!base || size.width <= 0 || size.height <= 0) return;
        const rect = viewport.getBoundingClientRect();
        const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        setView((current) =>
          zoomViewAt(current, current.zoom * wheelZoomFactor(event.deltaY), anchor, base, size),
        );
        return;
      }

      // 缩略图缩放：仍然只在舞台上生效（在留白处滚轮留给页面滚动，不抢）
      if (!overStage || !transformEnabledRef.current) return;
      event.preventDefault();
      const sensitivity = event.altKey
        ? SPRITE_SCALE_WHEEL_FINE_SENSITIVITY
        : event.shiftKey
          ? SPRITE_SCALE_WHEEL_COARSE_SENSITIVITY
          : SPRITE_SCALE_WHEEL_SENSITIVITY;
      const current = posterRef.current;
      const scale = clamp(
        (current.scale ?? 1) * wheelZoomFactor(event.deltaY, sensitivity),
        SPRITE_SCALE_MIN,
        SPRITE_SCALE_MAX,
      );
      // 同一帧里可能连着来好几个滚轮事件：先更新 ref，下一次才基于最新值算
      posterRef.current = { ...current, scale };
      onPosterChangeRef.current({ ...current, scale });
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [viewportRef]);

  /** 当前要显示的帧图 */
  const frameIndex = sample.imageIndex === NO_FRAME ? 0 : sample.imageIndex;
  const frameUrl = ApiService.getAnimationClipFrameUrl(clip.id, frameIndex);
  /** 缩略图是第几张（图片序号；素材上存的就是图片序号） */
  const posterIndex = Math.min(
    Math.max(0, Math.round(poster.frame ?? 0)),
    Math.max(0, holds.length - 1),
  );

  /* ==================== 拖拽 / 缩放 ==================== */

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!geometry || !transformEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: poster.offsetX ?? 0,
      offsetY: poster.offsetY ?? 0,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || !geometry) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    // 客户端像素 → 输出像素：舞台是等比缩放的
    const scaleX = output.width / rect.width;
    const scaleY = output.height / rect.height;
    const dx = ((event.clientX - drag.startX) * scaleX) / Math.max(1e-6, geometry.headOut);
    const dy = ((event.clientY - drag.startY) * scaleY) / Math.max(1e-6, geometry.headOut);
    onPosterChange({
      ...poster,
      offsetX: clamp(drag.offsetX + dx, -20, 20),
      offsetY: clamp(drag.offsetY + dy, -20, 20),
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  };

  /* ==================== 视图缩放：按钮 / 输入框 ==================== */

  /**
   * 视图缩放的唯一入口。
   *
   * <p>以视口中心为锚点：按钮 / 输入框缩完，画面中心的内容还在中心（不会"缩着缩着跑掉"）。
   * 量不到舞台尺寸时（单元测试 / 首帧）只改读数，不产生假平移。
   */
  const changeZoom = (resolve: (current: PreviewView) => number) => {
    setView((current) => {
      const base = stageSizeRef.current;
      const size = viewportSizeRef.current;
      const target = resolve(current);
      if (!base || size.width <= 0 || size.height <= 0) {
        return { zoom: clampViewZoom(target), panX: 0, panY: 0 };
      }
      return zoomViewToCenter(current, target, base, size);
    });
  };

  /** 按钮：每次 10 个百分点（100 → 110 → … → 400） */
  const zoomByStep = (direction: 1 | -1) =>
    changeZoom((current) => current.zoom + direction * VIEW_ZOOM_STEP);

  const resetView = () => setView(fitView());

  /** 提交视图缩放输入框：150 / 150% / 2x 都认，非法输入直接还原 */
  const commitZoomDraft = () => {
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
    // 只是点进输入框又点出去（或输入的值四舍五入后与当前读数一致）：别把显示用的
    // 0.1 级近似值当成新比例提交，否则每次聚焦都会让视图轻微跳一下
    if (formatZoomPercentValue(parsed) === formatZoomPercentValue(view.zoom)) return;
    changeZoom(() => parsed);
  };

  /* ==================== 放大后拖动空白处平移 ==================== */

  const handleStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // 没放大时没有可平移的余量；缩略图自己的拖拽会 stopPropagation，轮不到这里
    if (view.zoom <= VIEW_ZOOM_MIN || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest?.(".sprite-preview-handle")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setPanning(true);
  };

  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = panDragRef.current;
    const base = stageSizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !base) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    setView((current) => panViewBy(current, base, viewportSizeRef.current, dx, dy));
  };

  const endStagePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panDragRef.current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    panDragRef.current = null;
    setPanning(false);
  };

  const stageStyle = (rect: { x: number; y: number; w: number; h: number }): React.CSSProperties => ({
    left: `${(rect.x / output.width) * 100}%`,
    top: `${(rect.y / output.height) * 100}%`,
    width: `${(rect.w / output.width) * 100}%`,
    height: `${(rect.h / output.height) * 100}%`,
  });

  const canPreview = usableCharacters.length > 0 && backgrounds.length > 0;
  const visible = sample.imageIndex !== NO_FRAME && sample.alpha > 1e-4;
  const shownFrame = Math.floor(Math.min(elapsedFrames, Math.max(0, total - 1))) + 1;
  const frameReadout =
    phase === "stopped"
      ? `缩略图 第 ${posterIndex + 1} / ${Math.max(1, holds.length)} 张`
      : `第 ${shownFrame} / ${total} 帧`;

  return (
    <div className="sprite-preview">
      <div className="sprite-preview-toolbar">
        <label className="sprite-preview-field">
          角色
          <select
            value={characterId}
            onChange={(e) => setCharacterId(e.target.value)}
            aria-label="预览角色"
            title={usableCharacters.find((item) => item.characterID === characterId)?.characterName}
          >
            {usableCharacters.length === 0 && <option value="">（还没有带立绘的角色）</option>}
            {usableCharacters.map((item) => (
              <option key={item.characterID} value={item.characterID}>
                {item.characterName}
              </option>
            ))}
          </select>
        </label>
        <label className="sprite-preview-field">
          背景
          <select
            value={backgroundId}
            onChange={(e) => setBackgroundId(e.target.value)}
            aria-label="预览背景"
            title={background?.name}
          >
            {backgrounds.length === 0 && <option value="">（还没有背景）</option>}
            {backgrounds.map((item) => (
              <option key={String(item.uuid ?? item.name)} value={String(item.uuid ?? item.name)}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setRefreshToken((value) => value + 1)} title="重新渲染底板">
          刷新底板
        </button>
        <button
          type="button"
          onClick={() => onPosterChange({ ...poster, offsetX: 0, offsetY: 0 })}
          disabled={!transformEnabled}
          title="把缩略图移回脸框中心"
        >
          居中
        </button>
        <button
          type="button"
          onClick={() => onPosterChange({ ...poster, offsetX: 0, offsetY: 0, scale: 1 })}
          disabled={!transformEnabled}
          title="偏移归零、缩放回 100%"
        >
          重置摆放
        </button>
      </div>

      {/* 播放控制：播放/停止合并成单键双态，暂停独立 */}
      <div className="sprite-preview-transport" role="group" aria-label="播放控制">
        <button
          type="button"
          className={`sprite-preview-play${playing ? " is-playing" : ""}`}
          onClick={handleTogglePlay}
          disabled={total <= 0}
          aria-pressed={playing}
          title={
            playing
              ? "停止播放并回到初始状态（显示缩略图）"
              : "按每帧持续帧数与淡入淡出真实播放一遍"
          }
        >
          {playing ? "⏹ 停止" : "▶ 播放"}
        </button>
        <button
          type="button"
          onClick={handlePause}
          disabled={!playing}
          title="定在这一帧，方便对着某一帧调缩略图摆放"
        >
          ⏸ 暂停
        </button>
        <label
          className="sprite-preview-loop"
          title="勾选：播到末尾从头再播一遍；不勾：播到末尾自动停止并回到缩略图"
        >
          <input
            type="checkbox"
            checked={loopPreview}
            onChange={(e) => setLoopPreview(e.target.checked)}
            aria-label="循环播放"
          />
          <span>循环播放</span>
        </label>
        {/* 帧号与"16:9"角标是一组：宽度不够时整组换行，角标不会被单独甩到下一行 */}
        <span className="sprite-preview-readout">
          <span className="sprite-preview-frame sprite-anim-ellipsis" title={frameReadout}>
            {frameReadout}
            {playing ? "（播放中：变换已锁定）" : ""}
          </span>
          <span
            className="sprite-preview-ratio"
            title="预览图固定 16:9：窗口缩放或视图放大时都只等比缩放、不变形"
          >
            16:9
          </span>
        </span>
      </div>

      {/* 视图缩放：只影响看，不写任何参数（摆放仍按"相对头部"保存） */}
      <div className="sprite-preview-viewbar" role="group" aria-label="视图缩放">
        <span className="sprite-preview-viewbar-label">视图</span>
        <button
          type="button"
          onClick={() => zoomByStep(-1)}
          disabled={view.zoom <= VIEW_ZOOM_MIN}
          aria-label="缩小视图"
          title="缩小视图（每次 10%）；100% = 适应窗口"
        >
          −
        </button>
        <label
          className="sprite-preview-zoom-field"
          title="视图缩放：100% = 适应窗口；可输入 150、150% 或 2x（精确到 0.1%），只影响看"
        >
          <input
            type="text"
            inputMode="decimal"
            aria-label="视图缩放比例（百分比，100% = 适应窗口，可输入 150、150% 或 2x）"
            value={zoomDraft ?? formatZoomPercentValue(view.zoom)}
            onFocus={() => setZoomDraft(formatZoomPercentValue(view.zoom))}
            onChange={(event) => setZoomDraft(event.target.value)}
            onBlur={commitZoomDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitZoomDraft();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                // 放弃这次输入：失焦时不要再提交（与「按截图校准」的视图缩放输入框同一套交互）
                cancelZoomRef.current = true;
                setZoomDraft(null);
                event.currentTarget.blur();
              }
            }}
          />
          <span className="sprite-preview-zoom-unit">%</span>
        </label>
        <button
          type="button"
          onClick={() => zoomByStep(1)}
          disabled={view.zoom >= VIEW_ZOOM_MAX}
          aria-label="放大视图"
          title="放大视图（每次 10%）；最多 400%"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={resetView}
          disabled={view.zoom <= VIEW_ZOOM_MIN && view.panX === 0 && view.panY === 0}
          title="回到适应窗口（100%），丢掉平移"
        >
          适应
        </button>
        <span
          className="sprite-preview-viewbar-note sprite-anim-ellipsis"
          title="Ctrl/⌘+滚轮以指针为中心缩放视图；放大后拖动画面空白处平移。视图只影响看，缩略图的摆放参数不会变。"
        >
          Ctrl+滚轮缩放 · 放大后拖动空白处平移
        </span>
      </div>

      {/* 视口：多余空间留白，舞台居中 */}
      <div className="sprite-preview-viewport" ref={viewportRef} data-testid="sprite-preview-viewport">
        <div
          className={`sprite-preview-stage${view.zoom > VIEW_ZOOM_MIN ? " is-zoomed" : ""}${
            panning ? " is-panning" : ""
          }`}
          ref={stageRef}
          data-testid="sprite-preview-stage"
          style={{
            // 舞台显示尺寸 = 适应尺寸 × 视图缩放；量不到视口时退回 CSS 的 16:9 兜底
            ...(displayedStage
              ? { width: `${displayedStage.width}px`, height: `${displayedStage.height}px` }
              : { width: `${view.zoom * 100}%`, aspectRatio: PREVIEW_ASPECT }),
            // 平移只是"看"的位移：舞台仍由 flex 居中，translate 只挪显示位置
            transform:
              view.panX || view.panY ? `translate(${view.panX}px, ${view.panY}px)` : undefined,
          }}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={endStagePan}
          onPointerCancel={endStagePan}
        >
          {rasterUrl ? (
            <img className="sprite-preview-raster" src={rasterUrl} alt="合成预览" draggable={false} />
          ) : (
            <div className="sprite-preview-placeholder">
              {canPreview ? (rendering ? "渲染中…" : "预览不可用") : "需要一个带立绘的角色和一张背景"}
            </div>
          )}

          {geometry && visible && (
            <div
              className={`sprite-preview-handle${dragging ? " is-dragging" : ""}${
                transformEnabled ? "" : " is-locked"
              }`}
              style={{ ...stageStyle(geometry.out), opacity: sample.alpha }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              title={
                transformEnabled
                  ? "拖动移动；滚轮缩放（Shift 粗调 / Alt 微调）；Ctrl+滚轮缩放画面"
                  : "播放中锁定变换，暂停或停止后可编辑"
              }
              role="presentation"
            >
              <img src={frameUrl} alt="缩略图" draggable={false} />
              <span className="sprite-preview-handle-badge">
                {phase === "stopped" ? "缩略图" : "序列帧"}
              </span>
            </div>
          )}

          {rendering && rasterUrl && <div className="sprite-preview-chip">刷新中…</div>}
          {bgError && (
            <div className="sprite-preview-error" role="alert">
              {bgError}
            </div>
          )}
          {loadError && (
            <div className="sprite-preview-error is-bottom" role="alert">
              {loadError}
            </div>
          )}
        </div>
      </div>

      {/* 说明：窗口窄/矮时由 CSS 掐成两行并省略（悬浮看全文），把高度让给画面 */}
      <div
        className="sprite-preview-hint"
        title="拖动缩略图可平移；滚轮缩放（以缩略图中心为基准，Shift 粗调 5%、Alt 微调 0.1%）；Ctrl/⌘+滚轮缩放预览视图，放大后拖动画面空白处平移（视图只影响看）。播放中锁定缩略图变换，暂停/停止后可编辑；位置与大小按“相对头部区域”保存，换角色也落在同一相对位置。播放到末尾：勾选「循环播放」会从头再播一遍，不勾则自动停止并回到缩略图（初始状态）。"
      >
        拖动缩略图可平移；滚轮缩放（<strong>以缩略图中心为基准</strong>，Shift 粗调 5% / Alt 微调 0.1%）；
        Ctrl+滚轮缩放预览<strong>视图</strong>，放大后拖动空白处平移（只影响看）。播放中锁定、暂停/停止后可编辑。
        <br />
        位置与大小存成<strong>相对头部区域</strong>的偏移（头长的倍数）与缩放倍率，换个角色也落在同一个相对位置。
        播放到末尾：勾选「循环播放」会从头再播一遍，不勾则<strong>自动停止并回到缩略图</strong>。
        当前：横向 {(poster.offsetX ?? 0).toFixed(2)} 个头宽、纵向 {(poster.offsetY ?? 0).toFixed(2)} 个头宽、
        缩放 {((poster.scale ?? 1) * 100).toFixed(2)}%（{Number((poster.scale ?? 1).toFixed(4))}×）
        {geometry ? `，头部方框约 ${Math.round(geometry.headOut)}px` : ""}。
      </div>
    </div>
  );
};

export default SpriteAnimationPreview;
