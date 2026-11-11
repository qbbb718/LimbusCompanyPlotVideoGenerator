/**
 * 序列帧动画预览：「角色」下拉框带缩略图。
 *
 * <h3>为什么要单独测这一层</h3>
 * 原生 `<select>` 的 `<option>` 放不了图片，所以「角色」从原生的 select 换成了自定义下拉
 * （`CharacterSelect`，与剧情编辑里「说话人 / 立绘」同一个组件）。换组件最容易出的问题
 * 都不是"崩"，而是**看起来有下拉、图其实不对**：
 * <ul>
 *   <li>缩略图取错立绘（取了第一个而不是"默认立绘"）；</li>
 *   <li>没有缩略图的角色留一个浏览器裂图标；</li>
 *   <li>可选的角色和"能当预览对象"的角色不一致（没立绘的角色混进来，选了舞台空着）；</li>
 *   <li>触发器上的头像不跟着换角色走。</li>
 * </ul>
 * 这里直接查 DOM 里的 `<img src>` 与占位文字，把这几条钉住。
 * 键盘 / 点外部 / Tab 收起这类交互由 `CharacterSelect.test.tsx` 覆盖，本文件只管接线。
 *
 * <p>预览的几何（缩略图落在哪）由 `SpriteAnimationPreview.crossCharacter.test.tsx` 与
 * `stageFit.test.ts` 负责，这里**故意不给背景**——不请求合成底板，测试里也就不会有
 * "请求回来后 setState 落在 act 之外"的噪音。
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";

import type { MyCharacter } from "@types";
import type {
  AnimationClipDto,
  AnimationClipPoster,
} from "@features/record/animation/animationClipAsset";
import ApiService from "@services/ApiService";
import SpriteAnimationPreview from "./SpriteAnimationPreview";
import type { PreviewPlayback } from "./SpriteAnimationPreview";

/* ==================== 素材 / 播放参数 ==================== */

