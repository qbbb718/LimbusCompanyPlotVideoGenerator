/**
 * 「同一份代表帧配置能适配不同角色」的**跨角色一致性**测试。
 *
 * 这是本次重构最核心的一条不变量：
 * 代表帧的位置存的是**相对头部区域**的偏移（单位 = 头宽）与缩放倍率，
 * 所以换一个身高、裁剪框、站位的角色，它仍然落在"同一个相对位置"。
 *
 * 之所以能成立：立绘裁剪框 `(faceX, faceY, length)` 会被归一化到恒定的
 * `DEFAULT_CHARACTER_HEAD_LENGTH = 183`，于是**头部方框在任何角色身上都是 183 场景像素**
 * （乘用户缩放）。测试直接把这句话钉死，免得日后有人"顺手"改成按图片尺寸归一化。
 */
import type { CharacterVisual } from "@types";
import {
  characterFaceCenter,
  characterHeadSize,
  characterWorldRect,
} from "./previewLayout";
import { spriteRect } from "../animation/sequenceTiming";
import type { AnimationClipPoster } from "../animation/animationClipAsset";

/** 三个代表不同"身形"的立绘（裁剪框边长、身高、脸框位置都不同） */
const characters = [
  { name: "高个子/大裁剪框", height: 195, length: 300, faceX: 20, faceY: 10, image: { width: 800, height: 1200 } },
  { name: "矮个子/小裁剪框", height: 140, length: 120, faceX: 5, faceY: 5, image: { width: 300, height: 500 } },
  { name: "标准", height: 171, length: 183, faceX: 0, faceY: 0, image: { width: 400, height: 800 } },
];

const visualOf = (item: (typeof characters)[number]): CharacterVisual =>
  ({
    chara: {
      characterID: `c-${item.name}`,
      characterName: item.name,
      height: item.height,
      faction: "",
    },
    portrait: {
      portraitID: `p-${item.name}`,
      characterID: `c-${item.name}`,
      imagePath: "",
      portName: item.name,
      faceX: item.faceX,
      faceY: item.faceY,
      length: item.length,
      adjX: 0,
      adjY: 0,
    },
    posX: 0,
    posY: 0,
    adjX: 0,
    adjY: 0,
    scale: 1,
    dim: false,
  }) as unknown as CharacterVisual;

/** 一份"摆到头顶偏左"的代表帧配置 */
const poster: AnimationClipPoster = { frame: 0, offsetX: 0.2, offsetY: -0.3, scale: 0.5 };

describe("代表帧的跨角色一致性", () => {
  test("头部方框在任何角色身上都是 183 场景像素（这是相对变换能复用的根基）", () => {
    for (const item of characters) {
      const visual = visualOf(item);
      expect(characterHeadSize(visual)).toBeCloseTo(183, 6);
    }
  });

  test("同一份配置：代表帧中心相对脸框中心的位移，总是 offset × 183", () => {
    for (const item of characters) {
      const visual = visualOf(item);
      const rect = characterWorldRect(visual, item.image);
      const face = characterFaceCenter(visual, rect);
      const head = characterHeadSize(visual);
      const sprite = spriteRect(
        face.x,
        face.y,
        head,
        600,
        400,
        poster.scale,
        1,
        poster.offsetX,
        poster.offsetY,
      );

      expect(sprite.x + sprite.w / 2 - face.x).toBeCloseTo(poster.offsetX * 183, 6);
      expect(sprite.y + sprite.h / 2 - face.y).toBeCloseTo(poster.offsetY * 183, 6);
      // 尺寸也恒定（素材画布 × 缩放；预览里立绘没有用户缩放）
      expect(sprite.w).toBeCloseTo(600 * poster.scale, 6);
      expect(sprite.h).toBeCloseTo(400 * poster.scale, 6);
    }
  });

  test("不同角色的**脸框中心**本来就在不同位置，但相对关系一致（防止测试本身变空转）", () => {
    const centers = characters.map((item) => {
      const visual = visualOf(item);
      const rect = characterWorldRect(visual, item.image);
      return characterFaceCenter(visual, rect);
    });
    // 高个子与矮个子的脸框中心纵向位置必然不同，否则下面那条"相对一致"就没意义了
    expect(centers[0].y).not.toBeCloseTo(centers[1].y, 1);
    // 但横向都以画面中心为基准
    for (const center of centers) {
      expect(center.x).toBeGreaterThan(0);
    }
  });

  test("拖动立绘（adjX/adjY）时代表帧等量跟随，相对头部的偏移不变", () => {
    const item = characters[2];
    const spriteOf = (adjX: number, adjY: number) => {
      const visual = { ...visualOf(item), adjX, adjY } as CharacterVisual;
      const rect = characterWorldRect(visual, item.image);
      const face = characterFaceCenter(visual, rect);
      const sprite = spriteRect(
        face.x,
        face.y,
        characterHeadSize(visual),
        600,
        400,
        poster.scale,
        1,
        poster.offsetX,
        poster.offsetY,
      );
      return { centerX: sprite.x + sprite.w / 2, centerY: sprite.y + sprite.h / 2, face };
    };

    const base = spriteOf(0, 0);
    const moved = spriteOf(120, -60);
    // 立绘往右下挪多少，代表帧就往右下挪多少（刚性跟随，不缩放）
    expect(moved.centerX - base.centerX).toBeCloseTo(120, 6);
    expect(moved.centerY - base.centerY).toBeCloseTo(-60, 6);
    // 相对脸框中心的关系完全不变
    expect(moved.centerX - moved.face.x).toBeCloseTo(base.centerX - base.face.x, 6);
    expect(moved.centerY - moved.face.y).toBeCloseTo(base.centerY - base.face.y, 6);
  });

  test("立绘用户缩放：脸框中心不动，代表帧按头宽等比放大（跟着立绘一起变大）", () => {
    const item = characters[2];
    const spriteOf = (scale: number) => {
      const visual = { ...visualOf(item), scale } as CharacterVisual;
      const rect = characterWorldRect(visual, item.image);
      const face = characterFaceCenter(visual, rect);
      const head = characterHeadSize(visual);
      const sprite = spriteRect(
        face.x,
        face.y,
        head,
        600,
        400,
        poster.scale,
        scale, // 用户缩放同时作用在素材尺寸上
        poster.offsetX,
        poster.offsetY,
      );
      return { face, head, sprite };
    };

    const normal = spriteOf(1);
    const doubled = spriteOf(2);
    // 缩放以裁剪框中心为基准，所以脸框中心位置不变（CharacterVisual.updatePos 的设计）。
    // 容差 1px：rect.x 是 Math.round 过的，缩放松动后取整残差会差半个像素，不是设计漂移。
    expect(Math.abs(doubled.face.x - normal.face.x)).toBeLessThanOrEqual(1);
    expect(doubled.head).toBeCloseTo(normal.head * 2, 6);
    // 偏移与尺寸都按头宽等比放大 → 观感是"跟着立绘一起变大"
    expect(doubled.sprite.w).toBeCloseTo(normal.sprite.w * 2, 6);
    const offsetNormal = normal.sprite.x + normal.sprite.w / 2 - normal.face.x;
    const offsetDoubled = doubled.sprite.x + doubled.sprite.w / 2 - doubled.face.x;
    expect(Math.abs(offsetDoubled - offsetNormal * 2)).toBeLessThanOrEqual(1);
  });
});
