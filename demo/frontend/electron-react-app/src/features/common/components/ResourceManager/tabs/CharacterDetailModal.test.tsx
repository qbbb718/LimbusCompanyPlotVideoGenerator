/**
 * 「与默认立绘裁剪一致」的确认流程回归测试。
 *
 * <p>用户反馈：在角色详情页点完这个按钮之后，回剧情编辑页「对话内容」点不进、打不了字，
 * 只能重启软件。原因是这个按钮走的是**原生 `window.confirm`**：Electron 里它是主进程
 * 弹出的 Win32 MessageBox（`#32770`），关掉之后窗口拿不回键盘焦点
 * （`document.hasFocus()` 一直是 false），于是所有输入框都没有光标、敲字没反应。
 *
 * <p>所以这里锁死：按钮点下去**不允许**再调 `window.confirm`，
 * 必须走应用内的确认框（`askConfirm` → 页面里的 `[role=dialog]`）。
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MyCharacter, Portrait } from "@types";
import CharacterDetailModal from "./CharacterDetailModal";
import { ConfirmDialogHost } from "@features/common/components/ConfirmDialog";

// 算"按比例"要先读默认立绘的原图尺寸（走 <img> 加载，jsdom 里不会触发）：
// 这里直接返回 null，让流程走"按像素照搬"分支，不依赖网络与图片解码。
jest.mock("@features/common/utils/portraitUtils", () => {
  const actual = jest.requireActual("@features/common/utils/portraitUtils");
  return {
    ...actual,
    loadPortraitImageSize: jest.fn(() => Promise.resolve(null)),
  };
});

const makePortrait = (
  id: string,
  isDefault: boolean,
  crop = { faceX: 10, faceY: 20, length: 100 },
): Portrait => ({
  portraitID: id,
  characterID: "char_confirm_test",
  imagePath: `char_confirm_test/${id}.png`,
  portName: `立绘-${id}`,
  emotion: "normal" as any,
  faceX: crop.faceX,
  faceY: crop.faceY,
  length: crop.length,
  adjX: 0,
  adjY: 0,
  thumbnailPath: `/assets/characters/char_confirm_test/thumbnails/${id}.png`,
  defaultPortrait: isDefault,
});

const makeCharacter = (): MyCharacter => ({
  characterID: "char_confirm_test",
  characterName: "格里高尔",
  height: 168,
  faction: "边狱公司",
  colorBg: "#4C361F",
  colorText: "#FBDBB3",
  tags: [],
  portraits: [
    makePortrait("portrait_default", true),
    makePortrait("portrait_other_1", false, { faceX: 0, faceY: 0, length: 40 }),
    makePortrait("portrait_other_2", false, { faceX: 1, faceY: 2, length: 50 }),
  ],
});

const renderModal = () => {
  const character = makeCharacter();
  return render(
    <>
      <CharacterDetailModal
        character={character}
        portraits={character.portraits || []}
        isNewCharacter={false}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />
      <ConfirmDialogHost />
    </>,
  );
};

describe("角色详情-与默认立绘裁剪一致", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    // 一旦有谁退回原生 confirm，这条 spy 就会响
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    jest.clearAllMocks();
  });

  it("点按钮弹的是应用内确认框，不是原生 window.confirm", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "与默认立绘裁剪一致" }));

    const dialog = await screen.findByRole("dialog", { name: "与默认立绘裁剪一致" });
    expect(dialog).toBeInTheDocument();
    // 文案里带上要改几张立绘
    expect(
      screen.getByText(/将把 2 张立绘的裁剪/),
    ).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("取消后什么都不改（不会去重生成缩略图）", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "与默认立绘裁剪一致" }));
    const dialog = await screen.findByRole("dialog", { name: "与默认立绘裁剪一致" });

    // 角色详情自己的标题栏也有「取消」：只在确认框里点
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "与默认立绘裁剪一致" }),
      ).not.toBeInTheDocument(),
    );
    // 取消后列表里仍是原来的裁剪值
    expect(screen.getByText("立绘-portrait_other_1")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
