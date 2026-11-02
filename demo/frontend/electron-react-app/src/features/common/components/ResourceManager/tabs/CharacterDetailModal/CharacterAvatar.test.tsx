import React from "react";
import { render } from "@testing-library/react";
import { MyCharacter } from "@types";
import CharacterAvatar from "./CharacterAvatar";

/**
 * 角色卡片头像的回归测试。
 *
 * <p>背景（用户反馈"创建完角色后输入框变成无法输入的状态"）：头像的 URL 以前是
 * `?t=${Date.now()}` 直接写在渲染里的，于是每次重渲染都会生成新地址，整个角色列表的
 * 缩略图被反复重新下载。资源管理页面里"在搜索框打字""保存角色""批量导入进度刷新"
 * 都会触发重渲染 —— 主线程忙着解码几十张图，输入框就表现为丢焦点 / 打不了字。
 *
 * <p>这里锁死两条：
 * <ol>
 *   <li>同样的输入重渲染时，<img src> 必须保持不变（不再因为 Date.now() 变来变去）</li>
 *   <li>缩略图是懒加载的（几十个角色不会同时解码）</li>
 * </ol>
 */
const makeCharacter = (overrides: Partial<MyCharacter> = {}): MyCharacter => ({
  characterID: "char_avatar_test",
  characterName: "测试角色",
  height: 170,
  faction: "边狱公司",
  colorBg: "#4C361F",
  colorText: "#FBDBB3",
  tags: [],
  portraits: [
    {
      portraitID: "portrait_1",
      characterID: "char_avatar_test",
      imagePath: "char_avatar_test/portrait_1.png",
      portName: "默认",
      emotion: "normal" as any,
      faceX: 0,
      faceY: 0,
      length: 100,
      adjX: 0,
      adjY: 0,
      thumbnailPath:
        "/assets/characters/char_avatar_test/thumbnails/portrait_1.png",
      defaultPortrait: true,
    },
  ],
  ...overrides,
});

const getImg = (container: HTMLElement) =>
  container.querySelector("img") as HTMLImageElement | null;

describe("角色卡片头像", () => {
  it("重渲染时缩略图地址保持不变（不再每次渲染都换地址重新下载）", () => {
    const character = makeCharacter();
    const { container, rerender } = render(
      <CharacterAvatar character={character} />,
    );

    const firstSrc = getImg(container)?.src;
    expect(firstSrc).toBeTruthy();
    expect(firstSrc).toContain("portrait_1.png");

    // 模拟父组件因为别的原因重渲染（搜索输入、批量导入进度……）
    rerender(<CharacterAvatar character={{ ...character }} />);
    rerender(<CharacterAvatar character={{ ...character }} />);

    expect(getImg(container)?.src).toBe(firstSrc);
  });

  it("缩略图走懒加载，避免一次解码几十张图", () => {
    const { container } = render(
      <CharacterAvatar character={makeCharacter()} />,
    );

    const img = getImg(container);
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("decoding")).toBe("async");
  });

  it("没有立绘时显示占位符，不会渲染空的 img", () => {
    const { container, getByText } = render(
      <CharacterAvatar character={makeCharacter({ portraits: [] })} />,
    );

    expect(getImg(container)).toBeNull();
    expect(getByText("头像")).toBeTruthy();
  });
});
