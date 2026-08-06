import React from "react";
import { MyCharacter } from "@types";
import { AppConfig } from "@root/features/common/config/appConfig";

interface NamePreviewProps {
  character: MyCharacter;
}

const NamePreview: React.FC<NamePreviewProps> = ({ character }) => {
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error(
      "[NamePreview] 名片图片加载失败",
      character.characterCardImagePath,
    );
    // 如果加载失败，显示简单的文字预览
    const container = e.currentTarget.parentElement;
    if (container) {
      container.innerHTML = `
        <div
          className="name-preview"
          style="background-color: ${character.colorBg}; color: ${character.colorText};"
        >
          ${character.characterName}
        </div>
        <div className="preview-note">名片图片加载失败</div>
      `;
    }
  };

  if (character.characterCardImagePath) {
    return (
      <div className="character-card-image-preview">
        <img
          src={`${AppConfig.api.baseUrl}${character.characterCardImagePath}?t=${Date.now()}`}
          onLoad={() =>
            console.log(
              "[NamePreview] 名片图片加载成功",
              character.characterCardImagePath,
            )
          }
          alt="角色名片"
          onError={handleImageError}
        />
      </div>
    );
  } else {
    return (
      <>
        <div
          className="name-preview"
          style={{
            backgroundColor: character.colorBg,
            color: character.colorText,
          }}
        >
          {character.characterName}
        </div>
        <div className="preview-note">保存角色后将生成名片图片</div>
      </>
    );
  }
};

export default NamePreview;
