/**
 * @module 情绪动画素材库（前端缓存 + 订阅）
 *
 * 素材列表在"每张立绘卡片一个面板"的场景里会被反复用到，而它是**全局共享**的资源，
 * 每个面板各自请求一次就会在新建 8 个立绘时打 8 次接口。
 * 这里做一层模块级缓存：第一次请求后共享，导入/删除后 `invalidateAnimationClips()` 统一失效，
 * 所有在用的面板通过订阅自动刷新。
 *
 * <p>为什么不用 Context：面板分布在"立绘"与"临时图片"两棵很深的树里，为它套一层 Provider
 * 会牵动无关的组件与测试；模块级缓存 + 订阅是这里最轻的做法（`useImageSizes` 也是同一思路）。
 */
import { useCallback, useEffect, useState } from "react";
import log from "electron-log";

import ApiService from "@services/ApiService";
import type { AnimationClipDto } from "./animationClipAsset";

/** 已加载的素材列表；`null` = 还没请求过 */
let cache: AnimationClipDto[] | null = null;
let inflight: Promise<AnimationClipDto[]> | null = null;
let loadError: string | null = null;

/** 在用的面板（失效时通知它们重渲染） */
const listeners = new Set<() => void>();

/** 通知所有面板"素材列表变了"（导入 / 删除 / 改名之后调用） */
export function invalidateAnimationClips(): void {
  cache = null;
  inflight = null;
  listeners.forEach((listener) => listener());
}

/** 仅测试用：把缓存清回初始状态（不动订阅者） */
export function resetAnimationClipLibraryForTesting(): void {
  cache = null;
  inflight = null;
  loadError = null;
  listeners.clear();
}

/** 请求素材列表（同一时刻只发一次，多个调用方共享同一个 Promise） */
function load(): Promise<AnimationClipDto[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = ApiService.listAnimationClips()
    .then((list) => {
      cache = Array.isArray(list) ? (list as AnimationClipDto[]) : [];
      loadError = null;
      return cache;
    })
    .catch((error: any) => {
      // 失败不缓存：下次挂载还能再试（后端可能只是还没启动）
      inflight = null;
      loadError = error?.message || "加载动画素材失败";
      log.warn("[情绪动画] 素材列表加载失败:", loadError);
      return [];
    });
  return inflight;
}

export interface AnimationClipLibrary {
  clips: AnimationClipDto[];
  /** 首次加载中（用于显示"加载中…"而不是"还没有素材"） */
  loading: boolean;
  /** 加载失败的原因（界面可以显示，但不该挡住编辑） */
  error: string | null;
  /** 强制重新拉取 */
  reload: () => void;
  /** 按 id 找素材；找不到说明素材被删了（记录里仍然引用着） */
  find: (clipId: string | undefined | null) => AnimationClipDto | undefined;
}

export function useAnimationClipLibrary(): AnimationClipLibrary {
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let cancelled = false;
    const notify = () => {
      if (!cancelled) setVersion((value) => value + 1);
    };
    listeners.add(notify);

    if (cache === null) {
      setLoading(true);
      load().then(() => {
        if (!cancelled) setLoading(false);
        notify();
      });
    }

    return () => {
      cancelled = true;
      listeners.delete(notify);
    };
  }, []);

  const reload = useCallback(() => {
    invalidateAnimationClips();
    setLoading(true);
    load().then(() => setLoading(false));
  }, []);

  // version 只用于"失效后重算"，不参与实际计算
  void version;

  const clips = cache ?? [];
  const find = useCallback(
    (clipId: string | undefined | null): AnimationClipDto | undefined =>
      clipId ? clips.find((clip) => clip.id === clipId) : undefined,
    [clips],
  );

  return { clips, loading, error: loadError, reload, find };
}
