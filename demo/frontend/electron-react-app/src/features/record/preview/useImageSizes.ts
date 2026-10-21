/**
 * @module 原图尺寸预加载
 *
 * 几何模块算矩形必须知道图片的**原图像素尺寸**（立绘按裁剪框缩放、背景按 contain 缩放），
 * 而记录里只存路径。这里用 `new Image()` 把地址加载一遍拿 `naturalWidth/naturalHeight`，
 * 结果放在模块级缓存里——同一张立绘在几十条记录里复用，只会加载一次。
 *
 * 失败（404 / 后端没起来 / WebP 老素材）不会无限重试：失败的地址记进 `failedCache`，
 * 对应的图层由几何模块跳过并记进 `missingSizes`，不会阻塞其它图层。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageSize } from "./previewLayout";

/** 成功拿到的尺寸（模块级缓存，跨记录复用） */
const sizeCache = new Map<string, ImageSize>();
/** 加载失败的地址：不再重试，避免每次渲染都重新发请求 */
const failedCache = new Set<string>();

/** 只给调试/测试用：清空缓存 */
export function clearImageSizeCache(): void {
  sizeCache.clear();
  failedCache.clear();
}

/** 从缓存里挑出这些地址的尺寸（没加载到的不会出现在结果里） */
const pickSizes = (urls: string[]): Record<string, ImageSize> => {
  const result: Record<string, ImageSize> = {};
  urls.forEach((url) => {
    const size = sizeCache.get(url);
    if (size) result[url] = size;
  });
  return result;
};

/**
 * 批量预加载图片尺寸。
 *
 * <p>调用方应该传**引用稳定**的数组（在父组件用 useMemo 算好），否则每次渲染都会重建
 * sizes 对象、把依赖它的几何计算全部作废。
 *
 * @param urls 需要加载的地址（可以含重复/空串，内部会去重）
 * @returns `sizes`：地址 → 尺寸（只含已加载成功的）；`pending`：还在加载的数量
 */
export function useImageSizes(urls: string[]): {
  sizes: Record<string, ImageSize>;
  pending: number;
} {
  const [version, setVersion] = useState(0);

  // 用字符串做 effect 依赖：调用方每次渲染都可能新建数组，直接依赖数组会无限触发加载
  const urlKey = urls.join("|");
  const urlsRef = useRef(urls);
  urlsRef.current = urls;

  useEffect(() => {
    let cancelled = false;
    const list = Array.from(new Set(urlsRef.current.filter(Boolean)));
    const targets = list.filter(
      (url) => !sizeCache.has(url) && !failedCache.has(url),
    );
    if (targets.length === 0) return;

    // 所有加载完（成功或失败）合并成一次重渲染，避免 N 张图触发 N 次 setState
    let remaining = targets.length;
    const settle = () => {
      remaining -= 1;
      if (!cancelled && remaining <= 0) setVersion((value) => value + 1);
    };

    const images = targets.map((url) => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          sizeCache.set(url, {
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        } else {
          failedCache.add(url);
        }
        settle();
      };
      image.onerror = () => {
        failedCache.add(url);
        settle();
      };
      image.src = url;
      return image;
    });

    return () => {
      cancelled = true;
      // 组件卸载/换记录时丢掉回调，避免对已卸载组件 setState
      images.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [urlKey]);

  const sizes = useMemo(() => {
    void version; // 有图加载完（version 变化）时重新挑一遍
    return pickSizes(urls);
  }, [urls, version]);

  const pending = useMemo(() => {
    void version;
    return urls.filter(
      (url) => url && !sizeCache.has(url) && !failedCache.has(url),
    ).length;
  }, [urls, version]);

  return { sizes, pending };
}
