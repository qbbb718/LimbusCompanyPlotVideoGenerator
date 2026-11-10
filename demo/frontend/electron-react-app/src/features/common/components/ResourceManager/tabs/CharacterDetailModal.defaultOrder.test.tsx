/**
 * 资源管理 → 角色 → 立绘：**默认立绘永远排在列表第一张**（回归测试）。
 *
 * <p>后端返回的立绘本来就是"默认立绘在前、其余按名称"，但本地动过之后数组顺序会漂：
 * 用户点「设为默认」，旧实现只改 defaultPortrait 标记、卡片原地不动，
 * 界面上就出现"默认立绘排在中间"；保存后重新打开也是同样的顺序。
 *
 * <p>这里钉死两件事：
 * <ol>
 *   <li>数据进来时默认立绘不在首位（老库 / 本地改动过的顺序），列表渲染时也要把它排到第一张；</li>
 *   <li>点某张立绘的「设为默认」，它当场变成第一张并带上「默认立绘」角标。</li>
 * </ol>
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MyCharacter, Portrait } from "@types";
import ApiService from "@services/ApiService";
import CharacterDetailModal from "./CharacterDetailModal";

const makePortrait = (id: string, isDefault: boolean): Portrait => ({
  portraitID: id,
  characterID: "char_order_test",
  imagePath: `char_order_test/${id}.png`,
  portName: `立绘-${id}`,
  emotion: "normal" as any,
  faceX: 0,
  faceY: 0,
  length: 100,
  adjX: 0,
  adjY: 0,
  thumbnailPath: `/assets/characters/char_order_test/thumbnails/thumbnail_${id}.png`,
  defaultPortrait: isDefault,
});

/**
 * 刻意的"脏"顺序：默认立绘在中间，前面还有一张 A。
 * 等价于用户之前点过「设为默认」又没有重新拉列表的本地状态。
 */
const makeCharacter = (): MyCharacter => ({
  characterID: "char_order_test",
  characterName: "罗佳",
  height: 168,
  faction: "边狱公司",
  colorBg: "#4C361F",
  colorText: "#FBDBB3",
  tags: [],
  portraits: [
    makePortrait("portrait_a", false),
    makePortrait("portrait_default", true),
    makePortrait("portrait_c", false),
  ],
});

const renderModal = (character: MyCharacter = makeCharacter()) =>
  render(
    <CharacterDetailModal
      character={character}
      portraits={character.portraits || []}
      isNewCharacter={false}
      onClose={jest.fn()}
      onSave={jest.fn()}
    />,
  );

/** 立绘列表里每张卡片的标题（顺序 = 立绘顺序） */
const cardTitles = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll(".portrait-card h4")).map(
    (node) => node.textContent || "",
  );

const cards = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(".portrait-card"));

describe("角色详情-立绘列表顺序", () => {
  let setDefaultPortrait: jest.SpyInstance;

  beforeEach(() => {
    // CRA 的 jest 配置开了 resetMocks：实现要在每个用例前重新填
    setDefaultPortrait = jest
      .spyOn(ApiService, "setDefaultPortrait")
      .mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("数据里默认立绘不在首位时，渲染出来仍然排在第一张", () => {
    const { container } = renderModal();

    expect(cardTitles(container)).toEqual([
      "立绘-portrait_default",
      "立绘-portrait_a",
      "立绘-portrait_c",
    ]);
    // 角标也挂在第一张上
    expect(
      within(cards(container)[0]).getByText("默认立绘"),
    ).toBeInTheDocument();
  });

  it("点「设为默认」后那张立绘当场变成第一张，旧默认立绘退回普通卡片", async () => {
    const { container } = renderModal();

    const cardC = cards(container)[2];
    expect(within(cardC).getByText("立绘-portrait_c")).toBeInTheDocument();

    fireEvent.click(within(cardC).getByText("设为默认"));

    await waitFor(() =>
      expect(cardTitles(container)[0]).toBe("立绘-portrait_c"),
    );
    expect(setDefaultPortrait).toHaveBeenCalledWith(
      "char_order_test",
      "portrait_c",
      expect.objectContaining({ portraitID: "portrait_c" }),
    );

    const first = cards(container)[0];
    expect(within(first).getByText("默认立绘")).toBeInTheDocument();
    // 新的默认立绘不再显示「设为默认」，旧的默认立绘则重新出现这个按钮
    expect(within(first).queryByText("设为默认")).not.toBeInTheDocument();
    expect(
      within(cards(container)[1]).getByText("设为默认"),
    ).toBeInTheDocument();
    // 其余立绘保持原来的相对顺序
    expect(cardTitles(container)).toEqual([
      "立绘-portrait_c",
      "立绘-portrait_default",
      "立绘-portrait_a",
    ]);
  });

  it("删掉默认立绘后，剩下的第一张自动成为默认立绘（仍然排在第一张）", async () => {
    jest
      .spyOn(ApiService, "deletePortrait")
      .mockResolvedValue(undefined as any);

    const { container } = renderModal();

    // 第一张就是默认立绘
    expect(cardTitles(container)[0]).toBe("立绘-portrait_default");
    fireEvent.click(within(cards(container)[0]).getByText("删除"));

    await waitFor(() => expect(cards(container)).toHaveLength(2));
    const first = cards(container)[0];
    expect(within(first).getByText("立绘-portrait_a")).toBeInTheDocument();
    expect(within(first).getByText("默认立绘")).toBeInTheDocument();
  });
});
