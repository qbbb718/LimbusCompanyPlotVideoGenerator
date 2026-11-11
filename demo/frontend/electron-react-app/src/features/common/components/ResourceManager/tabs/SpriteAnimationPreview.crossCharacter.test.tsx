/**
 * 「同一套动画换角色，位置仍然贴着头部」的**接线测试**（验收标准 1 / 2）。
 *
 * <p>纯函数的跨角色一致性由 `features/record/preview/emotionAnimCrossCharacter.test.ts` 钉住；
 * 这里补的是**用户实际走的那条路**：资源管理 → 序列帧动画 → 预览舞台 → 「角色」下拉框，
 * 一个个换过去，看盖在底板上的缩略图到底落在哪。
 *
 * <p>为什么值得单独测：缩略图是 DOM 叠层，位置由组件自己算百分比。纯函数对、组件把参数接错
 * （接整张立绘的矩形、接画布中心、换角色时没重算、换角色时用了旧角色的裁剪框……）时，
 * 纯函数测试全绿，画面照样歪——这正是本次需求要修的那类"不会抛异常、只会画歪"的问题。
 *
 * <h3>断言口径</h3>
 * 期望值在测试里**独立重算一遍**（照后端 `CharacterVisual.updatePos()` 的公式手写，
 * 不从 `previewLayout` 里导），这样两边同时错的概率才低：
 * <pre>
 *   posX = round(960 + len/2·baseScale − (faceX + len/2)·renderScale)
 *   脸框中心 = posX + (faceX + len/2)·renderScale
 *   输出像素 = (192 + 0.8·世界坐标) × (1280/1920)
 * </pre>
 * 于是"缩略图中心 − 脸框中心"必须恒等于 `offset × 183 × 0.8 × (1280/1920)`，
 * 与角色身高、裁剪框大小、站位**全部无关**——这就是"相对头部的位置一致"的量化形式。
 */
import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import type { MyCharacter } from "@types";
import type { AnimationClipDto, AnimationClipPoster } from "@features/record/animation/animationClipAsset";
import ApiService from "@services/ApiService";
import SpriteAnimationPreview from "./SpriteAnimationPreview";
import type { PreviewPlayback } from "./SpriteAnimationPreview";

/* ==================== 后端常量（与 ProjectConfig 一致） ==================== */

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
/** ProjectConfig.DEFAULT_CHARACTER_HEAD_LENGTH：裁剪框会被归一化到这个边长 */
const HEAD_LENGTH = 183;
/** ProjectConfig.DEFAULT_CHARACTER_HEIGHT（厘米）与 DEFAULT_CHARACTER_HEIGHT_Pixels */
const DEFAULT_CHARACTER_HEIGHT = 171;
const CHARACTER_HEIGHT_PIXELS = 221;
/** ProjectConfig.Pixels_per_centimeter = 25/3（不是历史的 12） */
const PIXELS_PER_CENTIMETER = 25 / 3;
/** 剧情模式场景变换：×0.8 再偏移 (192, 108) */
const SCENE_SCALE = 0.8;
const SCENE_OFFSET_X = DESIGN_WIDTH / 10;
const SCENE_OFFSET_Y = DESIGN_HEIGHT / 10;
/** 预览底板尺寸（组件里写死的 PREVIEW_WIDTH / PREVIEW_HEIGHT） */
const OUT_WIDTH = 1280;
const OUT_HEIGHT = 720;

/** 世界坐标 → 预览输出像素（立绘/缩略图共用同一条投影链） */
const toOutput = (world: number, offset: number, k: number): number =>
  (offset + SCENE_SCALE * world) * k;

const KX = OUT_WIDTH / DESIGN_WIDTH;
const KY = OUT_HEIGHT / DESIGN_HEIGHT;

/* ==================== 三个"身形"完全不同的角色 ==================== */

interface CharacterSpec {
  id: string;
  name: string;
  height: number;
  length: number;
  faceX: number;
  faceY: number;
}

/**
 * 三个"身形"完全不同的角色：身高、裁剪框边长、裁剪框位置都不一样。
 *
 * <p>刻意**不带立绘原图尺寸**——预览的位置只由裁剪配置 + 身高决定，
 * 立绘是 300×500 还是 800×1200 都不该影响动画落在哪（见 previewLayout 的单测）。
 */
const CHARACTERS: CharacterSpec[] = [
  { id: "c-high", name: "高个子·大裁剪框", height: 195, length: 300, faceX: 20, faceY: 10 },
  { id: "c-short", name: "矮个子·小裁剪框", height: 140, length: 120, faceX: 5, faceY: 5 },
  { id: "c-standard", name: "标准", height: 171, length: 183, faceX: 0, faceY: 0 },
];

