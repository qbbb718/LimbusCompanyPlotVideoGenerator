import React, { useEffect, useMemo, useState } from "react";
import { MyCharacter, Portrait } from "@types";
import {
  MISSING_THUMBNAIL_PLACEHOLDER,
  buildPortraitThumbnailUrl,
} from "@features/common/utils/portraitUtils";
import { getEmotionLabel } from "@features/common/utils/emotionMapper";
import "./PortraitScenePreview.css";

interface PortraitComparePickerProps {
  /** 素材库里的角色；null = 还没加载（或加载失败，配合 loadError 判断） */
  characters: MyCharacter[] | null;
  isLoading: boolean;
  loadError: string | null;
  /** 当前正在编辑的角色 / 立绘：选择时优先挑别的角色，并隐藏这张立绘自己 */
  currentCharacterId?: string;
  currentPortraitId?: string | null;
  /** 已经加进对比区的立绘 ID（列表里标成"已添加"并禁用） */
  addedPortraitIds: string[];
  onAdd: (character: MyCharacter, portrait: Portrait) => void;
  /** 加载角色列表失败后重试 */
  onRetry: () => void;
  onClose: () => void;
}

/** 立绘卡片标题：立绘名 + 中文情绪，两个都取不到时退回 ID */
const portraitDescription = (portrait: Portrait): string => {
  const emotion = getEmotionLabel(portrait.emotion);
  const name = portrait.portName || portrait.portraitID;
  return name ? `${name}（${emotion}）` : emotion;
};

/**
 * @component 对比角色选择器
 *
 * <p>「立绘预览」弹窗里的「＋ 添加对比角色」展开的面板：先选角色，再点某一张立绘。
 * 它渲染在预览弹窗<b>内部</b>（不是独立的 modal），所以不会被弹窗的层叠上下文盖住，
 * 也不需要再挂 ModalPortal。
 *
 * <p>列表来源是素材库（`GET /api/characters`），因此对比角色一定是<b>已保存</b>的立绘：
 * 正在编辑的新立绘还没上传，后端按 ID 找不到它。同一个角色的其它立绘也允许选 ——
 * 换表情时核对头框位置用得上，所以这里不排除当前角色，只排除当前这张立绘。
 */
const PortraitComparePicker: React.FC<PortraitComparePickerProps> = ({
  characters,
  isLoading,
  loadError,
  currentCharacterId,
  currentPortraitId,
  addedPortraitIds,
  onAdd,
  onRetry,
  onClose,
}) => {
  const [selectedCharacterId, setSelectedCharacterId] = useState("");

  /** 有立绘的角色才值得列出来（空角色选了也只会得到一条提示） */
  const charactersWithPortraits = useMemo(
    () =>
      (characters ?? []).filter(
        (character) =>
          !!character &&
          Array.isArray(character.portraits) &&
          character.portraits.some((portrait) => !!portrait?.imagePath),
      ),
    [characters],
  );

  // 默认选"别的角色"（对比的本意就是和另一个角色比）；没有别的角色时退回第一个
  useEffect(() => {
    if (charactersWithPortraits.length === 0) return;
    if (
      charactersWithPortraits.some(
        (character) => character.characterID === selectedCharacterId,
      )
    ) {
      return;
    }

    const preferred =
      charactersWithPortraits.find(
        (character) => character.characterID !== currentCharacterId,
      ) ?? charactersWithPortraits[0];
    setSelectedCharacterId(preferred.characterID);
  }, [charactersWithPortraits, currentCharacterId, selectedCharacterId]);

  const selectedCharacter =
    charactersWithPortraits.find(
      (character) => character.characterID === selectedCharacterId,
    ) ?? null;

  /** 可选立绘：去掉当前正在编辑的那一张，以及没有原图（后端渲不出来）的 */
  const selectablePortraits = (selectedCharacter?.portraits ?? []).filter(
    (portrait) =>
      !!portrait?.imagePath &&
      (!currentPortraitId || portrait.portraitID !== currentPortraitId),
  );

  return (
    <section
      className="portrait-compare-picker"
      aria-label="添加对比角色"
    >
      <div className="portrait-compare-picker-header">
        <strong>添加对比角色</strong>
        <button
          type="button"
          className="portrait-compare-picker-close"
          aria-label="关闭对比角色选择"
          title="关闭（Esc）"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {isLoading && (
        <p className="portrait-compare-picker-hint" role="status">
          正在加载角色列表…
        </p>
      )}

      {!isLoading && loadError && (
        <div className="portrait-compare-picker-error">
          <span>{loadError}</span>
          <button type="button" onClick={onRetry}>
            重试
          </button>
        </div>
      )}

      {!isLoading && !loadError && charactersWithPortraits.length === 0 && (
        <p className="portrait-compare-picker-hint">
          素材库里还没有带立绘的角色，先到「资源管理 → 角色」添加。
        </p>
      )}

      {!isLoading && !loadError && selectedCharacter && (
        <>
          <div className="portrait-compare-picker-characters">
            <label htmlFor="portrait-compare-character">对比角色</label>
            <select
              id="portrait-compare-character"
              value={selectedCharacterId}
              onChange={(event) => setSelectedCharacterId(event.target.value)}
            >
              {charactersWithPortraits.map((character) => (
                <option key={character.characterID} value={character.characterID}>
                  {character.characterName}（{character.portraits.length} 张）
                </option>
              ))}
            </select>
          </div>

          {selectablePortraits.length === 0 ? (
            <p className="portrait-compare-picker-hint">
              这个角色没有其它可对比的立绘。
            </p>
          ) : (
            <div className="portrait-compare-picker-grid">
              {selectablePortraits.map((portrait) => {
                const added = addedPortraitIds.includes(portrait.portraitID);
                return (
                  <button
                    key={portrait.portraitID}
                    type="button"
                    className={`portrait-compare-picker-card${
                      added ? " is-added" : ""
                    }`}
                    aria-pressed={added}
                    disabled={added}
                    title={
                      added
                        ? "已经在对比区里了"
                        : `添加「${portraitDescription(portrait)}」作为对比`
                    }
                    onClick={() => onAdd(selectedCharacter, portrait)}
                  >
                    <span className="portrait-compare-picker-thumb">
                      <img
                        src={
                          buildPortraitThumbnailUrl(portrait.thumbnailPath) ||
                          MISSING_THUMBNAIL_PLACEHOLDER
                        }
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          const image = event.currentTarget;
                          // 先摘掉 onerror 再换图，避免占位图自己再失败时无限递归
                          image.onerror = null;
                          image.src = MISSING_THUMBNAIL_PLACEHOLDER;
                        }}
                      />
                    </span>
                    <span className="portrait-compare-picker-name">
                      {portrait.portName || portrait.portraitID}
                    </span>
                    <span className="portrait-compare-picker-emotion">
                      {getEmotionLabel(portrait.emotion)}
                    </span>
                    {added && (
                      <span className="portrait-compare-picker-added">已添加</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default PortraitComparePicker;
