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
  /**
   * 「名字以外」的检索关键词（阵营、标签等）。
   *
   * <p>只在调用方开了 `searchable` 时参与匹配：输入内容命中这些词，这个选项同样留下来，
   * 并在名字下面补一行"命中的关键词"，否则用户会看不懂"名字里根本没有这三个字，为什么它还在"。
   */
  searchKeywords?: string[];
}

/** 检索后要显示的一项：选项本身 + 它这次是靠哪些附加关键词命中的（名字直接命中时为空） */
interface VisibleCharacterOption {
  option: CharacterSelectOption;
  matchedKeywords: string[];
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
  /**
   * 是否在菜单顶部显示检索输入框。
   *
   * <p>打开后焦点直接落在输入框，边打边过滤：匹配**名字**与 `searchKeywords`（阵营 / 标签…），
   * 大小写不敏感，空格分隔的多个词要同时命中。缺省关（立绘 / 序列帧等短列表保持原样）。
   */
  searchable?: boolean;
  /** 检索框的占位文字（缺省「搜索名称 / 阵营 / 标签…」） */
  searchPlaceholder?: string;
}

/** 检索比较用的归一化：统一小写；null/undefined 当空串（老数据缺字段时不能把整个下拉炸掉） */
const normalizeSearchText = (value: string | undefined | null) =>
  (value ?? "").toLowerCase();

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
 *
 * <h3>检索（`searchable`）</h3>
 * 角色多到要翻半天时（剧情编辑的「说话人」），菜单顶部多一个输入框：边打边过滤，
 * 名字、阵营、标签都能匹配。焦点先落在输入框，`↓` 进列表挑、第一项再 `↑` 回到输入框，
 * 只剩一个结果时回车即选定。不开这个开关的下拉行为与以前完全一致。
 */
