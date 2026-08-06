import React, { useState, useRef, useEffect, memo } from "react";
import { Portrait } from "@types";
import { AppConfig } from "@root/features/common/config/appConfig";

interface PortraitThumbnailProps {
  portrait: Portrait;
  characterId: string;
  onLoadComplete?: (portraitId: string, url: string) => void;
  onError?: (portraitId: string, error: any) => void;
}

const PortraitThumbnail = memo(
  ({
    portrait,
    characterId,
    onLoadComplete,
    onError,
  }: PortraitThumbnailProps) => {
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const cacheKey = `${characterId}_${portrait.portraitID}`;

    // 使用useRef来持久化缓存，避免组件重新渲染时丢失
    const imageCacheRef = useRef<{ [key: string]: string }>({});

    useEffect(() => {
      // 检查缓存
      if (imageCacheRef.current[cacheKey]) {
        setThumbnailUrl(imageCacheRef.current[cacheKey]);
        return;
      }

      if (!portrait.thumbnailPath) {
        return;
      }

      const baseUrl = AppConfig.api.baseUrl.replace(/\/$/, "");
      const thumbnailUrl = portrait.thumbnailPath.startsWith("/")
        ? `${baseUrl}${portrait.thumbnailPath}?t=${Date.now()}`
        : `${portrait.thumbnailPath}?t=${Date.now()}`;

      setThumbnailUrl(thumbnailUrl);
      imageCacheRef.current[cacheKey] = thumbnailUrl;
    }, [portrait.thumbnailPath, cacheKey, onLoadComplete, onError]);

    if (!thumbnailUrl && !isLoading) {
      return <div className="thumbnail-placeholder">缩略图</div>;
    }

    // 只有当有有效的thumbnailUrl时才渲染img元素
    if (!thumbnailUrl) {
      return <div className="thumbnail-placeholder">缩略图</div>;
    }

    return (
      <img
        src={thumbnailUrl}
        alt={portrait.portName}
        style={{ opacity: isLoading ? 0.5 : 1 }}
      />
    );
  },
);

PortraitThumbnail.displayName = "PortraitThumbnail";

export default PortraitThumbnail;