const CLIP: AnimationClipDto = {
  id: "flow_thumb01",
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
  frameBaseUrl: "/assets/animation-clips/flow_thumb01/frames/",
  coverUrl: "/assets/animation-clips/flow_thumb01/frames/0001.png",
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

const POSTER: AnimationClipPoster = { frame: 0, offsetX: 0, offsetY: 0, scale: 1 };

/* ==================== 角色 ==================== */

/**
 * 造一个角色。
 *
 * @param thumbnailPath 默认立绘的缩略图路径；传空串模拟"还没生成缩略图"的老数据
 * @param portraitCount 立绘数量；0 = 没立绘（不能当预览对象）
 */
const characterOf = (
  id: string,
  name: string,
  thumbnailPath: string,
  portraitCount = 1,
): MyCharacter =>
  ({
    characterID: id,
    characterName: name,
    height: 171,
    faction: "",
    colorBg: "",
    colorText: "",
    portraits: Array.from({ length: portraitCount }, (_, index) => ({
      portraitID: `p-${id}-${index}`,
      characterID: id,
      imagePath: `char_${id}/${index + 1}.png`,
      portName: `${name}-${index + 1}`,
      emotion: "NORMAL",
      faceX: 0,
      faceY: 0,
      length: 183,
      adjX: 0,
      adjY: 0,
      thumbnailPath: index === 0 ? thumbnailPath : "",
      // 默认立绘 = 后端 defaultPortrait 标记（取缩略图看的是它，不是数组第一项的位置约定）
      defaultPortrait: index === 0,
    })),
  }) as unknown as MyCharacter;

const CHARACTERS: MyCharacter[] = [
  characterOf("c-rot", "罗佳", "/assets/characters/c-rot/thumbnails/t-rot.png"),
  characterOf("c-sin", "辛克莱", "/assets/characters/c-sin/thumbnails/t-sin.png"),
  characterOf("c-nothumb", "无缩略图角色", ""),
  characterOf("c-noportrait", "没立绘的角色", "", 0),
];

/* ==================== 环境桩 ==================== */

/**
 * 只替换网络：本用例不给背景，所以底板渲染接口不会被调用，
 * 但缩略图的帧地址照旧走 `getAnimationClipFrameUrl`。
 *
 * <p>CRA 的 jest 配置开了 `resetMocks: true`：`jest.mock` 工厂里**不要**写实现，
 * 每个用例前在 `beforeEach` 里重新装。
 */
jest.mock("@services/ApiService", () => ({
  __esModule: true,
  default: {
    getRecordPreview: jest.fn(),
    getAnimationClipFrameUrl: jest.fn(),
    getBackgroundUrl: jest.fn(),
  },
}));

beforeEach(() => {
  (ApiService.getAnimationClipFrameUrl as jest.Mock).mockReturnValue("/frames/0001.png");
});

afterEach(() => {
  jest.restoreAllMocks();
});

/* ==================== 渲染与读数 ==================== */

const renderPreview = (characters: MyCharacter[]) =>
  render(
    <SpriteAnimationPreview
      clip={CLIP}
      poster={POSTER}
      playback={PLAYBACK}
      onPosterChange={jest.fn()}
      characters={characters}
      backgrounds={[]}
    />,
  );

/** 「角色」下拉的触发器（带当前角色的头像） */
const trigger = () => screen.getByLabelText("预览角色") as HTMLButtonElement;

/** 某个元素里的缩略图地址（没有图时返回 null） */
const thumbSrcOf = (element: HTMLElement): string | null =>
  element.querySelector<HTMLImageElement>(".character-select-avatar img")?.getAttribute("src") ??
  null;

/** 展开下拉 */
const openMenu = () => fireEvent.click(trigger());

/** 触发器上的头像（= 当前预览角色） */
const triggerThumb = () => trigger().querySelector<HTMLImageElement>(".character-select-avatar img");

/** 等"自动落到第一个带立绘的角色"这一步生效 */
const waitForSelection = async () =>
  waitFor(() => expect(triggerThumb()).not.toBeNull());

/* ==================== 用例 ==================== */

describe("序列帧动画预览：角色下拉框带缩略图", () => {
  test("触发器显示当前角色的缩略图：默认自动落到第一个带立绘的角色", async () => {
    renderPreview(CHARACTERS);
    await waitForSelection();

    expect(triggerThumb()!.getAttribute("src")).toContain("/thumbnails/t-rot.png");
    // 名字仍然是可读的（缩略图不替代文字，只帮着认人）
    expect(within(trigger()).getByText("罗佳")).toBeTruthy();
  });

  test("展开后每个可预览的角色都在列表里，各自带自己默认立绘的缩略图", async () => {
    renderPreview(CHARACTERS);
    await waitForSelection();
    openMenu();

    expect(thumbSrcOf(screen.getByRole("option", { name: "罗佳" }))).toContain(
      "/thumbnails/t-rot.png",
    );
    expect(thumbSrcOf(screen.getByRole("option", { name: "辛克莱" }))).toContain(
      "/thumbnails/t-sin.png",
    );
    // 没有立绘的角色列不出来：选了他舞台上也什么都不显示
    expect(screen.queryByRole("option", { name: "没立绘的角色" })).toBeNull();
  });

  test("换角色：触发器头像跟着换，舞台上的缩略图叠层照旧存在", async () => {
    renderPreview(CHARACTERS);
    await waitForSelection();

    openMenu();
    fireEvent.click(screen.getByRole("option", { name: "辛克莱" }));

    await waitFor(() => {
      expect(triggerThumb()!.getAttribute("src")).toContain("/thumbnails/t-sin.png");
    });
    expect(within(trigger()).getByText("辛克莱")).toBeTruthy();
    // 菜单收起了（选完不该还挂在画面上）
    expect(screen.queryByRole("listbox")).toBeNull();
    // 换角色不影响"有没有东西可画"
    expect(document.querySelector(".sprite-preview-handle")).not.toBeNull();
  });

  test("没有缩略图的角色退回名字首字占位，不出现破图标", async () => {
    renderPreview(CHARACTERS);
    await waitForSelection();
    openMenu();

    const option = screen.getByRole("option", { name: "无缩略图角色" });
    expect(option.querySelector("img")).toBeNull();
    expect(option.querySelector(".character-select-avatar-fallback")?.textContent).toBe("无");
  });

  test("一个带立绘的角色都没有时：不给空气下拉，直接说明原因", async () => {
    renderPreview([characterOf("c-noportrait", "没立绘的角色", "", 0)]);

    await waitFor(() => expect(screen.queryByLabelText("预览角色")).toBeNull());
    expect(screen.getByText("（还没有带立绘的角色）")).toBeTruthy();
    // 舞台上的占位提示仍旧是原来那句（两处提示分工不同，不要合并）
    expect(screen.getByText("需要一个带立绘的角色和一张背景")).toBeTruthy();
  });
});
