import React from "react";
import { MyCharacter } from "@types";
import { AppConfig } from "@root/features/common/config/appConfig";
import { getDefaultPortrait } from "@features/common/utils/portraitUtils";

interface CharacterAvatarProps {
  character: MyCharacter;
}

const CharacterAvatar: React.FC<CharacterAvatarProps> = ({ character }) => {
  // 默认立绘由后端 defaultPortrait 标记决定，取不到时回退到第一个立绘
  const defaultPortrait = getDefaultPortrait(character.portraits);
  const thumbnailPath = defaultPortrait?.thumbnailPath;

  return (
    <div className="character-avatar">
      {/* 显示角色默认立绘的缩略图 */}
      {defaultPortrait && thumbnailPath ? (
        (() => {
          // 优先使用Electron API直接读取本地文件
          if (thumbnailPath.startsWith("/") && window.electronAPI) {
            // 使用配置文件中的路径设置
            const filePath = `${AppConfig.api.baseUrl}${thumbnailPath}?t=${Date.now()}`;

            return React.createElement("img", {
              src: filePath,
              alt: defaultPortrait.portName,
              className: "character-thumbnail",
              style: {
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "4px",
              },
              onError: (e) => {
                // 如果加载失败，尝试使用Electron API
                if (thumbnailPath.startsWith("/") && window.electronAPI) {
                  // file:read IPC 现在统一按项目根目录解析路径，
                  // 无论是否带开头的 / 都能正确解析，无需再 .substring(1)
                  window.electronAPI
                    .readFile(thumbnailPath)
                    .then((buffer) => {
                      const blob = new Blob([new Uint8Array(buffer)]);
                      const url = URL.createObjectURL(blob);
                      (e.currentTarget as HTMLImageElement).src = url;
                    })
                    .catch((err) => {
                      console.error("[CharacterAvatar] 加载缩略图失败", err);
                    });
                }
              },
            });
          } else {
            // 如果没有Electron API或路径不是以/开头，使用HTTP请求
            const httpUrl = thumbnailPath.startsWith("/")
              ? AppConfig.api.baseUrl + thumbnailPath + "?t=" + Date.now()
              : thumbnailPath + "?t=" + Date.now();

            return React.createElement("img", {
              src: httpUrl,
              alt: defaultPortrait.portName,
              className: "character-thumbnail",
              style: {
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "4px",
              },
            });
          }
        })()
      ) : (
        <div className="avatar-placeholder">头像</div>
      )}
    </div>
  );
};

export default CharacterAvatar;
