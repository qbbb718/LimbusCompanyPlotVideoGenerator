/**
 * 带缩略图的角色下拉（`CharacterSelect`）的交互测试。
 *
 * <p>原生 `<select>` 的 `<option>` 放不了图片，所以"要按脸挑角色"的三处
 * （剧情编辑的「说话人」「立绘」、资源管理 → 序列帧动画预览的「角色」）共用这个
 * 自己实现的 listbox。这里锁住五件事：
 * <ol>
 *   <li>选项里是**角色默认立绘的缩略图**；没有缩略图时退回名字首字，不留破图标；</li>
 *   <li>点选项 = 选中并收起，焦点回到触发器（不然焦点会掉到 body 上，键盘用户就丢了位置）；</li>
 *   <li>键盘全程可用：`↓`/`↑` 展开并落在当前项、`↑↓`/`Home`/`End` 移动、`Esc` 收起还焦点；</li>
 *   <li>`Tab` 离开与点外部同样收起（菜单不能粘在屏幕上）；</li>
 *   <li>开了 `searchable`（说话人下拉）时，菜单顶部的检索框按**名字 / 阵营 / 标签**过滤，
 *       命中的关键词会解释在名字下面，键盘与选定行为不受影响；不开的下拉没有检索框。</li>
 * </ol>
 *
 * <p>（`Enter` 选定不用测：选项本身就是 `<button>`，那是浏览器的原生行为，
 * jsdom 不会替我们模拟 click，测了也只是在测 jsdom。）
 */
import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";

import type { MyCharacter } from "@types";
import CharacterSelect from "./CharacterSelect";
import type { CharacterSelectOption } from "./CharacterSelect";

/* ==================== 素材 ==================== */

/**
 * 造一个角色。
 *
 * @param thumbnailPath 默认立绘的缩略图路径；空串 = 还没生成缩略图
 * @param firstPortraitIsDefault 默认立绘标记放在第几张（用来验"取的是默认立绘，不是数组第一项"）
 */
const characterOf = (
  id: string,
  name: string,
  thumbnailPath: string,
  firstPortraitIsDefault = true,
): MyCharacter =>
  ({
    characterID: id,
    characterName: name,
    height: 171,
    faction: "",
    colorBg: "",
    colorText: "",
    portraits: [
      {
        portraitID: `p-${id}-front`,
        characterID: id,
        imagePath: `char_${id}/front.png`,
        portName: `${name}-正面`,
        emotion: "NORMAL",
        faceX: 0,
        faceY: 0,
        length: 183,
        adjX: 0,
        adjY: 0,
        thumbnailPath: firstPortraitIsDefault ? thumbnailPath : "",
        defaultPortrait: firstPortraitIsDefault,
      },
      {
        portraitID: `p-${id}-side`,
        characterID: id,
        imagePath: `char_${id}/side.png`,
        portName: `${name}-侧面`,
        emotion: "SMILE",
        faceX: 10,
        faceY: 10,
        length: 160,
        adjX: 0,
        adjY: 0,
        thumbnailPath: firstPortraitIsDefault ? "" : thumbnailPath,
        defaultPortrait: !firstPortraitIsDefault,
      },
    ],
  }) as unknown as MyCharacter;

const ROT = characterOf("c-rot", "罗佳", "/assets/characters/c-rot/thumbnails/t-rot.png");
const SIN = characterOf("c-sin", "辛克莱", "/assets/characters/c-sin/thumbnails/t-sin.png");
const NO_THUMB = characterOf("c-nothumb", "无缩略图角色", "");

const OPTIONS: CharacterSelectOption[] = [ROT, SIN, NO_THUMB].map((character) => ({
  value: character.characterID,
  label: character.characterName,
  avatarCharacter: character,
}));

/**
 * 开了检索的选项表（与「说话人」下拉同一种形状：名字 + 阵营 / 标签关键词）。
 * 关键词刻意一个中文、一个英文，好验证大小写不敏感与"多个词都要命中"。
 */
const SEARCH_OPTIONS: CharacterSelectOption[] = [
  { value: "", label: "旁白", badge: "旁" },
  { value: "free", label: "自由文本", badge: "文" },
  {
    value: ROT.characterID,
    label: ROT.characterName,
    avatarCharacter: ROT,
    dividerBefore: true,
    searchKeywords: ["LCCB", "Rodion", "主角"],
  },
  {
    value: SIN.characterID,
    label: SIN.characterName,
    avatarCharacter: SIN,
    searchKeywords: ["N公司", "Sinclair", "反派"],
  },
  {
    value: NO_THUMB.characterID,
    label: NO_THUMB.characterName,
    avatarCharacter: NO_THUMB,
    searchKeywords: ["中立"],
  },
];

