/**
 * @module 立绘动画 - 预览播放控制器
 *
 * 按**帧**推进的播放器：一个播放头同时驱动"镜头"和"立绘/图片动画"。
 *
 * <p>为什么不是两套播放器：镜头与立绘动画共用同一条记录时间轴，一旦分成两个 rAF 循环，
 * 两者就会各走各的、出现"镜头已经停了但立绘还在抖"的错位；而且播放/停止/跳转要按两次。
 *
 * <p>帧率与成片一致（{@link FRAME_RATE}），进度换算与后端共用一个公式，
 * 所以"播到第 N 帧"与导出视频的第 N 帧是同一时刻。
 *
 * <p>本 hook 只管**预览**：速度、循环都不入库、不影响成片（成片的时间由数据里的
 * `durationFrames / timeScale` 决定）。
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { FRAME_RATE } from "./useCameraPlayback";

/** 兜底：没给帧数时按 1 秒播 */
const FALLBACK_FRAMES = FRAME_RATE;

export interface TimelinePlayback {
  /** 是否在播 */
  playing: boolean;
  /** 当前整数帧（0 ~ totalFrames-1）；null = 没在播（此时调用方应按第 0 帧静态显示） */
  frame: number | null;
  /** 已播的浮点帧数（镜头进度插值要用，不能用取整后的帧） */
  elapsedFrames: number;
  /** 要播的总帧数 */
  totalFrames: number;
  /** 0~1 进度 */
  progress: number;
  /** 预览速度倍率（只影响观感，不入库） */
  speed: number;
  /** 循环播放 */
  loop: boolean;
  play: () => void;
  stop: () => void;
  /** 跳到某帧（会停在那一帧，不自动继续播） */
  seek: (frame: number) => void;
  setSpeed: (speed: number) => void;
  setLoop: (loop: boolean) => void;
}

/**
 * @param totalFrames 这次要播多少帧（记录时长；至少 1）
 */
export function useTimelinePlayback(totalFrames: number): TimelinePlayback {
  const frames = Math.max(1, Math.round(totalFrames || 0)) || FALLBACK_FRAMES;
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [speed, setSpeedState] = useState(1);
  const [loop, setLoopState] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  // rAF 回调里读最新值用，避免把 speed/loop 塞进依赖导致重启播放
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const framesRef = useRef(frames);
  framesRef.current = frames;

  const cancel = useCallback(() => {
    if (rafRef.current !== null) {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafRef.current);
      } else {
        clearTimeout(rafRef.current as unknown as number);
      }
      rafRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cancel();
    setElapsed(null);
  }, [cancel]);

  const requestFrame = useCallback((callback: () => void) => {
    return typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(callback)
      : (setTimeout(callback, 16) as unknown as number);
  }, []);

  const play = useCallback(() => {
    cancel();
    startRef.current = Date.now();
    setElapsed(0);

    const step = () => {
      const durationMs = Math.max(
        120,
        Math.round((framesRef.current / FRAME_RATE) * 1000 / Math.max(0.1, speedRef.current)),
      );
      const raw = (Date.now() - startRef.current) / durationMs;
      if (raw >= 1) {
        if (loopRef.current) {
          // 循环：把起点顺延一整轮，避免用取模导致每帧抖动
          startRef.current += durationMs;
          setElapsed(0);
          rafRef.current = requestFrame(step);
          return;
        }
        // 播完停在最后一帧：方便看清落点（再点播放从头开始）
        setElapsed(framesRef.current - 1);
        rafRef.current = null;
        return;
      }
      setElapsed(raw * (framesRef.current - 1));
      rafRef.current = requestFrame(step);
    };

    rafRef.current = requestFrame(step);
  }, [cancel, requestFrame]);

  const seek = useCallback(
    (frame: number) => {
      cancel();
      const clamped = Math.min(Math.max(0, Math.round(frame)), framesRef.current - 1);
      // 用 elapsed 非 null 表示"正在显示某一帧"，这样场景层会切到 DOM 渲染路径
      setElapsed(clamped);
    },
    [cancel],
  );

  const setSpeed = useCallback((next: number) => {
    const safe = Number.isFinite(next) && next > 0 ? Math.min(4, Math.max(0.1, next)) : 1;
    setSpeedState(safe);
  }, []);

  const setLoop = useCallback((next: boolean) => setLoopState(!!next), []);

  // 卸载时停掉动画帧
  useEffect(() => cancel, [cancel]);

  const elapsedFrames = elapsed === null ? 0 : elapsed;
  return {
    playing: elapsed !== null,
    frame: elapsed === null ? null : Math.min(frames - 1, Math.floor(elapsed)),
    elapsedFrames,
    totalFrames: frames,
    progress: frames <= 1 ? (elapsed === null ? 0 : 1) : elapsedFrames / (frames - 1),
    speed,
    loop,
    play,
    stop,
    seek,
    setSpeed,
    setLoop,
  };
}
