/**
 * 资源管理 → 角色 → 立绘列表：**顺序由用户拖拽决定，默认立绘不再强制第一**。
 *
 * <p>回归点：
 * <ol>
 *   <li>数据里默认立绘在中间时，列表保持数据顺序，不把它挪到第一张；</li>
 *   <li>默认立绘卡片带「默认」角标，拖拽 / 排序后角标跟着那张卡片走；</li>
 *   <li>拖拽排序立即更新并调用后端保存；保存失败回滚原顺序并提示；</li>
 *   <li>「设为默认」只换标记，不会把卡片挪到第一位。</li>
 * </ol>
 */
import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
 * 旧实现会把它排到第一张；新行为必须原样保留。
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

const renderModal = (
  character: MyCharacter = makeCharacter(),
  onPortraitsChange?: jest.Mock,
) =>
  render(
    <CharacterDetailModal
      character={character}
      portraits={character.portraits || []}
      isNewCharacter={false}
      onClose={jest.fn()}
      onSave={jest.fn()}
      onPortraitsChange={onPortraitsChange}
    />,
  );

/** 立绘列表里每张卡片的标题（顺序 = 立绘顺序） */
const cardTitles = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll(".portrait-card h4")).map(
    (node) => node.textContent || "",
  );

const cards = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(".portrait-card"));

/** 通过标题找到对应卡片 */
const cardOf = (container: HTMLElement, portraitId: string): HTMLElement => {
  const card = cards(container).find(
    (node) => node.getAttribute("data-portrait-id") === portraitId,
  );
  if (!card) {
    throw new Error(`找不到立绘卡片: ${portraitId}`);
  }
  return card;
};

/** 模拟一次拖拽：从 from 拖到 to 的落点并松手（jsdom 里 rect 全 0 → after） */
const dragCard = (from: HTMLElement, to: HTMLElement) => {
  fireEvent.dragStart(from);
  fireEvent.dragOver(to, { clientX: 0 });
  fireEvent.drop(to, { clientX: 0 });
  fireEvent.dragEnd(from);
};

