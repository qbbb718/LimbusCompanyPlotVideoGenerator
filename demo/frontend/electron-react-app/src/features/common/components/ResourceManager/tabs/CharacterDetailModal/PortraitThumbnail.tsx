import React, { useState, useRef, useEffect, memo } from "react";
import { Portrait } from "@types";
import { AppConfig } from "@root/features/common/config/appConfig";

interface PortraitThumbnailProps {
  portrait: Portrait;
  characterId: string;
  /**
   * 缩略图版本号：批量重新生成缩略图后父组件会 +1。
   *
   * <p>缩略图文件名是固定的 `thumbnail_{portraitId}.png`，改名不会发生，
   * 所以只能靠这个版本号 + 时间戳参数强制作废浏览器缓存，否则改完裁剪
   * 列表里还是旧头部的图。
   */
  cacheBust?: number;
  onLoadComplete?: (portraitId: string, url: string) => void;
  onError?: (portraitId: string, error: any) => void;
}

const PortraitThumbnail = memo(
  ({
    portrait,
    characterId,
    cacheBust = 0,
    onLoadComplete,
    onError,
  }: PortraitThumbnailProps) => {
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    // 已经算过的 (立绘 + 缩略图路径 + 版本号)：相同就不重新拼 URL，避免反复刷新
    const cacheKeyRef = useRef<string | null>(null);

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

      const cacheKey = `${characterId}_${portrait.portraitID}_${portrait.thumbnailPath}_${cacheBust}`;
      if (cacheKeyRef.current === cacheKey) {
        return;
      }
      cacheKeyRef.current = cacheKey;

      const baseUrl = AppConfig.api.baseUrl.replace(/\/$/, "");
      const bust = Date.now();
      const url = portrait.thumbnailPath.startsWith("/")
        ? `${baseUrl}${portrait.thumbnailPath}?t=${bust}`
        : `${portrait.thumbnailPath}?t=${bust}`;

      setThumbnailUrl(url);
    }, [characterId, portrait.portraitID, portrait.thumbnailPath, cacheBust]);

    if (!thumbnailUrl) {
      return <div className="thumbnail-placeholder">缩略图</div>;
    }

    return (
      <img
        src={thumbnailUrl}
        alt={portrait.portName}
        onLoad={() => onLoadRef.current?.(portrait.portraitID, thumbnailUrl)}
        onError={(event) => onErrorRef.current?.(portrait.portraitID, event)}
      />
    );
  },
);

PortraitThumbnail.displayName = "PortraitThumbnail";

export default PortraitThumbnail;
