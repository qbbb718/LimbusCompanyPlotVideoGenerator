import React, { useState, useRef, useEffect, memo } from 'react';
import { Portrait } from '../../../../types';
import { AppConfig } from '../../../../config/appConfig';

interface PortraitThumbnailProps {
  portrait: Portrait;
  characterId: string;
  onLoadComplete?: (portraitId: string, url: string) => void;
  onError?: (portraitId: string, error: any) => void;
}

const PortraitThumbnail = memo(({ portrait, characterId, onLoadComplete, onError }: PortraitThumbnailProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const cacheKey = `${characterId}_${portrait.portraitID}`;

  // 使用useRef来持久化缓存，避免组件重新渲染时丢失
  const imageCacheRef = useRef<{[key: string]: string}>({});

  useEffect(() => {
    // 检查缓存
    if (imageCacheRef.current[cacheKey]) {
      setThumbnailUrl(imageCacheRef.current[cacheKey]);
      return;
    }

    if (!portrait.thumbnailPath) {
      return;
    }

    if (portrait.thumbnailPath.startsWith('/') && window.electronAPI) {
      setIsLoading(true);

      const fileName = portrait.thumbnailPath.substring(portrait.thumbnailPath.lastIndexOf('/') + 1);
      const filePath = `${AppConfig.resources.thumbnailsBasePath}/${fileName}`;

      window.electronAPI.readFile(filePath)
        .then((buffer) => {
          const blob = new Blob([new Uint8Array(buffer)]);
          const url = URL.createObjectURL(blob);
          setThumbnailUrl(url);
          imageCacheRef.current[cacheKey] = url;
          onLoadComplete?.(portrait.portraitID, url);
        })
        .catch((err) => {
          console.error('[PortraitThumbnail] 加载缩略图失败', err);
          onError?.(portrait.portraitID, err);

          // 回退到HTTP请求
          const httpUrl = AppConfig.api.baseUrl + portrait.thumbnailPath + "?t=" + Date.now();
          setThumbnailUrl(httpUrl);
          imageCacheRef.current[cacheKey] = httpUrl;
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      // 使用HTTP请求
      const httpUrl = portrait.thumbnailPath.startsWith('/')
        ? AppConfig.api.baseUrl + portrait.thumbnailPath + "?t=" + Date.now()
        : portrait.thumbnailPath + "?t=" + Date.now();
      setThumbnailUrl(httpUrl);
      imageCacheRef.current[cacheKey] = httpUrl;
    }
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
});

PortraitThumbnail.displayName = 'PortraitThumbnail';

export default PortraitThumbnail;
