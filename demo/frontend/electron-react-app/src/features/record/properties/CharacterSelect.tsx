import React, { useEffect, useRef, useState } from "react";
import { MyCharacter } from "@types";
import {
  buildPortraitThumbnailUrl,
  getDefaultPortrait,
} from "@features/common/utils/portraitUtils";
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
          src={buildPortraitThumbnailUrl(thumbnail)}
          alt=""
          // 角色可能有几十个：展开菜单时别一次性把几十张缩略图都解码，
          // 交给浏览器按"滚到可见"再加载（与角色列表里的头像同一套考虑）
          loading="lazy"
          decoding="async"
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
 * <p>原生 `<select>`/`<option>` 无法在选项里放图片，所以凡是"要按脸挑角色"的地方都用这个
 * 自定义下拉：剧情编辑的「说话人」与「立绘」、资源管理 → 序列帧动画预览的「角色」，
 * 三处共用同一个组件，观感与交互保持一致。
 *
 * <h3>键盘</h3>
 * 触发器上 `↓`/`↑` 直接展开（原生 select 的肌肉记忆），`Esc` 收起；展开后焦点自动落到
 * **当前选中项**，`↑↓`/`Home`/`End` 移动、`Enter` 选定（选项本身是 button，原生行为）、
 * `Esc` 收起并把焦点还回触发器、`Tab` 离开顺手收起。这套交互与「情绪动画」下拉
 * （`EmotionAnimPicker`）完全一致，两处共用一个手感。
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  /** 每个选项的 DOM，用来在键盘导航时搬焦点 */
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const triggerLabel = selected?.label ?? fallbackLabel ?? "请选择角色";
  const triggerBadge =
    selected?.badge ?? (triggerLabel ? triggerLabel.slice(0, 1) : "?");

  /** 收起菜单；`focusTrigger` 用于键盘操作（Esc / 选定后把焦点交回去） */
  const closeMenu = (focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

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

  // 展开时把焦点落到当前选中项：键盘用户一进来就在自己那一项，不用从头数。
  // 菜单与 open 是同一次提交渲染出来的，effect 里 ref 已经挂好，不需要 setTimeout。
  useEffect(() => {
    if (!open) return;
    const index = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(index);
    optionRefs.current[index]?.focus();
    // 只在"刚展开"时定位一次：选中后重渲染不需要重新抢焦点
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 菜单里真正拿到焦点的是哪一项（找不到时退回 activeIndex） */
  const focusedIndex = () => {
    const found = optionRefs.current.findIndex(
      (node) => node !== null && node === document.activeElement,
    );
    return found >= 0 ? found : activeIndex;
  };

  const moveActive = (next: number) => {
    const clamped = Math.max(0, Math.min(options.length - 1, next));
    setActiveIndex(clamped);
    optionRefs.current[clamped]?.focus();
  };

  /** 菜单内的键盘导航：↑↓/Home/End 移动焦点，Esc 关闭，Tab 离开即收起 */
  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(focusedIndex() + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(focusedIndex() - 1);
        break;
      case "Home":
        event.preventDefault();
        moveActive(0);
        break;
      case "End":
        event.preventDefault();
        moveActive(options.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        // 不拦默认行为：焦点照常离开，菜单顺手收起
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div
      className={`character-select${className ? ` ${className}` : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        ref={triggerRef}
        className="character-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        // 名字长时触发器会省略号，悬浮看全名
        title={triggerLabel}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          // ↓/↑ 直接展开（原生 select 的肌肉记忆）；Esc 收起
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
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
        <div
          className="character-select-menu"
          role="listbox"
          // 名字刻意与触发器不同：两个元素都叫"说话人"时，`getByLabelText("说话人")` 会撞车
          aria-label={ariaLabel ? `${ariaLabel}选项列表` : undefined}
          onKeyDown={handleMenuKeyDown}
        >
          {options.map((option, index) => (
            <React.Fragment key={option.value || "__empty__"}>
              {option.dividerBefore && (
                <div className="character-select-divider" />
              )}
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                // 选项不进 Tab 序：Tab 应该直接离开这个下拉（见 handleMenuKeyDown）
                tabIndex={-1}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                title={option.label}
                className={`character-select-option${
                  option.value === value ? " selected" : ""
                }`}
                onClick={() => {
                  closeMenu(true);
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
