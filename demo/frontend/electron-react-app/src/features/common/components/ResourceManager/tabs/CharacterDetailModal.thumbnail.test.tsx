/**
 * 立绘裁剪后**立刻**更新立绘列表里的缩略图（回归测试）。
 *
 * <p>用户反馈：资源管理 → 角色 → 立绘，点「编辑」把一张立绘的裁剪改好、保存，
 * 回到列表看到的还是旧头部的缩略图，要关掉角色弹窗重新打开才变。
 *
 * <p>原因：缩略图文件名固定（`thumbnail_{portraitId}.png`），后端重新生成时**覆盖**同名文件，
 * `thumbnailPath` 一个字都不变，`PortraitThumbnail` 只在路径变化时才重新拼地址，
 * 于是一直用浏览器缓存里那张旧图。
 *
 * <p>这里用假的立绘编辑器（模拟"裁剪值变了、缩略图路径没变"）钉死两件事：
 * <ol>
 *   <li>保存后，**这张**立绘的缩略图地址必须换新的（重新取图）</li>
 *   <li>其它立绘的缩略图地址必须原样不动（不能一张图改裁剪，整个列表重新下载）</li>
 * </ol>
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MyCharacter, Portrait } from "@types";
import CharacterDetailModal from "./CharacterDetailModal";

// 真的立绘编辑器要挂裁剪器、上传接口，这里只保留"保存"这一个动作
jest.mock("./PortraitModal", () => {
  const React = require("react");
  const FakePortraitEditor = ({ portrait, onSave, onClose }: any) =>
    React.createElement(
      "div",
      { "data-testid": "portrait-editor" },
      React.createElement(
        "span",
        null,
        `正在编辑：${portrait?.portraitID}`,
      ),
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": "portrait-editor-save",
          onClick: () =>
            onSave({
              ...portrait,
              // 裁剪框变了；缩略图路径不变（后端覆盖同名文件）
              faceX: (portrait?.faceX ?? 0) + 100,
            }),
        },
        "立绘编辑器-保存",
      ),
      React.createElement(
        "button",
        { type: "button", "data-testid": "portrait-editor-cancel", onClick: onClose },
        "立绘编辑器-取消",
      ),
    );

  return { __esModule: true, default: FakePortraitEditor };
});

const makePortrait = (
  id: string,
  isDefault: boolean,
  crop = { faceX: 10, faceY: 20, length: 100 },
): Portrait => ({
  portraitID: id,
  characterID: "char_thumbnail_test",
  imagePath: `char_thumbnail_test/${id}.png`,
  portName: `立绘-${id}`,
  emotion: "normal" as any,
  faceX: crop.faceX,
  faceY: crop.faceY,
  length: crop.length,
  adjX: 0,
  adjY: 0,
  thumbnailPath: `/assets/characters/char_thumbnail_test/thumbnails/thumbnail_${id}.png`,
  defaultPortrait: isDefault,
});

const makeCharacter = (): MyCharacter => ({
  characterID: "char_thumbnail_test",
  characterName: "格里高尔",
  height: 168,
  faction: "边狱公司",
  colorBg: "#4C361F",
  colorText: "#FBDBB3",
  tags: [],
  portraits: [
    makePortrait("portrait_default", true),
    makePortrait("portrait_happy", false, { faceX: 0, faceY: 0, length: 40 }),
  ],
});

const renderModal = () => {
  const character = makeCharacter();
  return render(
    <CharacterDetailModal
      character={character}
      portraits={character.portraits || []}
      isNewCharacter={false}
      onClose={jest.fn()}
      onSave={jest.fn()}
    />,
  );
};

/** 立绘列表里每张卡片的缩略图地址（顺序 = 立绘顺序） */
const thumbnailSrcs = (container: HTMLElement): (string | null)[] =>
  Array.from(container.querySelectorAll(".portrait-card img")).map((img) =>
    img.getAttribute("src"),
  );

const openEditor = (container: HTMLElement, cardIndex: number) => {
  const card = container.querySelectorAll(".portrait-card")[cardIndex];
  expect(card).toBeTruthy();
  fireEvent.click(within(card as HTMLElement).getByText("编辑"));
};

describe("角色详情-立绘缩略图", () => {
  it("裁剪保存后立刻换成新的缩略图地址，其它立绘的缩略图不动", () => {
    const { container } = renderModal();

    const before = thumbnailSrcs(container);
    expect(before).toHaveLength(2);
    expect(before[1]).toContain("thumbnail_portrait_happy.png");

    openEditor(container, 1);
    fireEvent.click(screen.getByTestId("portrait-editor-save"));

    // 编辑器关掉了，列表现场重新取图
    expect(screen.queryByTestId("portrait-editor")).not.toBeInTheDocument();

    const after = thumbnailSrcs(container);
    expect(after).toHaveLength(2);
    // 改过裁剪的那张：路径不变、地址必须换（时间戳变了）
    expect(after[1]?.split("?")[0]).toBe(before[1]?.split("?")[0]);
    expect(after[1]).not.toBe(before[1]);
    // 没动过的那张：地址原样保留，不重新下载
    expect(after[0]).toBe(before[0]);
  });

  it("打开编辑器后取消，缩略图保持原样", () => {
    const { container } = renderModal();

    const before = thumbnailSrcs(container);
    openEditor(container, 0);
    expect(screen.getByTestId("portrait-editor")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("portrait-editor-cancel"));

    expect(screen.queryByTestId("portrait-editor")).not.toBeInTheDocument();
    expect(thumbnailSrcs(container)).toEqual(before);
  });
});
