import React, { useState, useRef, useEffect, memo } from "react";
import { Portrait } from "@types";
import { buildPortraitThumbnailUrl } from "@features/common/utils/portraitUtils";

interface PortraitThumbnailProps {
  portrait: Portrait;
  characterId: string;
  /**
   * 这张立绘的缩略图代次（父组件在裁剪 / 换图后 +1）。
   *
   * <p>缩略图文件名是固定的 `thumbnail_{portraitId}.png`，后端只把内容覆盖掉，
   * 路径一个字都不变，所以只能靠这个代次换一个 `?t=` 时间戳强制作废浏览器缓存，
   * 否则改完裁剪列表里还是旧头部的图。
   */
  cacheBust?: number;
  onLoadComplete?: (portraitId: string, url: string) => void;
  onError?: (portraitId: string, error: any) => void;
}

/** 给地址挂上时间戳；data: / blob: 本身就是唯一地址，挂上去反而会打不开 */
const withCacheBust = (url: string, bust: number): string => {
  if (!url || /^(data:|blob:)/i.test(url)) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${bust}`;
};

const PortraitThumbnail = memo(
  ({
    portrait,
    characterId,
    cacheBust = 0,
    onLoadComplete,
    onError,
  }: PortraitThumbnailProps) => {
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    // 已经算过的 (立绘 + 缩略图路径 + 代次)：相同就不重新拼 URL，避免反复刷新
    const cacheKeyRef = useRef<string | null>(null);
    // 上一次用的时间戳：保证每次刷新都真的换地址，同一毫秒内连着刷两次也不会撞
    const lastBustRef = useRef(0);

    // 回调放进 ref：父组件每次渲染都会传新函数，放进 effect 依赖会让缩略图反复重新加载
    const onLoadRef = useRef(onLoadComplete);
    const onErrorRef = useRef(onError);
    useEffect(() => {
      onLoadRef.current = onLoadComplete;
      onErrorRef.current = onError;
    }, [onLoadComplete, onError]);

    useEffect(() => {
      if (!portrait.thumbnailPath) {
        cacheKeyRef.current = null;
        setThumbnailUrl(null);
        return;
      }

      // 代次在 key 里：裁剪后路径不变、代次变了，也要重新取图
      const cacheKey = `${characterId}_${portrait.portraitID}_${portrait.thumbnailPath}_${cacheBust}`;
      if (cacheKeyRef.current === cacheKey) {
        return;
      }
      cacheKeyRef.current = cacheKey;

      const bust = Math.max(Date.now(), lastBustRef.current + 1);
      lastBustRef.current = bust;

      const baseUrl = buildPortraitThumbnailUrl(portrait.thumbnailPath);
      setThumbnailUrl(baseUrl ? withCacheBust(baseUrl, bust) : null);
    }, [characterId, portrait.portraitID, portrait.thumbnailPath, cacheBust]);

    if (!thumbnailUrl) {
      return <div className="thumbnail-placeholder">缩略图</div>;
    }

    return (
      <img
        src={thumbnailUrl}
        alt={portrait.portName}
        // 一次批量导入几十张立绘：让浏览器按需解码，避免同时占用主线程
        loading="lazy"
        decoding="async"
        onLoad={() => onLoadRef.current?.(portrait.portraitID, thumbnailUrl)}
        onError={(event) => onErrorRef.current?.(portrait.portraitID, event)}
      />
    );
  },
);

PortraitThumbnail.displayName = "PortraitThumbnail";

export default PortraitThumbnail;
