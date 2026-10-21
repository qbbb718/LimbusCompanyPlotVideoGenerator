/**
 * @module 镜头播放（预览用）
 *
 * 按**帧**推进，时长由调用方决定（现在就是镜头的移动时长 `moveFrames`，
 * 所以"播一遍"= 走完这段运镜，而不是把整条台词从头放到尾）。
 *
 * <p>帧率与后端 `ProjectConfig.FRAME_RATE` 一致，进度换算统一走
 * `cameraView.cameraProgressOf`，保证预览、最终效果播放、导出三者同步。
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** 成片帧率（与后端 ProjectConfig.FRAME_RATE 一致） */
export const FRAME_RATE = 30;

/** 兜底：没给帧数时按 1 秒播 */
const FALLBACK_FRAMES = FRAME_RATE;

export interface CameraPlayback {
  /** 当前进度 0~1（对应"要播的那几帧"）；null = 没在播 */
  t: number | null;
  /** 要播的总帧数（= 移动时长，最多到记录时长） */
  frames: number;
  /** 已播帧数（浮点，用来算镜头进度） */
  elapsedFrames: number;
  playing: boolean;
  /** 从头播 */
  play: () => void;
  stop: () => void;
}

/**
 * @param totalFrames 这次要播多少帧（镜头移动时长；记录更短时传记录时长）
 */
export function useCameraPlayback(totalFrames: number): CameraPlayback {
  const frames = Math.max(1, Math.round(totalFrames || 0)) || FALLBACK_FRAMES;
  const [t, setT] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

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
    setT(null);
  }, [cancel]);

  const play = useCallback(() => {
    cancel();
    const durationMs = Math.max(120, Math.round((frames / FRAME_RATE) * 1000));
    startRef.current = Date.now();
    setT(0);

    const step = () => {
      const elapsed = Date.now() - startRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      setT(progress);
      if (progress < 1) {
        rafRef.current =
          typeof requestAnimationFrame === "function"
            ? requestAnimationFrame(step)
            : (setTimeout(step, 16) as unknown as number);
      } else {
        rafRef.current = null;
        // 播完停在终点，方便看清落点；再点播放会从头开始
        setT(1);
      }
    };

    rafRef.current =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(step)
        : (setTimeout(step, 16) as unknown as number);
  }, [cancel, frames]);

  // 卸载时停掉动画帧
  useEffect(() => cancel, [cancel]);

  return {
    t,
    frames,
    elapsedFrames: t === null ? 0 : t * frames,
    playing: t !== null,
    play,
    stop,
  };
}