const characterOf = (spec: CharacterSpec): MyCharacter =>
  ({
    characterID: spec.id,
    characterName: spec.name,
    height: spec.height,
    faction: "",
    colorBg: "",
    colorText: "",
    portraits: [
      {
        portraitID: `p-${spec.id}`,
        characterID: spec.id,
        imagePath: `/assets/characters/${spec.id}/1.png`,
        portName: spec.name,
        emotion: "NORMAL",
        faceX: spec.faceX,
        faceY: spec.faceY,
        length: spec.length,
        adjX: 0,
        adjY: 0,
        thumbnailPath: "",
        defaultPortrait: true,
      },
    ],
  }) as unknown as MyCharacter;

/**
 * 角色头部裁剪区域的中心在**预览输出像素**里的位置（独立重算，镜像后端 updatePos）。
 *
 * <p>注意这里一个像素都不碰立绘原图尺寸——头部方框由裁剪配置 + 身高决定。
 */
function expectedHeadCenterPx(spec: CharacterSpec): { x: number; y: number } {
  const baseScale = HEAD_LENGTH / spec.length; // portraitScale()
  const renderScale = baseScale; // 预览里用户缩放 = 1
  const halfLength = spec.length / 2;

  const anchorX = DESIGN_WIDTH / 2; // + portrait.adjX + character.adjX（都是 0）
  const anchorY =
    CHARACTER_HEIGHT_PIXELS +
    Math.trunc((DEFAULT_CHARACTER_HEIGHT - spec.height) * PIXELS_PER_CENTIMETER);

  const posX = Math.round(
    anchorX + halfLength * baseScale - (spec.faceX + halfLength) * renderScale,
  );
  const posY = Math.round(
    anchorY + halfLength * baseScale - (spec.faceY + halfLength) * renderScale,
  );
  const faceX = posX + (spec.faceX + halfLength) * renderScale;
  const faceY = posY + (spec.faceY + halfLength) * renderScale;

  return { x: toOutput(faceX, SCENE_OFFSET_X, KX), y: toOutput(faceY, SCENE_OFFSET_Y, KY) };
}

/** 头部方框在输出图上的边长（= 183 × 0.8 × 1280/1920） */
const HEAD_OUT = HEAD_LENGTH * SCENE_SCALE * KX;

/* ==================== 素材 / 播放参数 ==================== */

const CLIP: AnimationClipDto = {
  id: "flow_cross01",
  name: "花开",
  canvasWidth: 600,
  canvasHeight: 400,
  fps: 30,
  frameCount: 2,
  totalFrames: 3,
  frameHolds: [2, 1],
  loop: "once",
  iterations: null,
  startFrame: 0,
  fadeInFrames: 0,
  fadeOutFrames: 0,
  opacity: 1,
  poster: { frame: 0, offsetX: 0, offsetY: 0, scale: 1 },
  createdAt: 1,
  frameBaseUrl: "/assets/animation-clips/flow_cross01/frames/",
  coverUrl: "/assets/animation-clips/flow_cross01/frames/0001.png",
  framesOnDisk: 2,
  missingFrames: false,
};

const PLAYBACK: PreviewPlayback = {
  loop: "once",
  iterations: null,
  startFrame: 0,
  fadeInFrames: 0,
  fadeOutFrames: 0,
  opacity: 1,
};

/** 一份"摆到头顶偏左、缩小一半"的缩略图配置（偏移单位 = 头宽） */
const POSTER: AnimationClipPoster = { frame: 0, offsetX: 0.2, offsetY: -0.3, scale: 0.5 };

/* ==================== 环境桩 ==================== */

const VIEWPORT_RECT = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  width: 800,
  height: 450,
  right: 800,
  bottom: 450,
  toJSON: () => ({}),
} as DOMRect;

/**
 * 所有网络都替掉：只保留"帧图地址"这一条（叠层用的 `<img src>`），
 * 底板渲染接口不会被打到——本用例压根不给背景（见 harness 里的说明）。
 *
 * <p>注意 CRA 的 jest 配置开了 `resetMocks: true`：`jest.mock` 工厂里**不要**写实现，
 * 每次用例前在 `beforeEach` 里重新装一遍（本仓库其它用例也是这个套路）。
 */
jest.mock("@services/ApiService", () => ({
  __esModule: true,
  default: {
    getRecordPreview: jest.fn(),
    getAnimationClipFrameUrl: jest.fn(),
    getBackgroundUrl: jest.fn(),
  },
}));

