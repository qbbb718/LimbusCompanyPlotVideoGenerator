/**
 * @module 立绘动画 - 预览用的"记录总帧数"
 *
 * 预览的播放头必须与成片同长度，否则"播到结尾"和"导出视频的结尾"不是同一时刻，
 * 进度条、跳帧、循环全都会错位。
 *
 * <p>时长公式在后端（`max(文字, 音频, 动画) + stayFrames`），前端算不出来：
 * 音频长度要解码、文字动画的逐帧展开规则也和大模型那侧不一致。所以这里向后端
 * `POST /api/records/duration` 要一个准数，**边缘失败不改行为**：
 *
 * - 请求期间沿用上一次的值（不闪回近似值）；
 * - 请求失败 / 后端没起 → 返回 null，调用方回落到本地近似（`max(运镜, 动画结束帧)`）；
 * - 记录连续变化（打字、拖滑杆）时 debounce，并且只认**最后一次**请求的结果
 *   （否则快速编辑时旧响应会盖掉新值，表现为"改完过一会儿又跳回去"）。
 *
 * <p>与 `useTimelinePlayback` 分开，是因为"总帧数从哪来"和"怎么播"是两件事：
 * 播放器不该知道后端接口的存在，测试里也能单独替换。
 */
import { useEffect, useRef, useState } from "react";

import type { Record } from "@types";
import ApiService from "@services/ApiService";

/** debounce 默认值：30fps 下 400ms ≈ 12 帧，打字过程中不会每敲一个字就发一次请求 */
const DEFAULT_DEBOUNCE_MS = 400;

/** 时长分项（与后端 `POST /api/records/duration` 的出参一致） */
export interface RecordDurationBreakdown {
  frames: number;
  audioFrames: number;
  textFrames: number;
  animationFrames: number;
  stayFrames: number;
  frameRate: number;
}

export interface RecordDurationInfo {
  /** 后端算出的总帧数；null = 还没有准数（此时调用方用本地近似） */
  frames: number | null;
  /** 分项；拿到之前为 null */
  breakdown: RecordDurationBreakdown | null;
  /** 是否正在请求（UI 可显示一个细小的 pending 态） */
  fetching: boolean;
}

export interface UseRecordDurationOptions {
  /** false 时不发请求（比如记录还没加载完） */
  enabled?: boolean;
  /** debounce 毫秒数（测试里设为 0） */
  debounceMs?: number;
  /**
   * 取时长的实现（默认 {@link ApiService.getRecordDuration}）。
   *
   * <p>留这个口子是为了测试：真实实现要打后端，单测里换成一个受控的假函数，
   * 就能精确造出"响应乱序返回""请求失败"这类时序，不用去 mock 整个 ApiService 单例。
   */
  fetchDuration?: (
    record: Record,
    plot: boolean,
    stayFrames?: number,
  ) => Promise<RecordDurationBreakdown>;
}

/** 只接受正的有限帧数，其余一律当"没有准数" */
const normalizeFrames = (value: unknown): number | null => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(1, Math.round(numeric));
};

/**
 * @param record 当前记录（内容变化即重算）
 * @param plot 是否剧情模式（人格故事下立绘动画不参与渲染）
 * @param stayFrames 工程级结尾停留帧数
 * @param options 见 {@link UseRecordDurationOptions}
 */
export function useRecordDuration(
  record: Record | null | undefined,
  plot: boolean,
  stayFrames?: number,
  options: UseRecordDurationOptions = {},
): RecordDurationInfo {
  const enabled = options.enabled !== false;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  // 默认实现用 ref 镜像：调用方每次都传新闭包也不会让 effect 反复重跑
  const fetchRef = useRef(options.fetchDuration);
  fetchRef.current = options.fetchDuration;

  const [info, setInfo] = useState<RecordDurationInfo>({
    frames: null,
    breakdown: null,
    fetching: false,
  });
  // 只认最后一次请求：编辑期间并发请求会乱序返回
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || !record) return undefined;

    const requestId = ++requestIdRef.current;
    // 已经是 fetching 状态就复用原对象：调用方若每帧新建 record 对象（对象身份不稳定），
    // 这里会一直 setState → 重渲染 → effect 再跑，形成活锁。用同一对象让 React 直接 bail out。
    setInfo((prev) => (prev.fetching ? prev : { ...prev, fetching: true }));

    const timer = setTimeout(() => {
      const request =
        fetchRef.current ??
        ((target, isPlot, stay) => ApiService.getRecordDuration(target, isPlot, stay));
      request(record, plot, stayFrames)
        .then((data) => {
          if (requestId !== requestIdRef.current) return; // 旧响应：丢掉
          const frames = normalizeFrames(data?.frames);
          setInfo({
            frames,
            breakdown: frames === null ? null : (data as RecordDurationBreakdown),
            fetching: false,
          });
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          // 失败不改行为：保留上一次的准数（没有就继续用调用方的近似值）
          setInfo((prev) => ({ ...prev, fetching: false }));
        });
    }, Math.max(0, debounceMs));

    return () => {
      clearTimeout(timer);
    };
  }, [record, plot, stayFrames, enabled, debounceMs]);

  return info;
}
