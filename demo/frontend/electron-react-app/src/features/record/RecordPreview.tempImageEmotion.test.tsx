/**
 * 「临时素材」的情绪动画（序列帧）在 DOM 场景层里的**接线**验证。
 *
 * <p>几何公式本身由 `previewLayout.test.ts` 钉住，后端像素由
 * `TempImageEmotionAnimRenderingTest` 钉住；这里补最后一环：
 * `RecordPreview.emotionItemOf` 拿到的必须是**临时素材自己的世界矩形**
 * （而不是立绘的矩形、也不是整张画布的矩形），并且按「头部正方形」定位：
 * 边长 = 图片显示宽度 / 3、水平居中、上边缘贴合图片上边缘。
 *
 * <p>场景层用百分比定位，所以断言的是"相对画面的百分比"，与舞台像素无关。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import RecordPreview from "./RecordPreview";
import ApiService from "@services/ApiService";

// 几何计算要原图尺寸，jsdom 里拿不到（图片不会真的解码）。统一给 400×600。
jest.mock("./preview/useImageSizes", () => ({
  useImageSizes: (urls: string[]) => ({
    sizes: Object.fromEntries(
      urls.filter(Boolean).map((url) => [url, { width: 400, height: 600 }]),
    ),
    pending: 0,
  }),
}));

// jsdom 没有布局：容器量到的是 0×0，舞台与 DOM 场景层都不会挂载。
jest.mock("./preview/useElementSize", () => ({
  useElementSize: () => ({
    ref: { current: null },
    size: { width: 640, height: 360 },
  }),
}));

/** 让 ▶ 播放真的能播：临时素材自己挂一个"弹跳·循环"移动动画 */
const BOUNCE = {
  version: 1,
  timebase: { unit: "frame", fps: 30 },
  clips: [
    {
      id: "clip-bounce",
      kind: "preset",
      preset: "bounce",
      durationFrames: 60,
      loop: "loop",
      params: { amplitude: 24, periodFrames: 18 },
    },
  ],
};

/** 一帧的序列帧动画（循环播放，保证播放中任意帧都画着它） */
const emotionAnim = {
  version: 1,
  clipId: "flow_test",
  name: "花开",
  canvasWidth: 200,
  canvasHeight: 200,
  frameHolds: [1],
  loop: "loop",
  iterations: null,
  startFrame: 0,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  fadeInFrames: 0,
  fadeOutFrames: 0,
  opacity: 1,
  posterFrame: 0,
};

const makeRecord = (tempOverrides: Record<string, unknown> = {}): any => ({
  uuid: "r-temp-emotion",
  durationFrames: 30,
  dialogue: { text: "台词", speakerName: "旁白" },
  bg: [],
  chars: [],
  tempImages: [
    {
      uuid: "temp-1",
      imagePath: "./projects/temp/images/t.png",
      posX: 100,
      posY: 200,
      scale: 1,
      dim: false,
      anim: BOUNCE,
      emotionAnim,
      ...tempOverrides,
    },
  ],
  effects: [],
  audioCommands: [],
});

const renderPreview = (record: any) =>
  render(
    <RecordPreview
      selectedRecord={record}
      videoWidth={640}
      videoHeight={360}
      plot
      records={[record]}
      selectedRecordIndex={0}
      setSelectedRecordIndex={() => undefined}
    />,
  );

/** 场景层里所有 <img>，按 DOM 顺序（= 绘制顺序） */
const sceneImages = (): HTMLImageElement[] =>
  Array.from(document.querySelectorAll<HTMLImageElement>("img.preview-scene-item"));

/** 情绪动画的那张帧图（后端地址里带 animation-clips） */
const emotionImage = (): HTMLImageElement => {
  const found = sceneImages().filter((node) =>
    (node.getAttribute("src") ?? "").includes("/assets/animation-clips/"),
  );
  expect(found).toHaveLength(1);
  return found[0];
};

/** 百分比样式的数值（"18.3333%" → 18.3333） */
const pct = (value: string): number => parseFloat(value);

beforeEach(() => {
  jest.spyOn(ApiService, "getRecordPreview").mockResolvedValue("blob:preview");
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL =
    jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("临时素材的情绪动画 → DOM 场景层", () => {
  test("素材中心落在「头部正方形」中心（边长 = 图片宽 / 3、水平居中、顶部贴合）", () => {
    renderPreview(makeRecord());
    fireEvent.click(screen.getByRole("button", { name: /播放/ }));

    const emotion = emotionImage();

    // 手算（场景画布 1920×1080 → 输出 640×360，×1/3）：
    // 临时素材 = (100,200) 400×600 → 头部正方形：边长 400/3、中心 (300, 200+400/6)
    // 素材 200×200、偏移 0 → 左上角 (300−100, 266.67−100) = (200, 166.67)
    // 过 0.8 场景缩放 + (192,108) 偏移后 = (117.33, 80.44)，尺寸 53.33×53.33
    expect(pct(emotion.style.left)).toBeCloseTo((117.33333333333333 / 640) * 100, 2);
    expect(pct(emotion.style.top)).toBeCloseTo((80.44444444444444 / 360) * 100, 2);
    expect(pct(emotion.style.width)).toBeCloseTo((53.333333333333336 / 640) * 100, 2);
    expect(pct(emotion.style.height)).toBeCloseTo((53.333333333333336 / 360) * 100, 2);
  });

  test("画在临时素材之后（同一循环内，后画 = 盖在图片上）", () => {
    renderPreview(makeRecord());
    fireEvent.click(screen.getByRole("button", { name: /播放/ }));

    const images = sceneImages();
    const tempIndex = images.findIndex(
      (node) => (node.getAttribute("src") ?? "").includes("/projects/temp/images/"),
    );
    const emotionIndex = images.indexOf(emotionImage());

    expect(tempIndex).toBeGreaterThanOrEqual(0);
    expect(emotionIndex).toBeGreaterThan(tempIndex);
  });

  test("图片 scale 放大 2 倍：头部正方形与素材一起放大（相对位置不变）", () => {
    renderPreview(makeRecord({ scale: 2 }));
    fireEvent.click(screen.getByRole("button", { name: /播放/ }));

    const emotion = emotionImage();

    // 图片 800×1200 → 头部边长 800/3、中心 (500, 200+800/6)
    // 素材 200×200 × 用户缩放 2 = 400×400 → 左上角 (300, 133.33)
    // 过 0.8 + (192,108) = (144, 71.56)，尺寸 106.67×106.67
    expect(pct(emotion.style.left)).toBeCloseTo((144 / 640) * 100, 2);
    expect(pct(emotion.style.top)).toBeCloseTo((71.55555555555556 / 360) * 100, 2);
    expect(pct(emotion.style.width)).toBeCloseTo((106.66666666666667 / 640) * 100, 2);
    expect(pct(emotion.style.height)).toBeCloseTo((106.66666666666667 / 360) * 100, 2);
  });
});
