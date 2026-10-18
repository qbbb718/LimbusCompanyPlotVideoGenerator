import React, { useEffect, useRef, useState } from "react";
import { MyCharacter } from "@types";
import { BASE_URL } from "@services/ApiService";
import { getDefaultPortrait } from "@features/common/utils/portraitUtils";
import "./CharacterSelect.css";

/** 下拉选项：角色选项带默认立绘头像；旁白/自由文本等特殊选项用文字徽标 */
export interface CharacterSelectOption {
  /** 选项值（角色 ID，或 旁白/自由文本 等哨兵值） */
  value: string;
  /** 显示名称 */
  label: string;
  /** 有值时显示该角色默认立绘的缩略图 */
  avatarCharacter?: MyCharacter;
  /** 没有头像时显示的文字徽标（如"旁""文"或角色名首字） */
  badge?: string;
  /** 在这一项之前画一条分隔线（用于把角色列表与特殊选项分开） */
  dividerBefore?: boolean;
}

interface CharacterSelectProps {
  value: string;
  options: CharacterSelectOption[];
  onChange: (value: string) => void;
  /**
   * 当前值不在 options 中时，触发按钮上显示的文本。
   * 例如角色已被删除、或"说话人"里手动输入的自定义名字。
   */
  fallbackLabel?: string;
  className?: string;
  ariaLabel?: string;
}

/** 拼接角色缩略图 URL（与立绘 tab 的缩略图规则一致） */
const resolveThumbnailUrl = (thumbnailPath: string): string => {
  if (!thumbnailPath) return "";
  if (thumbnailPath.startsWith("http")) return thumbnailPath;
  if (thumbnailPath.startsWith("/")) return BASE_URL + thumbnailPath;
  return `${BASE_URL}/assets/characters/${encodeURIComponent(thumbnailPath)}`;
};

/** 角色小头像：缩略图加载失败时露出首字占位 */
const CharacterAvatar: React.FC<{ character: MyCharacter }> = ({
  character,
}) => {
  const thumbnail = getDefaultPortrait(character.portraits)?.thumbnailPath;
  return (
    <span className="character-select-avatar" aria-hidden="true">
      <span className="character-select-avatar-fallback">
        {character.characterName.slice(0, 1)}
      </span>
      {thumbnail && (
        <img
          src={resolveThumbnailUrl(thumbnail)}
          alt=""
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
    </span>
  );
};

/** 旁白/自由文本/手动输入等特殊选项的文字徽标 */
const AvatarBadge: React.FC<{ text: string }> = ({ text }) => (
  <span
    className="character-select-avatar character-select-avatar-special"
    aria-hidden="true"
  >
    {text}
  </span>
);

/**
 * 带角色缩略图的下拉选择框。
 *
 * 原生 <select>/<option> 无法在选项里放图片，所以"说话人"和"立绘"tab 的角色选择
 * 统一用这个自定义下拉框，保证两处样式一致。
 */
const CharacterSelect: React.FC<CharacterSelectProps> = ({
  value,
  options,
  onChange,
  fallbackLabel,
  className,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 点击下拉框以外 / 按 Esc：关闭菜单
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value);
  const triggerLabel = selected?.label ?? fallbackLabel ?? "请选择角色";
  const triggerBadge =
    selected?.badge ?? (triggerLabel ? triggerLabel.slice(0, 1) : "?");

  return (
    <div
      className={`character-select${className ? ` ${className}` : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="character-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        {selected?.avatarCharacter ? (
          <CharacterAvatar character={selected.avatarCharacter} />
        ) : (
          <AvatarBadge text={triggerBadge} />
        )}
        <span className="character-select-trigger-label">{triggerLabel}</span>
        <span className="character-select-arrow">▾</span>
      </button>

      {open && (
        <div className="character-select-menu" role="listbox">
          {options.map((option) => (
            <React.Fragment key={option.value || "__empty__"}>
              {option.dividerBefore && (
                <div className="character-select-divider" />
              )}
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                title={option.label}
                className={`character-select-option${
                  option.value === value ? " selected" : ""
                }`}
                onClick={() => {
                  setOpen(false);
                  onChange(option.value);
                }}
              >
                {option.avatarCharacter ? (
                  <CharacterAvatar character={option.avatarCharacter} />
                ) : (
                  <AvatarBadge
                    text={option.badge || option.label.slice(0, 1) || "?"}
                  />
                )}
                <span className="character-select-option-name">
                  {option.label}
                </span>
              </button>
            </React.Fragment>
          ))}
          {options.length === 0 && (
            <div className="character-select-empty">暂无角色</div>
          )}
        </div>
      )}
    </div>
  );
};

export default CharacterSelect;
