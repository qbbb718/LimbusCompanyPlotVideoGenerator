import React from "react";
import { MyCharacter } from "@types";
import { AppConfig } from "@root/features/common/config/appConfig";

interface CharacterAvatarProps {
  character: MyCharacter;
}

const CharacterAvatar: React.FC<CharacterAvatarProps> = ({ character }) => {
  return (
    <div className="character-avatar">
      {/* 显示角色默认立绘的缩略图 */}
      {character.portraits &&
      character.portraits.length > 0 &&
      character.portraits[0].thumbnailPath ? (
        (() => {
          // 优先使用Electron API直接读取本地文件
          if (
            character.portraits[0].thumbnailPath.startsWith("/") &&
            window.electronAPI
          ) {
            // 使用配置文件中的路径设置
            const fileName = character.portraits[0].thumbnailPath.substring(
              character.portraits[0].thumbnailPath.lastIndexOf("/") + 1,
            );
            const filePath = `${AppConfig.api.baseUrl}${
              character.portraits[0].thumbnailPath
            }?t=${Date.now()}`;

            return React.createElement("img", {
              src: filePath,
              alt: character.portraits[0].portName,
              className: "character-thumbnail",
              style: {
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "4px",
              },
              onError: (e) => {
                // 如果加载失败，尝试使用Electron API
                if (
                  character.portraits[0].thumbnailPath.startsWith("/") &&
                  window.electronAPI
                ) {
                  // file:read IPC 现在统一按项目根目录解析路径，
                  // 无论是否带开头的 / 都能正确解析，无需再 .substring(1)
                  window.electronAPI
                    .readFile(character.portraits[0].thumbnailPath)
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
            const httpUrl = character.portraits[0].thumbnailPath.startsWith("/")
              ? AppConfig.api.baseUrl +
                character.portraits[0].thumbnailPath +
                "?t=" +
                Date.now()
              : character.portraits[0].thumbnailPath + "?t=" + Date.now();

            return React.createElement("img", {
              src: httpUrl,
              alt: character.portraits[0].portName,
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
