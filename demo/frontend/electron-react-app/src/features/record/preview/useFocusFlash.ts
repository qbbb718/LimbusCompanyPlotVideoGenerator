/**
 * @module 属性面板定位高亮
 *
 * 从预览里点中一个元素后，属性面板要滚动到对应条目并闪一下边框——
 * 否则用户切了页签还得自己在长列表里翻。
 *
 * 与「文本 → 全局显示速度」的跳转高亮（`GlobalProperties` 的 `highlightTextSpeed`）同一套视觉，
 * 这里抽成 Hook 供「立绘 / 临时图片 / 背景」三个列表面板复用。
 */
import { useEffect, useRef, useState } from "react";
import type { PropertyFocusKind, PropertyFocusRequest } from "./previewTargets";

/** 闪烁时长（与 RecordEditor.css 的 property-focus-flash 动画一致） */
export const PROPERTY_FOCUS_FLASH_MS = 1600;

/**
 * 响应一次定位请求：滚到目标条目并高亮一段时间。
 *
 * @param request  定位请求；`null` / 类型不匹配时什么都不做
 * @param kind     本面板负责的目标类型（不匹配的请求会被忽略）
 * @param resolve  按数组下标取条目 DOM 节点
 * @returns 正在闪烁的条目下标（没有则 null），供组件拼 className
 */
export function useFocusFlash(
  request: PropertyFocusRequest | null | undefined,
  kind: PropertyFocusKind,
  resolve: (index: number) => HTMLElement | null | undefined,
): number | null {
  const [flashingIndex, setFlashingIndex] = useState<number | null>(null);

  // resolve 通常是内联箭头函数（每次渲染都是新引用），用 ref 存最新的一份，
  // 避免把它写进 effect 依赖导致每渲染一次就重新滚动。
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  useEffect(() => {
    if (!request || request.kind !== kind) return;
    const index = request.index;
    if (index < 0) return;

    const element = resolveRef.current(index);
    element?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });

    setFlashingIndex(index);
    const timer = window.setTimeout(
      () => setFlashingIndex(null),
      PROPERTY_FOCUS_FLASH_MS,
    );
    return () => window.clearTimeout(timer);
  }, [request, kind]);

  return flashingIndex;
}
