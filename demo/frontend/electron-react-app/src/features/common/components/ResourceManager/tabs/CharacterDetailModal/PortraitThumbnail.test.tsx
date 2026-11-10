/**
 * 立绘缩略图的缓存 —— 用户反馈：资源管理 → 角色 → 立绘，把一张立绘裁剪好、
 * 在「编辑立绘」里点保存，列表里的缩略图还是旧头部的图，要关掉角色弹窗重新打开才变。
 *
 * <p>原因：缩略图文件名是固定的 `thumbnail_{portraitId}.png`，后端重新生成时是
 * **覆盖同名文件**，`thumbnailPath` 一个字都没变。以前只有路径变了才重新拼地址，
 * 于是浏览器一直拿缓存里那张旧图。
 *
 * <p>现在父组件在立绘保存后给这张立绘的「代次」+1，这里据此换一个 `?t=` 时间戳。
 * 这里锁死两条：
 * <ol>
 *   <li>代次变了、路径没变 → 地址必须变（否则看到的就是旧图）</li>
 *   <li>代次没变 → 地址必须不变（否则每次重渲染都要重新下载一遍缩略图）</li>
 * </ol>
 */
import React from "react";
import { render } from "@testing-library/react";
import { Portrait } from "@types";
import PortraitThumbnail from "./PortraitThumbnail";

const makePortrait = (overrides: Partial<Portrait> = {}): Portrait => ({
  portraitID: "portrait_p1",
  characterID: "char_thumb_test",
  imagePath: "char_thumb_test/portrait_p1.png",
  portName: "立绘-开心",
  emotion: "happy" as any,
  faceX: 120,
  faceY: 240,
  length: 480,
  adjX: 0,
  adjY: 0,
  thumbnailPath: "/assets/characters/char_thumb_test/thumbnails/thumbnail_portrait_p1.png",
  ...overrides,
});

const srcOf = (container: HTMLElement): string | null =>
  container.querySelector("img")?.getAttribute("src") ?? null;

/** 取出地址里的时间戳参数（拼不上就是 null） */
const bustOf = (src: string | null): string | null => {
  if (!src) return null;
  return new URL(src, "http://localhost").searchParams.get("t");
};

describe("立绘缩略图", () => {
  it("裁剪后（代次 +1）即使缩略图路径没变，也会换一个新地址重新取图", () => {
    const portrait = makePortrait();
    const { container, rerender } = render(
      <PortraitThumbnail portrait={portrait} characterId="char_thumb_test" cacheBust={0} />,
    );

    const before = srcOf(container);
    expect(before).toContain("thumbnail_portrait_p1.png");

    // 后端覆盖了同名缩略图：路径一模一样，只有代次变了
    rerender(
      <PortraitThumbnail
        portrait={{ ...portrait, faceX: 240 }}
        characterId="char_thumb_test"
        cacheBust={1}
      />,
    );

    const after = srcOf(container);
    expect(after).not.toBe(before);
    // 路径部分不变，变的只是时间戳
    expect(after?.split("?")[0]).toBe(before?.split("?")[0]);
    expect(bustOf(after)).not.toBe(bustOf(before));
  });

  it("代次没变时重渲染地址保持不变（不会反复重新下载缩略图）", () => {
    const portrait = makePortrait();
    const { container, rerender } = render(
      <PortraitThumbnail portrait={portrait} characterId="char_thumb_test" />
    );

    const first = srcOf(container);
    expect(first).toBeTruthy();

    rerender(
      <PortraitThumbnail portrait={{ ...portrait }} characterId="char_thumb_test" />
    );
    rerender(
      <PortraitThumbnail
        portrait={{ ...portrait, portName: "改个名字不影响缩略图" }}
        characterId="char_thumb_test"
      />
    );

    expect(srcOf(container)).toBe(first);
    // 用的是后端静态资源地址（相对路径要补主机名，不能当成站点内路径）
    expect(first).toContain("http://localhost:8081/assets/characters/");
  });

  it("连续两次刷新不会撞成同一个时间戳", () => {
    const portrait = makePortrait();
    const { container, rerender } = render(
      <PortraitThumbnail portrait={portrait} characterId="char_thumb_test" cacheBust={0} />
    );

    const seen = new Set<string | null>([bustOf(srcOf(container))]);
    for (let version = 1; version <= 3; version++) {
      rerender(
        <PortraitThumbnail
          portrait={portrait}
          characterId="char_thumb_test"
          cacheBust={version}
        />
      );
      const bust = bustOf(srcOf(container));
      expect(bust).toBeTruthy();
      expect(seen.has(bust)).toBe(false);
      seen.add(bust);
    }
  });

  it("还没有缩略图路径时显示占位块，不渲染空 img", () => {
    const { container, getByText } = render(
      <PortraitThumbnail
        portrait={makePortrait({ thumbnailPath: "" })}
        characterId="char_thumb_test"
      />
    );

    expect(container.querySelector("img")).toBeNull();
    expect(getByText("缩略图")).toBeTruthy();
  });

  it("老数据只存了文件名时，按角色素材根目录兜底拼地址", () => {
    const { container } = render(
      <PortraitThumbnail
        portrait={makePortrait({ thumbnailPath: "thumbnail_portrait_p1.png" })}
        characterId="char_thumb_test"
      />
    );

    const src = srcOf(container);
    expect(src).toContain(
      "http://localhost:8081/assets/characters/thumbnail_portrait_p1.png",
    );
  });
});