/* ==================== 渲染与读数 ==================== */

/** 带本地状态的下拉：选完回写，才看得出"触发器换了没有" */
const renderSelect = (initial = "") => {
  const onChange = jest.fn();
  const Harness: React.FC = () => {
    const [value, setValue] = useState(initial);
    return (
      <CharacterSelect
        value={value}
        options={OPTIONS}
        ariaLabel="角色"
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  };
  render(<Harness />);
  return { onChange };
};

const trigger = () => screen.getByLabelText("角色") as HTMLButtonElement;
const menu = () => screen.queryByRole("listbox", { name: "角色选项列表" });
const option = (name: string) => screen.getByRole("option", { name });
/** 触发器上的头像地址（没有图时返回 null） */
const triggerThumbSrc = () =>
  trigger().querySelector<HTMLImageElement>(".character-select-avatar img")?.getAttribute("src") ??
  null;

/* ==================== 检索 ==================== */

/** 开了检索的下拉：本地状态回写，才看得出"选完触发器换了没有" */
const renderSearchSelect = (initial = "") => {
  const onChange = jest.fn();
  const Harness: React.FC = () => {
    const [value, setValue] = useState(initial);
    return (
      <CharacterSelect
        value={value}
        options={SEARCH_OPTIONS}
        ariaLabel="角色"
        searchable
        searchPlaceholder="搜索角色名 / 阵营 / 标签…"
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    );
  };
  render(<Harness />);
  return { onChange };
};

/** 检索框（名字与触发器刻意不同，见 CharacterSelect 的 aria-label） */
const searchBox = () => screen.getByLabelText("角色检索") as HTMLInputElement;
/** 在检索框里打字（受控输入，必须走 change） */
const typeSearch = (text: string) =>
  fireEvent.change(searchBox(), { target: { value: text } });
/** 当前列表里显示的**名字**（按顺序）；不含头像首字与命中说明 */
const visibleNames = () =>
  screen
    .queryAllByRole("option")
    .map((node) => node.querySelector(".character-select-option-name")?.textContent ?? "");
/**
 * 唯一命中的选项。
 *
 * <p>用正则是为了容错：靠阵营 / 标签命中时，选项的可访问名字会变成"名字 + 命中关键词"，
 * 精确匹配那一长串只会让用例跟着文案一起碎。
 */
const optionMatching = (pattern: RegExp) =>
  screen.getByRole("option", { name: pattern });

/* ==================== 用例 ==================== */

describe("带缩略图的角色下拉", () => {
  test("触发器显示当前角色：缩略图 + 名字（没有选中项时退回占位文字）", () => {
    renderSelect("c-rot");
    expect(triggerThumbSrc()).toContain("/thumbnails/t-rot.png");
    expect(within(trigger()).getByText("罗佳")).toBeTruthy();
    // 悬浮看全名（名字长了触发器会省略号）
    expect(trigger().getAttribute("title")).toBe("罗佳");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  test("展开：每个选项都是「缩略图 + 名字」，取的是默认立绘的缩略图", () => {
    renderSelect("c-rot");
    fireEvent.click(trigger());

    expect(menu()).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(menu()!.querySelectorAll("[role=option]").length).toBe(OPTIONS.length);

    expect(
      screen.getByRole("option", { name: "罗佳" }).querySelector("img")?.getAttribute("src"),
    ).toContain("/thumbnails/t-rot.png");
    expect(
      screen.getByRole("option", { name: "辛克莱" }).querySelector("img")?.getAttribute("src"),
    ).toContain("/thumbnails/t-sin.png");
  });

  test("缩略图取「默认立绘」那张，不是数组第一项", () => {
    // 默认标记落在第二张：头像必须跟着标记走（第一张没有缩略图）
    const flipped = characterOf(
      "c-flip",
      "反序角色",
      "/assets/characters/c-flip/thumbnails/t-flip.png",
      false,
    );
    render(
      <CharacterSelect
        value="c-flip"
        options={[{ value: "c-flip", label: "反序角色", avatarCharacter: flipped }]}
        ariaLabel="角色"
        onChange={jest.fn()}
      />,
    );

    expect(triggerThumbSrc()).toContain("/thumbnails/t-flip.png");
  });

  test("没有缩略图的角色退回名字首字占位，不留破图标", () => {
    renderSelect();
    fireEvent.click(trigger());

    const fallback = screen.getByRole("option", { name: "无缩略图角色" });
    expect(fallback.querySelector("img")).toBeNull();
    expect(fallback.querySelector(".character-select-avatar-fallback")?.textContent).toBe("无");
  });

  test("点选项 = 选中并收起，焦点回到触发器", () => {
    const { onChange } = renderSelect("c-rot");
    fireEvent.click(trigger());
    fireEvent.click(option("辛克莱"));

    expect(onChange).toHaveBeenCalledWith("c-sin");
    expect(menu()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(within(trigger()).getByText("辛克莱")).toBeTruthy();
    expect(triggerThumbSrc()).toContain("/thumbnails/t-sin.png");
    // 焦点不能掉到 body 上
    expect(document.activeElement).toBe(trigger());
  });

  test("键盘：↓ 展开并落在当前项，↑↓/Home/End 移动，Esc 收起并交回焦点", () => {
    renderSelect("c-sin");

    // ↓ 直接展开（原生 select 的肌肉记忆），焦点落在**当前选中项**
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(option("辛克莱"));

    // ↓ 下移、↑ 上移；到头夹住不越界
    fireEvent.keyDown(option("辛克莱"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(option("无缩略图角色"));
    fireEvent.keyDown(option("无缩略图角色"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(option("无缩略图角色"));
    fireEvent.keyDown(option("无缩略图角色"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(option("辛克莱"));

    // Home / End 跳到两端
    fireEvent.keyDown(option("辛克莱"), { key: "Home" });
    expect(document.activeElement).toBe(option("罗佳"));
    fireEvent.keyDown(option("罗佳"), { key: "End" });
    expect(document.activeElement).toBe(option("无缩略图角色"));

    // Esc 收起，焦点交回触发器
    fireEvent.keyDown(option("无缩略图角色"), { key: "Escape" });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  test("Tab 离开菜单就收起（焦点照常走，不拦默认行为）", () => {
    renderSelect("c-rot");
    fireEvent.click(trigger());
    expect(menu()).not.toBeNull();

    const tabResult = fireEvent.keyDown(option("罗佳"), { key: "Tab" });
    expect(tabResult).toBe(true); // 没有被 preventDefault
    expect(menu()).toBeNull();
  });

  test("点下拉框外面收起；点菜单内部不收起", () => {
    renderSelect("c-rot");
    fireEvent.click(trigger());

    fireEvent.mouseDown(menu()!);
    expect(menu()).not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(menu()).toBeNull();
  });

  test("空列表：菜单给出「暂无角色」，触发器显示调用方给的占位文字", () => {
    render(
      <CharacterSelect
        value=""
        options={[]}
        ariaLabel="角色"
        fallbackLabel="（还没有角色）"
        onChange={jest.fn()}
      />,
    );

    expect(within(trigger()).getByText("（还没有角色）")).toBeTruthy();
    fireEvent.click(trigger());
    expect(screen.getByText("暂无角色")).toBeTruthy();
  });

  test("没开 searchable：菜单里没有检索框（立绘 / 序列帧维持原样）", () => {
    renderSelect("c-rot");
    fireEvent.click(trigger());

    expect(screen.queryByLabelText("角色检索")).toBeNull();
    expect(menu()!.querySelector("input")).toBeNull();
    // 焦点照旧落在当前选中项
    expect(document.activeElement).toBe(option("罗佳"));
  });
});

describe("角色下拉的检索（说话人）", () => {
  test("展开就有检索框，焦点直接落在框里（进来就能打字）", () => {
    renderSearchSelect("c-rot");
    fireEvent.click(trigger());

    expect(searchBox()).toHaveValue("");
    expect(searchBox().placeholder).toBe("搜索角色名 / 阵营 / 标签…");
    expect(document.activeElement).toBe(searchBox());
    // 还没输入 = 全部选项，顺序不变
    expect(visibleNames()).toEqual(["旁白", "自由文本", "罗佳", "辛克莱", "无缩略图角色"]);
  });

  test("按角色名过滤；一个都没命中时给出提示", () => {
    renderSearchSelect();
    fireEvent.click(trigger());

    typeSearch("罗");
    expect(visibleNames()).toEqual(["罗佳"]);

    // 旁白 / 自由文本也一起被过滤（只有名字命中才留下）
    expect(screen.queryByRole("option", { name: "旁白" })).toBeNull();

    typeSearch("查无此人");
    expect(visibleNames()).toEqual([]);
    expect(screen.getByText("没有匹配的选项")).toBeTruthy();

    // 清空检索词 = 恢复完整列表
    typeSearch("");
    expect(visibleNames()).toEqual(["旁白", "自由文本", "罗佳", "辛克莱", "无缩略图角色"]);
  });

  test("按阵营 / 标签匹配，并把命中的关键词写在名字下面（说明它为什么还在）", () => {
    renderSearchSelect();
    fireEvent.click(trigger());

    // 名字里没有"N公司"，命中的是阵营
    typeSearch("N公司");
    expect(visibleNames()).toEqual(["辛克莱"]);
    expect(within(optionMatching(/辛克莱/)).getByText("N公司")).toBeTruthy();

    // 标签同样参与匹配
    typeSearch("主角");
    expect(visibleNames()).toEqual(["罗佳"]);
    expect(within(optionMatching(/罗佳/)).getByText("主角")).toBeTruthy();
  });

  test("大小写不敏感；空格分隔的多个词要同时命中", () => {
    renderSearchSelect();
    fireEvent.click(trigger());

    typeSearch("rodion");
    expect(visibleNames()).toEqual(["罗佳"]);

    // "N公司" + "sinclair" 都落在辛克莱身上
    typeSearch("N公司 sinclair");
    expect(visibleNames()).toEqual(["辛克莱"]);

    // 两个词分别落在不同角色身上 = 没有结果
    typeSearch("N公司 主角");
    expect(visibleNames()).toEqual([]);
  });

  test("点检索结果里的选项：写回值、收起、检索词清空", () => {
    const { onChange } = renderSearchSelect();
    fireEvent.click(trigger());

    typeSearch("反派");
    fireEvent.click(optionMatching(/辛克莱/));

    expect(onChange).toHaveBeenCalledWith("c-sin");
    expect(menu()).toBeNull();
    expect(within(trigger()).getByText("辛克莱")).toBeTruthy();
    expect(document.activeElement).toBe(trigger());

    // 再展开 = 完整列表（上次的检索词不残留）
    fireEvent.click(trigger());
    expect(searchBox()).toHaveValue("");
    expect(visibleNames()).toEqual(["旁白", "自由文本", "罗佳", "辛克莱", "无缩略图角色"]);
  });

  test("键盘：↓ 进列表挑、第一项再 ↑ 回到检索框，Esc 收起还焦点", () => {
    renderSearchSelect("c-rot");
    fireEvent.click(trigger());
    typeSearch("公司");

    // ↓ 落到第一个可见项（不是"当前选中项"：列表已经变了）
    fireEvent.keyDown(searchBox(), { key: "ArrowDown" });
    expect(document.activeElement).toBe(optionMatching(/辛克莱/));

    // 第一项再 ↑ 回到输入框
    fireEvent.keyDown(optionMatching(/辛克莱/), { key: "ArrowUp" });
    expect(document.activeElement).toBe(searchBox());

    // Home / End 在检索框里是光标键：不能被列表导航抢走（焦点留在输入框、也没 preventDefault）
    expect(fireEvent.keyDown(searchBox(), { key: "Home" })).toBe(true);
    expect(document.activeElement).toBe(searchBox());
    expect(fireEvent.keyDown(searchBox(), { key: "End" })).toBe(true);
    expect(document.activeElement).toBe(searchBox());

    // Esc 收起，焦点交回触发器
    fireEvent.keyDown(searchBox(), { key: "Escape" });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  test("只剩一个结果时，回车直接选定", () => {
    const { onChange } = renderSearchSelect();
    fireEvent.click(trigger());

    typeSearch("无缩略图");
    expect(visibleNames()).toEqual(["无缩略图角色"]);
    fireEvent.keyDown(searchBox(), { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("c-nothumb");
    expect(menu()).toBeNull();
    expect(within(trigger()).getByText("无缩略图角色")).toBeTruthy();
  });

  test("结果不止一个时回车不选定（不替用户猜挑哪个）", () => {
    const { onChange } = renderSearchSelect();
    fireEvent.click(trigger());

    typeSearch("");
    expect(visibleNames().length).toBe(5);
    fireEvent.keyDown(searchBox(), { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
  });
});
