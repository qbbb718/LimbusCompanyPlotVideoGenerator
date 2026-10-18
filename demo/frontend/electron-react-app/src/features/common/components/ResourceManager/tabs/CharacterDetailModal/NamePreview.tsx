import React, { useEffect, useMemo, useRef, useState } from "react";
import { MyCharacter } from "@types";
import { AppConfig } from "@root/features/common/config/appConfig";
import ApiService from "@services/ApiService";

interface NamePreviewProps {
  character: MyCharacter;
}

/**
 * 角色名片预览（资源管理 → 角色 → 名片预览）。
 *
 * 默认显示后端已保存的名片图片；右上角的刷新按钮会把弹窗里「当前参数」
 * （名称 / 阵营 / 文字颜色 / 背景颜色，可以是还没保存的修改）发给后端即时渲染一张，
 * 渲染结果立刻显示在预览区。这样改完参数不必先保存、更不必重启应用才能看到新名片。
 */
const NamePreview: React.FC<NamePreviewProps> = ({ character }) => {
  // 是否正在等后端渲染
  const [refreshing, setRefreshing] = useState(false);
  // 刷新失败提示（成功后清空）
  const [refreshError, setRefreshError] = useState<string | null>(null);
  // 加载失败的那张图的地址；按地址记录，换一张图就自动恢复显示
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // 刷新渲染出来的名片：blob URL + 渲染时用到的参数快照
  const [renderedCard, setRenderedCard] = useState<{
    url: string;
    params: string;
  } | null>(null);
  // 当前持有的 blob URL，换新图/卸载时释放，避免内存泄漏
  const blobUrlRef = useRef<string | null>(null);

  // 名片只由这几个字段决定：参数一变，之前刷新出来的图就过期了，不再继续显示
  const cardParams = useMemo(
    () =>
      [
        character.characterName ?? "",
        character.faction ?? "",
        character.colorBg ?? "",
        character.colorText ?? "",
      ].join("|"),
    [
      character.characterName,
      character.faction,
      character.colorBg,
      character.colorText,
    ],
  );

  // 已保存名片的防缓存参数：只取一次（挂载 / 切换角色时），
  // 否则每次输入都会生成新 URL，白白重新下载整张名片。
  const savedImageVersion = useMemo(() => Date.now(), [character.characterID]);

  const savedImageUrl = character.characterCardImagePath
    ? `${AppConfig.api.baseUrl}${character.characterCardImagePath}?v=${savedImageVersion}`
    : null;

  // 刷新图优先（参数没变才有效），否则回退到后端已保存的名片
  const refreshedUrl =
    renderedCard && renderedCard.params === cardParams ? renderedCard.url : null;
  const imageUrl = refreshedUrl || savedImageUrl;

  // 卸载时释放 blob URL
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const handleRefresh = async () => {
    if (refreshing) return;

    const characterName = (character.characterName || "").trim();
    if (!characterName) {
      setRefreshError("请先填写角色名称，再刷新名片");
      return;
    }

    setRefreshing(true);
    setRefreshError(null);
    console.log("[NamePreview] 用当前参数渲染名片", {
      characterName,
      faction: character.faction,
      colorBg: character.colorBg,
      colorText: character.colorText,
    });

    try {
      const url = await ApiService.renderCharacterCardPreview(character);
      // 释放上一张刷新图，只保留最新的一张
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      blobUrlRef.current = url;
      setRenderedCard({ url, params: cardParams });
      // 新图地址与旧图不同，失败标记自然不会影响它
      console.log("[NamePreview] 名片渲染完成", url);
    } catch (error: any) {
      console.error("[NamePreview] 名片渲染失败", error);
      const status = error?.response?.status;
      setRefreshError(
        status === 404
          ? "刷新失败：后端没有名片预览接口，请重启后端服务后再试"
          : "刷新失败，请确认后端服务是否正常",
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleImageError = () => {
    console.error("[NamePreview] 名片图片加载失败", imageUrl);
    setFailedSrc(imageUrl);
  };

  const hasImage = Boolean(imageUrl) && imageUrl !== failedSrc;

  const refreshButton = (
    <button
      type="button"
      className={`card-refresh-button${refreshing ? " is-loading" : ""}${
        hasImage ? "" : " card-refresh-button--inline"
      }`}
      onClick={handleRefresh}
      disabled={refreshing}
      title="用当前参数重新渲染名片图片"
      aria-label="刷新名片图片"
    >
      <svg className="card-refresh-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
      </svg>
      <span>{refreshing ? "渲染中" : "刷新"}</span>
    </button>
  );

  // 底部说明：优先显示刷新错误，其次区分"没有名片 / 加载失败 / 只是预览图还没保存"
  let note = "";
  if (refreshError) {
    note = refreshError;
  } else if (hasImage) {
    if (!character.characterCardImagePath) {
      note = "以上为预览图，保存角色后会生成正式名片";
    }
  } else if (imageUrl && imageUrl === failedSrc) {
    note = "名片图片加载失败";
  } else if (!character.characterCardImagePath) {
    note = "保存角色后将生成名片图片";
  }

  return (
    <>
      {hasImage ? (
        <div className="character-card-image-frame">
          <img
            src={imageUrl as string}
            alt="角色名片"
            onLoad={() => console.log("[NamePreview] 名片图片加载成功", imageUrl)}
            onError={handleImageError}
          />
          {refreshButton}
        </div>
      ) : (
        <>
          <div
            className="name-preview"
            style={{
              backgroundColor: character.colorBg,
              color: character.colorText,
            }}
          >
            {character.characterName || "未命名角色"}
          </div>
          {refreshButton}
        </>
      )}

      {note && (
        <div
          className={`preview-note${refreshError ? " preview-note--error" : ""}`}
        >
          {note}
        </div>
      )}
    </>
  );
};

export default NamePreview;