describe("角色详情-立绘列表顺序与默认标识", () => {
  let setDefaultPortrait: jest.SpyInstance;
  let reorderPortraits: jest.SpyInstance;

  beforeEach(() => {
    // CRA 的 jest 配置开了 resetMocks：实现要在每个用例前重新填
    setDefaultPortrait = jest
      .spyOn(ApiService, "setDefaultPortrait")
      .mockResolvedValue(undefined as any);
    reorderPortraits = jest
      .spyOn(ApiService, "reorderPortraits")
      .mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("数据里默认立绘在中间时保持原顺序，不把它挪到第一张", () => {
    const { container } = renderModal();

    expect(cardTitles(container)).toEqual([
      "立绘-portrait_a",
      "立绘-portrait_default",
      "立绘-portrait_c",
    ]);
    // 角标挂在默认立绘自己的卡片上，而不是第一张
    expect(
      within(cardOf(container, "portrait_default")).getByText("默认"),
    ).toBeInTheDocument();
    expect(
      within(cardOf(container, "portrait_a")).queryByText("默认"),
    ).not.toBeInTheDocument();
  });

  it("点「设为默认」只换标记：卡片留在原位，角标跟到新卡片上", async () => {
    const { container } = renderModal();

    fireEvent.click(
      within(cardOf(container, "portrait_c")).getByText("设为默认"),
    );

    await waitFor(() =>
      expect(
        within(cardOf(container, "portrait_c")).getByText("默认"),
      ).toBeInTheDocument(),
    );
    expect(setDefaultPortrait).toHaveBeenCalledWith(
      "char_order_test",
      "portrait_c",
      expect.objectContaining({ portraitID: "portrait_c" }),
    );
    // 顺序一点没变
    expect(cardTitles(container)).toEqual([
      "立绘-portrait_a",
      "立绘-portrait_default",
      "立绘-portrait_c",
    ]);
    // 旧默认立绘的角标消失，重新出现「设为默认」按钮
    const oldDefault = cardOf(container, "portrait_default");
    expect(within(oldDefault).queryByText("默认")).not.toBeInTheDocument();
    expect(within(oldDefault).getByText("设为默认")).toBeInTheDocument();
  });

  it("拖拽后顺序立即更新，并把新顺序保存到后端", async () => {
    const { container } = renderModal();

    // 把第一张 A 拖到 C 的后面 → [B(默认), C, A]
    dragCard(
      cardOf(container, "portrait_a"),
      cardOf(container, "portrait_c"),
    );

    await waitFor(() =>
      expect(cardTitles(container)).toEqual([
        "立绘-portrait_default",
        "立绘-portrait_c",
        "立绘-portrait_a",
      ]),
    );
    expect(reorderPortraits).toHaveBeenCalledWith("char_order_test", [
      "portrait_default",
      "portrait_c",
      "portrait_a",
    ]);
    // 默认角标跟着 B 移动，仍在 B 上
    expect(
      within(cardOf(container, "portrait_default")).getByText("默认"),
    ).toBeInTheDocument();
  });

  it("默认立绘本身可以被拖走，角标跟着它到新位置", async () => {
    const { container } = renderModal();

    // 把默认立绘 B 拖到 C 的后面 → [A, C, B]
    dragCard(
      cardOf(container, "portrait_default"),
      cardOf(container, "portrait_c"),
    );

    await waitFor(() =>
      expect(cardTitles(container)).toEqual([
        "立绘-portrait_a",
        "立绘-portrait_c",
        "立绘-portrait_default",
      ]),
    );
    expect(reorderPortraits).toHaveBeenCalledWith("char_order_test", [
      "portrait_a",
      "portrait_c",
      "portrait_default",
    ]);
    // 角标仍然在 B 的卡片上（现在在最后一张），不会留在第一张
    expect(
      within(cardOf(container, "portrait_default")).getByText("默认"),
    ).toBeInTheDocument();
    expect(
      within(cardOf(container, "portrait_a")).queryByText("默认"),
    ).not.toBeInTheDocument();
  });

  it("拖拽排序成功后会同步给父组件，关掉弹窗再打开仍是新顺序", async () => {
    const onPortraitsChange = jest.fn();
    const { container } = renderModal(makeCharacter(), onPortraitsChange);

    dragCard(
      cardOf(container, "portrait_a"),
      cardOf(container, "portrait_c"),
    );

    await waitFor(() =>
      expect(onPortraitsChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ portraitID: "portrait_default" }),
          expect.objectContaining({ portraitID: "portrait_c" }),
          expect.objectContaining({ portraitID: "portrait_a" }),
        ]),
      ),
    );
    expect(
      onPortraitsChange.mock.calls[0][0].map(
        (portrait: Portrait) => portrait.portraitID,
      ),
    ).toEqual(["portrait_default", "portrait_c", "portrait_a"]);
  });

  it("拖拽排序保存失败：回滚原顺序并给出提示", async () => {
    reorderPortraits.mockRejectedValueOnce(new Error("网络断开"));
    const onPortraitsChange = jest.fn();
    const { container } = renderModal(makeCharacter(), onPortraitsChange);

    dragCard(
      cardOf(container, "portrait_a"),
      cardOf(container, "portrait_c"),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/拖拽排序未保存，已恢复原顺序/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/网络断开/)).toBeInTheDocument();
    expect(cardTitles(container)).toEqual([
      "立绘-portrait_a",
      "立绘-portrait_default",
      "立绘-portrait_c",
    ]);
    // 默认角标仍然在 B 上
    expect(
      within(cardOf(container, "portrait_default")).getByText("默认"),
    ).toBeInTheDocument();
    // 失败时不通知父组件，父组件里仍是原顺序
    expect(onPortraitsChange).not.toHaveBeenCalled();
  });

  it("只有一张立绘时拖拽没有实际效果，也不报错", async () => {
    const single = {
      ...makeCharacter(),
      portraits: [makePortrait("only", true)],
    };
    const { container } = renderModal(single);
    const onlyCard = cardOf(container, "only");

    fireEvent.dragStart(onlyCard);
    fireEvent.dragOver(onlyCard, { clientX: 0 });
    fireEvent.drop(onlyCard, { clientX: 0 });

    // 等一小段时间，确认没有发保存请求、也没有错误提示
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reorderPortraits).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(cardTitles(container)).toEqual(["立绘-only"]);
  });

  it("删掉默认立绘后，剩下的第一张成为默认且顺序不变", async () => {
    jest
      .spyOn(ApiService, "deletePortrait")
      .mockResolvedValue(undefined as any);

    const { container } = renderModal();

    fireEvent.click(
      within(cardOf(container, "portrait_default")).getByText("删除"),
    );

    await waitFor(() => expect(cards(container)).toHaveLength(2));
    // A 变成默认，但仍在第一张；C 保持在第二张
    expect(cardTitles(container)).toEqual([
      "立绘-portrait_a",
      "立绘-portrait_c",
    ]);
    expect(
      within(cardOf(container, "portrait_a")).getByText("默认"),
    ).toBeInTheDocument();
  });
});