const CharacterSelect: React.FC<CharacterSelectProps> = ({
  value,
  options,
  onChange,
  fallbackLabel,
  className,
  ariaLabel,
  searchable = false,
  searchPlaceholder,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  /** 每个选项的 DOM，用来在键盘导航时搬焦点 */
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const triggerLabel = selected?.label ?? fallbackLabel ?? "请选择角色";
  const triggerBadge =
    selected?.badge ?? (triggerLabel ? triggerLabel.slice(0, 1) : "?");

  /**
   * 检索条件：按空白切成多段，**每一段**都要在名字或任一 `searchKeywords` 里出现
   * （大小写不敏感）。所以 "N公司 浮" 两个词一起打就能一步定位到一个角色。
   * 没开 `searchable` 时恒为空数组 = 不过滤。
   */
  const searchTokens = searchable
    ? search
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length > 0)
    : [];

  /** 当前要显示的选项：没输入检索词时就是全部（顺序不变） */
  const visibleOptions: VisibleCharacterOption[] =
    searchTokens.length === 0
      ? options.map((option) => ({ option, matchedKeywords: [] }))
      : options.reduce<VisibleCharacterOption[]>((visible, option) => {
          const keywords = (option.searchKeywords ?? [])
            .map((keyword) => (keyword ?? "").trim())
            .filter((keyword) => keyword.length > 0);
          const matchedKeywords: string[] = [];
          for (const token of searchTokens) {
            // 名字命中就算这一条满足；否则去阵营 / 标签里找一条命中的记下来当提示
            if (normalizeSearchText(option.label).includes(token)) continue;
            const hit = keywords.find((keyword) =>
              normalizeSearchText(keyword).includes(token),
            );
            if (!hit) return visible;
            if (!matchedKeywords.includes(hit)) matchedKeywords.push(hit);
          }
          visible.push({ option, matchedKeywords });
          return visible;
        }, []);

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

  // 展开时把焦点放到该去的地方：有检索框就先落在输入框（键盘用户一进来就能打字），
  // 没有则落在当前选中项，不用从头数。菜单与 open 是同一次提交渲染出来的，
  // effect 里 ref 已经挂好，不需要 setTimeout。
  // 收起时顺手清掉检索词：下次展开看到的是完整列表，而不是上次的过滤结果。
  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    if (searchable) {
      searchRef.current?.focus();
      return;
    }
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
    const clamped = Math.max(0, Math.min(visibleOptions.length - 1, next));
    setActiveIndex(clamped);
    optionRefs.current[clamped]?.focus();
  };

  /**
   * 检索框里的键盘：`↑`/`↓` 直接进出选项列表（有结果时）、`Esc` 收起并把焦点交回触发器、
   * `Tab` 照常离开并顺手收起；只剩一个结果时 `回车` 直接选定。
   *
   * <p>箭头键必须 `stopPropagation`：菜单容器上那套导航逻辑同样监听它们，
   * 不拦住会"先落到第一项、再被容器挪到第二项"。`Home`/`End` 同理要拦住 ——
   * 在输入框里它们是**光标键**（跳到行首 / 行尾），不能被列表导航抢走。
   */
  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (visibleOptions.length === 0) break;
        event.preventDefault();
        event.stopPropagation();
        const index =
          event.key === "ArrowDown" ? 0 : visibleOptions.length - 1;
        setActiveIndex(index);
        optionRefs.current[index]?.focus();
        break;
      }
      case "Enter":
        // 只剩一个结果：检索完直接回车就走，不用再挪到列表里点一下
        if (visibleOptions.length === 1) {
          event.preventDefault();
          event.stopPropagation();
          const only = visibleOptions[0].option;
          closeMenu(true);
          onChange(only.value);
        }
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        break;
      case "Home":
      case "End":
        // 在检索框里 Home / End 是**光标键**（跳到行首 / 行尾），不能被菜单的列表导航吃掉；
        // 只拦冒泡，不 preventDefault，浏览器照常挪光标。
        event.stopPropagation();
        break;
      case "Tab":
        // 不拦默认行为：焦点照常离开，菜单顺手收起（与列表内的 Tab 一致）
        setOpen(false);
        break;
      default:
        break;
    }
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
        // 有检索框时，从第一项再往上 = 回到输入框（不用 Shift+Tab 找回去）
        if (searchable && focusedIndex() <= 0) {
          searchRef.current?.focus();
          break;
        }
        moveActive(focusedIndex() - 1);
        break;
      case "Home":
        event.preventDefault();
        moveActive(0);
        break;
      case "End":
        event.preventDefault();
        moveActive(visibleOptions.length - 1);
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
        <div className="character-select-menu" onKeyDown={handleMenuKeyDown}>
          {/* 检索框放在 listbox 外面：listbox 里只该有 option */}
          {searchable && (
            <div className="character-select-search">
              <input
                ref={searchRef}
                type="text"
                className="character-select-search-input"
                value={search}
                placeholder={searchPlaceholder ?? "搜索名称 / 阵营 / 标签…"}
                // 名字与触发器不同（"说话人" / "说话人检索"），测试与非视觉工具都点得准
                aria-label={ariaLabel ? `${ariaLabel}检索` : "检索"}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
          )}
          <div
            className="character-select-list"
            role="listbox"
            // 名字刻意与触发器不同：两个元素都叫"说话人"时，`getByLabelText("说话人")` 会撞车
            aria-label={ariaLabel ? `${ariaLabel}选项列表` : undefined}
          >
            {visibleOptions.map(({ option, matchedKeywords }, index) => (
              <React.Fragment key={option.value || "__empty__"}>
                {option.dividerBefore && index > 0 && (
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
                  <span className="character-select-option-text">
                    <span className="character-select-option-name">
                      {option.label}
                    </span>
                    {/* 靠阵营 / 标签命中的才需要解释：名字里看不到输入内容 */}
                    {matchedKeywords.length > 0 && (
                      <span className="character-select-option-match">
                        {matchedKeywords.join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              </React.Fragment>
            ))}
            {visibleOptions.length === 0 && (
              <div className="character-select-empty">
                {options.length === 0 ? "暂无角色" : "没有匹配的选项"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterSelect;