beforeAll(() => {
  // jsdom 没有 Blob URL：本用例目前不发底板请求，但留着这层桩——
  // 日后给用例加上背景（真去渲染底板）也不会被缺失的 API 绊倒。
  (URL as any).createObjectURL = jest.fn(() => "blob:preview-plate");
  (URL as any).revokeObjectURL = jest.fn();
});

beforeEach(() => {
  (ApiService.getAnimationClipFrameUrl as jest.Mock).mockReturnValue("/frames/0001.png");
  jest.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(VIEWPORT_RECT);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/* ==================== 渲染与读数 ==================== */

/**
 * 带本地状态的预览：与资源管理页一样，`onPosterChange` 回写新的 poster
 * （这样"换角色不会改动摆放参数"才有意义可言）。
 */
const renderPreview = (onPosterChange = jest.fn()) => {
  const Harness: React.FC = () => {
    const [poster, setPoster] = useState<AnimationClipPoster>(POSTER);
    return (
      <SpriteAnimationPreview
        clip={CLIP}
        poster={poster}
        playback={PLAYBACK}
        onPosterChange={(next) => {
          setPoster(next);
          onPosterChange(next);
        }}
        characters={CHARACTERS.map(characterOf)}
        // 合成底板（背景 + 立绘 + UI）由后端渲，与本用例要验的东西**完全无关**：
        // 叠层的位置只由「角色头部裁剪区域 + 相对偏移」决定。不给背景就不会发预览请求，
        // 测试里也就没有"请求回来后 setState 落在 act 之外"的噪音。
        backgrounds={[]}
      />
    );
  };
  return { ...render(<Harness />), onPosterChange };
};

/**
 * 角色下拉框里选中某个角色（组件内部会自动落到第一个可用角色）。
 *
 * <p>「角色」是带缩略图的自定义下拉（原生 `<select>` 的 `<option>` 放不了图片），
 * 所以走"展开菜单 → 点选项"这条路，与用户手点完全一样。
 */
const selectCharacter = (spec: CharacterSpec) => {
  fireEvent.click(screen.getByLabelText("预览角色"));
  fireEvent.click(screen.getByRole("option", { name: spec.name }));
};

/** 缩略图在**输出像素**里的矩形（DOM 里存的是舞台百分比） */
const spriteRectInOutputPx = () => {
  const handle = document.querySelector(".sprite-preview-handle") as HTMLElement | null;
  expect(handle).not.toBeNull();
  const pct = (value: string) => parseFloat(value) || 0;
  const left = (pct(handle!.style.left) / 100) * OUT_WIDTH;
  const top = (pct(handle!.style.top) / 100) * OUT_HEIGHT;
  const width = (pct(handle!.style.width) / 100) * OUT_WIDTH;
  const height = (pct(handle!.style.height) / 100) * OUT_HEIGHT;
  return {
    x: left,
    y: top,
    w: width,
    h: height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
};

/**
 * 等首个可用角色被自动选中、缩略图叠层出现。
 *
 * <p>叠层是**同步**出来的：位置只由角色头部裁剪区域决定，不等底板、也不等立绘原图解码
 * （`useImageSizes` 在 jsdom 里根本拿不到 naturalWidth，见"不依赖立绘原图尺寸"那条用例）。
 */
const waitForSprite = async () => {
  await waitFor(() => {
    expect(document.querySelector(".sprite-preview-handle")).not.toBeNull();
  });
};

/** 挂载预览并等它稳定（角色自动落到第一个） */
const mountPreview = async (onPosterChange = jest.fn()) => {
  const view = renderPreview(onPosterChange);
  await waitForSprite();
  return { ...view, onPosterChange };
};

/** 换角色（位置是同步重算的，换完立刻读数即可） */
const switchTo = async (spec: CharacterSpec) => {
  selectCharacter(spec);
  await waitForSprite();
};

/* ==================== 用例 ==================== */

describe("序列帧动画预览：换角色后位置仍以头部裁剪区域为基准", () => {
  test("缩略图中心相对头部方框中心的位移恒为「偏移 × 头宽」，与角色无关（验收 1）", async () => {
    await mountPreview();

    const expectedDx = POSTER.offsetX * HEAD_OUT;
    const expectedDy = POSTER.offsetY * HEAD_OUT;

    for (const spec of CHARACTERS) {
      await switchTo(spec);

      const rect = spriteRectInOutputPx();
      const head = expectedHeadCenterPx(spec);

      expect(rect.centerX - head.x).toBeCloseTo(expectedDx, 6);
      expect(rect.centerY - head.y).toBeCloseTo(expectedDy, 6);
      // 尺寸只跟素材画布 × 缩放有关，不该跟着角色变
      expect(rect.w).toBeCloseTo(CLIP.canvasWidth * POSTER.scale * SCENE_SCALE * KX, 6);
      expect(rect.h).toBeCloseTo(CLIP.canvasHeight * POSTER.scale * SCENE_SCALE * KY, 6);
    }
  });

  test("A → B → C → A 来回切，相对头部的位置逐像素一致（验收 2）", async () => {
    await mountPreview();

    const measure = async (spec: CharacterSpec) => {
      await switchTo(spec);
      const rect = spriteRectInOutputPx();
      const head = expectedHeadCenterPx(spec);
      return {
        dx: rect.centerX - head.x,
        dy: rect.centerY - head.y,
        // 相对头部方框的比例位置：换角色后必须一模一样
        fractionX: (rect.centerX - head.x) / HEAD_OUT,
        fractionY: (rect.centerY - head.y) / HEAD_OUT,
      };
    };

    const first = await measure(CHARACTERS[0]);
    await measure(CHARACTERS[1]);
    await measure(CHARACTERS[2]);
    const back = await measure(CHARACTERS[0]); // 切回第一个角色

    expect(back.dx).toBeCloseTo(first.dx, 6);
    expect(back.dy).toBeCloseTo(first.dy, 6);
    expect(back.fractionX).toBeCloseTo(POSTER.offsetX, 6);
    expect(back.fractionY).toBeCloseTo(POSTER.offsetY, 6);
  });

  test("换角色不改摆放参数：offsetX/offsetY/scale 由素材带着走，一次都不回调写回", async () => {
    const { onPosterChange } = await mountPreview();

    for (const spec of CHARACTERS) {
      await switchTo(spec);
    }

    expect(onPosterChange).not.toHaveBeenCalled();
    // 读数栏里显示的仍是素材上那份配置
    expect(screen.getByText(/横向 0\.20 个头宽/)).toBeTruthy();
    expect(screen.getByText(/纵向 -0\.30 个头宽/)).toBeTruthy();
  });

  test("不依赖立绘原图尺寸：jsdom 里量不到 naturalWidth 也照样按头部定位（不会整块消失）", async () => {
    // 本测试环境没有任何图片真的解码成功（useImageSizes 拿不到尺寸）。
    // 位置由裁剪配置决定，所以缩略图必须照常出现——否则换角色的瞬间它会先"消失一下"。
    await mountPreview();
    const rect = spriteRectInOutputPx();
    const head = expectedHeadCenterPx(CHARACTERS[0]);
    expect(rect.w).toBeGreaterThan(0);
    expect(rect.centerX - head.x).toBeCloseTo(POSTER.offsetX * HEAD_OUT, 6);
  });

  test("拖动换算仍按头宽：拖 x 个客户端像素，offsetX 正好等于 x·(输出/舞台)/头宽", async () => {
    const { onPosterChange } = await mountPreview();

    // jsdom 没有 PointerEvent：补一个最小实现（clientX/clientY 要能读到）
    class PointerEventPolyfill extends MouseEvent {
      public pointerId: number;
      constructor(type: string, params: Record<string, unknown> = {}) {
        super(type, params as MouseEventInit);
        this.pointerId = Number(params.pointerId ?? 0);
      }
    }
    (window as any).PointerEvent = PointerEventPolyfill;
    Element.prototype.setPointerCapture = jest.fn();
    Element.prototype.releasePointerCapture = jest.fn();

    const handle = document.querySelector(".sprite-preview-handle") as HTMLElement;
    // 舞台显示尺寸 = fitStage(800×450, 1280×720) = 785×442（见 stageFit）
    const stage = screen.getByTestId("sprite-preview-stage");
    const stageWidth = 785;
    const stageRect = { ...VIEWPORT_RECT, width: stageWidth, height: 442 } as DOMRect;
    (stage as any).getBoundingClientRect = () => stageRect;

    const clientDx = 40; // 客户端像素
    const dragStartX = 100;
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: dragStartX, clientY: 0 });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: dragStartX + clientDx,
      clientY: 0,
    });

    expect(onPosterChange).toHaveBeenCalled();
    const next = onPosterChange.mock.calls.at(-1)![0] as AnimationClipPoster;
    // 客户端像素 → 输出像素 → 头宽（这正是"视图缩放不影响摆放参数"的同一条换算）
    const expectedDx = (clientDx * (OUT_WIDTH / stageWidth)) / HEAD_OUT;
    expect(next.offsetX).toBeCloseTo(POSTER.offsetX + expectedDx, 6);
    expect(next.offsetY).toBeCloseTo(POSTER.offsetY, 6);
  });
});
