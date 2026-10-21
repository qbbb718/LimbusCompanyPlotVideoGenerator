/**
 * @module 容器尺寸
 *
 * 预览舞台不再依赖 CSS 的 `aspect-ratio` 自动布局（那套在 flex 容器里受
 * max-width/max-height 影响时行为不稳定），而是**实测容器像素、自己算等比矩形**：
 * 舞台的位置和大小都用 px 绝对定位，热区/叠框再用百分比铺在舞台里，
 * 这样"舞台 == 图片 == 百分比坐标系"三者严格一致，缩放窗口时不会错位。
 */
import { useEffect, useRef, useState } from "react";
import type { ImageSize } from "./previewLayout";

/**
 * 观察元素尺寸。
 *
 * @returns `ref` 要挂在容器上；`size` 容器的 CSS 像素宽高（初始为 0，挂载后立刻测一次）
 */
export function useElementSize<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  size: ImageSize;
} {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ImageSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    };

    update();

    // jsdom 环境没有 ResizeObserver（单测），退化成只测一次 + 监听窗口大小
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
