import React, { useEffect, useMemo, useRef, useState } from "react";
import { MyCharacter } from "@types";
import { AppConfig } from "@root/features/common/config/appConfig";
import { getDefaultPortrait } from "@features/common/utils/portraitUtils";
import { normalizeAssetUrl } from "@features/common/utils/assetPath";

interface CharacterAvatarProps {
  character: MyCharacter;
}

/**
 * 缩略图 URL 的"代次"。
 *
 * <p>缩略图文件名是固定的（`thumbnail_{portraitId}.png`），改完裁剪只能靠 URL 上的
 * 时间戳参数让浏览器重新取图。但时间戳<b>不能</b>在渲染时用 `Date.now()` 现算：
 * 那样每次重渲染都会产生一个新地址，整个角色列表的缩略图会被反复重新下载。
 *
 * <p>以前这里就是 `?t=${Date.now()}` 直接写在渲染里，于是"在搜索框里打一个字"或
 * "保存完一个角色"都会把所有头像重新拉一遍。主线程忙着解码一堆图片时，
 * 输入框就会表现为"打不了字、丢焦点"——这正是用户反馈的现象。
 *
 * <p>现在每个角色只记一个时间戳（按 characterId + thumbnailPath 记忆），
 * 只有缩略图真的换了（路径变了）才生成新地址。
 */
const thumbVersionStore = new Map<string, number>();

const cacheBustFor = (characterId: string, thumbnailPath: string): number => {
  const key = `${characterId}|${thumbnailPath}`;
  const existing = thumbVersionStore.get(key);
  if (existing !== undefined) return existing;
  const version = Date.now();
  thumbVersionStore.set(key, version);
  return version;
};

const CharacterAvatar: React.FC<CharacterAvatarProps> = ({ character }) => {
  // 默认立绘由后端 defaultPortrait 标记决定，取不到时回退到第一个立绘
  const defaultPortrait = getDefaultPortrait(character.portraits);
  const thumbnailPath = defaultPortrait?.thumbnailPath;

  // 地址只在 (characterId, thumbnailPath) 变化时重算：
  // 父组件因为别的原因重渲染（搜索输入、批量导入进度…）不会触发重新下载。
  const imageUrl = useMemo(() => {
    if (!thumbnailPath || !thumbnailPath.trim()) return null;
    const url = normalizeAssetUrl(thumbnailPath, AppConfig.api.baseUrl) ?? "";
    if (!url) return null;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}t=${cacheBustFor(character.characterID, thumbnailPath)}`;
  }, [character.characterID, thumbnailPath]);

  // Electron 下 HTTP 静态资源偶尔取不到（例如路径还是绝对 URL 的旧数据），
  // 退回用 IPC 直接读本地文件；只尝试一次，失败就显示占位符。
  const [fileFallbackUrl, setFileFallbackUrl] = useState<string | null>(null);
  const [fallbackTried, setFallbackTried] = useState(false);
  const fallbackUrlRef = useRef<string | null>(null);

  // 换角色/换立绘：清掉上一次的兜底状态，并释放上一个 blob URL（否则每换一次泄漏一张图）
  useEffect(() => {
    setFileFallbackUrl(null);
    setFallbackTried(false);
    return () => {
      if (fallbackUrlRef.current) {
        URL.revokeObjectURL(fallbackUrlRef.current);
        fallbackUrlRef.current = null;
      }
    };
  }, [character.characterID, thumbnailPath]);

  const handleError = () => {
    if (fallbackTried || !thumbnailPath || !window.electronAPI?.readFile) {
      setFallbackTried(true);
      return;
    }
    setFallbackTried(true);
    window.electronAPI
      .readFile(thumbnailPath)
      .then((buffer) => {
        const blob = new Blob([new Uint8Array(buffer)]);
        const url = URL.createObjectURL(blob);
        fallbackUrlRef.current = url;
        setFileFallbackUrl(url);
      })
      .catch((err) => {
        console.error("[CharacterAvatar] 加载缩略图失败", err);
      });
  };

  const src = fileFallbackUrl ?? imageUrl;

  return (
    <div className="character-avatar">
      {/* 显示角色默认立绘的缩略图 */}
      {defaultPortrait && thumbnailPath && src ? (
        <img
          src={src}
          alt={defaultPortrait.portName}
          className="character-thumbnail"
          // 列表里可能有几十个角色：让浏览器只在滚动到可见时解码，
          // 避免打开页面/保存角色后一次性解码几十张图把主线程占满
          loading="lazy"
          decoding="async"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "4px",
          }}
          onError={handleError}
        />
      ) : (
        <div className="avatar-placeholder">头像</div>
      )}
    </div>
  );
};

export default CharacterAvatar;
