/**
 * 带缩略图的角色下拉（`CharacterSelect`）的交互测试。
 *
 * <p>原生 `<select>` 的 `<option>` 放不了图片，所以"要按脸挑角色"的三处
 * （剧情编辑的「说话人」「立绘」、资源管理 → 序列帧动画预览的「角色」）共用这个
 * 自己实现的 listbox。这里锁住四件事：
 * <ol>
 *   <li>选项里是**角色默认立绘的缩略图**；没有缩略图时退回名字首字，不留破图标；</li>
 *   <li>点选项 = 选中并收起，焦点回到触发器（不然焦点会掉到 body 上，键盘用户就丢了位置）；</li>
 *   <li>键盘全程可用：`↓`/`↑` 展开并落在当前项、`↑↓`/`Home`/`End` 移动、`Esc` 收起还焦点；</li>
 *   <li>`Tab` 离开与点外部同样收起（菜单不能粘在屏幕上）。</li>
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
});
