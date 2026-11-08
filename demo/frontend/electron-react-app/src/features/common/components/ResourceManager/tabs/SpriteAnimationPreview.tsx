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
import { fitStage } from "./stageFit";
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

  /** 滚轮缩放（以缩略图中心为基准；播放中禁用） */
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!geometry || !transformEnabled) return;
    event.preventDefault();
    const factor = Math.pow(1.0015, -event.deltaY);
    onPosterChange({
      ...poster,
      scale: clamp((poster.scale ?? 1) * factor, 0.01, 20),
    });
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
          <span className="sprite-preview-ratio" title="预览图固定 16:9，窗口缩放时只等比缩放、不变形">
            16:9
          </span>
        </span>
      </div>

      {/* 视口：多余空间留白，舞台居中 */}
      <div className="sprite-preview-viewport" ref={viewportRef}>
        <div
          className="sprite-preview-stage"
          ref={stageRef}
          style={
            stageSize
              ? { width: `${stageSize.width}px`, height: `${stageSize.height}px` }
              : { width: "100%", aspectRatio: PREVIEW_ASPECT }
          }
          onWheel={handleWheel}
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
                  ? "拖动移动；滚轮缩放（以中心为基准）"
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
        title="拖动缩略图可平移、滚轮可缩放（以缩略图中心为基准），播放中锁定、暂停/停止后可编辑；位置与大小按“相对头部区域”保存，换角色也落在同一相对位置。播放到末尾：勾选「循环播放」会从头再播一遍，不勾则自动停止并回到缩略图（初始状态）。"
      >
        拖动缩略图可平移，滚轮可缩放（<strong>以缩略图中心为基准</strong>）；播放中锁定、暂停/停止后可编辑。
        位置与大小存成<strong>相对头部区域</strong>的偏移（头长的倍数）与缩放倍率，换个角色也落在同一个相对位置。
        <br />
        播放到末尾：勾选「循环播放」会从头再播一遍，不勾则<strong>自动停止并回到缩略图</strong>（初始状态）。
        当前：横向 {(poster.offsetX ?? 0).toFixed(2)} 个头宽、纵向 {(poster.offsetY ?? 0).toFixed(2)} 个头宽、
        缩放 {Math.round((poster.scale ?? 1) * 100)}%
        {geometry ? `（头部方框约 ${Math.round(geometry.headOut)}px）` : ""}。
      </div>
    </div>
  );
};

export default SpriteAnimationPreview;
