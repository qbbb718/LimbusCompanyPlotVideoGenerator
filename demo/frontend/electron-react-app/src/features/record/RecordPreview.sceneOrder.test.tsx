/**
 * DOM 场景层的立绘叠放顺序。
 *
 * <p>回归的 bug：**预览图里在前的立绘，播放时跑到了别的立绘后面**。
 *
 * <p>播放 / 拖拽 / 「◧ 场景」对位自检时，栅格预览图被隐藏，画面由 `PreviewSceneLayer`
 * 用 DOM 重绘；它**直接按 `geometry.layers` 的数组顺序叠**（后面的盖前面的）。
 * 而后端栅格图（`RenderOfImage.renderCharacters`）是从 `chars` 末尾往前画，
 * 也就是 `chars[0]` 最后画 = 画面最前。几何模块曾经对背景倒序 push、
 * 对立绘/临时图片正序 push，两边的叠放层次正好整段相反。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import RecordPreview from "./RecordPreview";
import ApiService from "@services/ApiService";
import { buildPortraitImageUrl } from "@features/common/utils/portraitUtils";

// 几何计算要原图尺寸，jsdom 里拿不到（图片不会真的解码）。这里给每张图一个固定尺寸，
// 立绘才有可能被算成矩形、进到场景层的绘制列表里。
jest.mock("./preview/useImageSizes", () => ({
  useImageSizes: (urls: string[]) => ({
    sizes: Object.fromEntries(
      urls.filter(Boolean).map((url) => [url, { width: 400, height: 600 }]),
    ),
    pending: 0,
  }),
}));

// jsdom 没有布局：容器量到的是 0×0，舞台与 DOM 场景层都不会挂载。
// 这里给一个固定的 640×360 舞台（= 本用例的 videoWidth / videoHeight）。
jest.mock("./preview/useElementSize", () => ({
  useElementSize: () => ({
    ref: { current: null },
    size: { width: 640, height: 360 },
  }),
}));

/** 一条"弹跳·循环"动画：让 ▶ 播放真的能播（没有动画时点播放只会弹一段文字说明） */
const BOUNCE = {
  version: 1,
  timebase: { unit: "frame", fps: 30 },
  clips: [
    {
      id: "clip-1",
      kind: "preset",
      preset: "bounce",
      durationFrames: 60,
      loop: "loop",
      params: { amplitude: 24, periodFrames: 18 },
    },
  ],
};

const makeCharacter = (id: string, name: string, anim?: unknown) => ({
  chara: { characterID: id, characterName: name, height: 171 },
  portrait: {
    portraitID: `portrait-${id}`,
    characterID: id,
    imagePath: `${id}/portrait.png`,
    length: 183,
    faceX: 0,
    faceY: 0,
    adjX: 0,
    adjY: 0,
    thumbnailPath: "",
  },
  posX: 960,
  posY: 0,
  adjX: 0,
  adjY: 0,
  scale: 1,
  dim: false,
  ...(anim ? { anim } : {}),
});

/**
 * 两个立绘：首项带动画（负责让播放可用），两张在画面里完全重叠
 * —— "谁盖住谁"只由渲染顺序决定，正是 bug 里那种"前面的立绘被后面的盖住"。
 */
const makeRecord = (tempImages: unknown[] = []): any => ({
  uuid: "r1",
  durationFrames: 30,
  dialogue: { text: "台词", speakerName: "旁白" },
  bg: [],
  chars: [
    makeCharacter("c1", "罗佳", BOUNCE),
    makeCharacter("c2", "希斯克利夫"),
  ],
  tempImages,
  effects: [],
  audioCommands: [],
});

const RECORD = makeRecord();
/** 列表首项 = 后端最后画的那张（预览图里在最前） */
const FRONT = buildPortraitImageUrl(RECORD.chars[0].portrait.imagePath);
/** 列表末项 = 后端先画的那张（预览图里在最后） */
const BACK = buildPortraitImageUrl(RECORD.chars[1].portrait.imagePath);

const renderPreview = (record: any = RECORD) =>
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

/** 场景层里所有 `<img>` 的地址，按 DOM 顺序（= 绘制顺序，后面的盖前面的） */
const sceneSources = (): string[] =>
  Array.from(
    document.querySelectorAll<HTMLImageElement>("img.preview-scene-item"),
  ).map((node) => node.getAttribute("src") ?? "");

beforeEach(() => {
  jest.spyOn(ApiService, "getRecordPreview").mockResolvedValue("blob:preview");
  // jsdom 没有实现 object URL：组件卸载时会 release 预览图
  (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL =
    jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("播放时 DOM 场景层的立绘顺序", () => {
  test("列表首项（预览图里最前）最后画，不会落到别的立绘后面", () => {
    renderPreview();
    fireEvent.click(screen.getByRole("button", { name: /播放/ }));
    // 进入播放态：栅格图隐藏，画面完全由场景层呈现
    expect(screen.getByRole("button", { name: /停止/ })).toBeTruthy();

    const order = sceneSources().filter((src) => src === FRONT || src === BACK);
    // 后端 chars[1] 先画（底层）→ chars[0] 最后画（最上层），DOM 顺序必须与之一致
    expect(order).toEqual([BACK, FRONT]);
  });

  test("临时图片画在立绘之上（后端顺序：立绘 → 临时图片）", () => {
    const tempImage = {
      uuid: "temp-1",
      imagePath: "./projects/temp/images/t.png",
      posX: 100,
      posY: 200,
      scale: 1,
      dim: false,
    };
    const record = makeRecord([tempImage]);
    renderPreview(record);
    fireEvent.click(screen.getByRole("button", { name: /播放/ }));

    const tempUrl = ApiService.getTempImageUrl(tempImage.imagePath);
    const picked = sceneSources().filter((src) =>
      [FRONT, BACK, tempUrl].includes(src),
    );
    expect(picked).toEqual([BACK, FRONT, tempUrl]);
  });
});
