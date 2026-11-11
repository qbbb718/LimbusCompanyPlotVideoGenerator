/**
 * 场景层单测。
 *
 * 两条关键约束：
 * 1. 世界层要裁到"场景框"（否则镜头一摇背景会溢出到黑边上）；
 * 2. 边框暗角与 UI **不能裁**（对话框底部本来就压在下方的黑边上）。
 */
import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import PreviewSceneLayer from "./PreviewSceneLayer";
import type { SceneLayerItem } from "./PreviewSceneLayer";

const FRAME = { width: 1920, height: 1080 };
/** 设计画布中间 80%：0.8 缩放 + (192,108) 偏移 */
const SCENE_BOX = { x: 192, y: 108, w: 1536, h: 864 };

const background: SceneLayerItem = {
  key: "background:0",
  src: "/assets/backgrounds/bg.png",
  rect: { x: -100, y: 0, w: 2200, h: 1200 },
  clipWithScene: true,
};

const dialogBox: SceneLayerItem = {
  key: "dialogBox",
  src: "/assets/ui/dialogBox.png",
  rect: { x: 264, y: 826, w: 1470, h: 254 },
};

const border: SceneLayerItem = {
  key: "borderMask",
  className: "preview-scene-border",
  rect: SCENE_BOX,
};

describe("PreviewSceneLayer", () => {
  test("不传 clipRect 时不裁剪（摄像机模式要看到世界全图）", () => {
    const { container } = render(
      <PreviewSceneLayer items={[background]} frame={FRAME} />,
    );
    expect(container.querySelector(".preview-scene-clip")).toBeNull();
    expect(container.querySelector(".preview-scene-item")).toBeTruthy();
  });

  test("传 clipRect 时按 inset 裁到场景框", () => {
    const { container } = render(
      <PreviewSceneLayer items={[background]} frame={FRAME} clipRect={SCENE_BOX} />,
    );
    const clip = container.querySelector(".preview-scene-clip") as HTMLElement;
    expect(clip.style.clipPath).toBe("inset(10% 10% 10% 10%)");
  });

  test("只有世界层进裁剪容器：UI 与边框留在外面（不被黑框咬掉）", () => {
    const { container } = render(
      <PreviewSceneLayer
        items={[background, border, dialogBox]}
        frame={FRAME}
        clipRect={SCENE_BOX}
      />,
    );
    const clip = container.querySelector(".preview-scene-clip") as HTMLElement;
    // 裁剪容器里只有背景
    expect(clip.querySelectorAll(".preview-scene-item").length).toBe(1);
    expect(clip.querySelector(".preview-scene-item")).toBeTruthy();

    // 边框与对话框是裁剪容器的兄弟（同层级、在它之后绘制）
    const layer = container.querySelector(".preview-scene-layer") as HTMLElement;
    const directChildren = Array.from(layer.children);
    expect(directChildren[0].className).toContain("preview-scene-clip");
    expect(directChildren.slice(1).length).toBe(2);
    expect(container.querySelector(".preview-scene-shape.preview-scene-border")).toBeTruthy();

    const dialog = Array.from(container.querySelectorAll(".preview-scene-item")).find(
      (img) => (img as HTMLImageElement).src.includes("dialogBox"),
    ) as HTMLImageElement;
    expect(dialog).toBeTruthy();
    expect(dialog.parentElement?.className).not.toContain("preview-scene-clip");
    // 对话框底部本来就压在黑边上（1080 > 场景框底边 972）
    expect(parseFloat(dialog.style.top) + parseFloat(dialog.style.height)).toBeGreaterThan(90);
  });

  test("裁剪不影响元素自身的百分比定位", () => {
    const { container } = render(
      <PreviewSceneLayer items={[background]} frame={FRAME} clipRect={SCENE_BOX} />,
    );
    const img = container.querySelector(".preview-scene-item") as HTMLImageElement;
    expect(parseFloat(img.style.left)).toBeCloseTo(-5.2083, 3);
    expect(parseFloat(img.style.width)).toBeGreaterThan(100);
  });

  test("纯 CSS 图层的矩形按场景框换算（10% / 80%）", () => {
    const { container } = render(
      <PreviewSceneLayer items={[border]} frame={FRAME} clipRect={SCENE_BOX} />,
    );
    const shape = container.querySelector(
      ".preview-scene-shape.preview-scene-border",
    ) as HTMLElement;
    expect(shape.style.left).toBe("10%");
    expect(shape.style.width).toBe("80%");
  });

  test("帧尺寸非法时整层不渲染", () => {
    const { container } = render(
      <PreviewSceneLayer items={[background]} frame={{ width: 0, height: 0 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("压暗的图层加 .dim（背景 / 立绘 / 临时图片同一套滤镜）", () => {
    const { container } = render(
      <PreviewSceneLayer
        items={[
          { ...background, key: "background:0", dim: true },
          { ...background, key: "background:1", dim: false },
        ]}
        frame={FRAME}
      />,
    );
    const images = container.querySelectorAll(".preview-scene-item");
    expect(images[0].className).toContain("dim");
    expect(images[1].className).not.toContain("dim");
  });
});

/**
 * T 巢滤镜（画面层染色）：
 * - 只罩住世界层那一组：UI 与边框暗角不进染色组，否则对话框/名片会被一起染黄；
 * - 关的时候一个节点都不多（DOM 与没有这个功能时一致，旧测试/快照不受影响）。
 */
describe("PreviewSceneLayer T巢滤镜", () => {
  const worldTwo: SceneLayerItem[] = [
    background,
    { ...background, key: "character:0", src: "/assets/characters/c.png" },
    border,
    dialogBox,
  ];

  test("开启后：染色组里只有世界层，UI 与边框在外面", () => {
    const { container } = render(
      <PreviewSceneLayer items={worldTwo} frame={FRAME} clipRect={SCENE_BOX} tone />,
    );
    const tone = container.querySelector(".preview-scene-tone") as HTMLElement;
    expect(tone).toBeTruthy();
    expect(tone.style.filter).toBe("url(#dsh-t-corp-filter)");

    // 染色组里只有背景 + 立绘
    expect(tone.querySelectorAll(".preview-scene-item").length).toBe(2);

    // 对话框不在染色组里（否则 UI 会被染成棕色）
    const dialog = container.querySelector(
      '.preview-scene-item[src*="dialogBox"]',
    ) as HTMLImageElement;
    expect(dialog).toBeTruthy();
    expect(tone.contains(dialog)).toBe(false);

    // 边框暗角也不染色（保持纯黑）
    const borderEl = container.querySelector(
      ".preview-scene-shape.preview-scene-border",
    ) as HTMLElement;
    expect(tone.contains(borderEl)).toBe(false);
  });

  test("关闭时：不渲染染色组，DOM 与原来一致", () => {
    const { container } = render(
      <PreviewSceneLayer items={worldTwo} frame={FRAME} clipRect={SCENE_BOX} />,
    );
    expect(container.querySelector(".preview-scene-tone")).toBeNull();
    // 世界层仍然在裁剪容器里
    const clip = container.querySelector(".preview-scene-clip") as HTMLElement;
    expect(clip.querySelectorAll(".preview-scene-item").length).toBe(2);
  });

  test("摄像机模式（无 clipRect）下同样只染世界层", () => {
    const { container } = render(
      <PreviewSceneLayer items={worldTwo} frame={FRAME} tone />,
    );
    const tone = container.querySelector(".preview-scene-tone") as HTMLElement;
    expect(tone).toBeTruthy();
    expect(tone.querySelectorAll(".preview-scene-item").length).toBe(2);
    expect(container.querySelector(".preview-scene-tone .preview-scene-border")).toBeNull();

    // 绘制顺序不变：染色组在最前，边框与 UI 依次在后
    const layer = container.querySelector(".preview-scene-layer") as HTMLElement;
    const classes = Array.from(layer.children).map((el) => el.className);
    expect(classes[0]).toContain("preview-scene-tone");
    expect(classes.slice(1).length).toBe(2);
  });

  test("没有世界层时不渲染空染色组", () => {
    const { container } = render(
      <PreviewSceneLayer items={[border, dialogBox]} frame={FRAME} tone />,
    );
    expect(container.querySelector(".preview-scene-tone")).toBeNull();
    // UI 照常画出来，只是没有画面层需要染色
    expect(container.querySelectorAll(".preview-scene-item").length).toBe(1);
  });
});
