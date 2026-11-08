/**
 * 资源管理 → 序列帧动画子页面的接线测试。
 *
 * 只验"用户操作 → 交给后端的数据 / 界面状态"，不验样式与预览渲染（预览的几何与等比适配
 * 分别由 `sequenceTiming.test.ts` / `stageFit.test.ts` 覆盖）。
 *
 * 锁六条（对应 UI 重构验收点）：
 * 1. 列表能列出素材，点选后进入可编辑状态；
 * 2. 改「每张图持续帧数」只改本地草稿，**点保存**才落库（拖动缩略图会高频变更，不能每次都发请求）；
 * 3. 保存的 payload 覆盖播放参数与缩略图摆放（相对头部区域的偏移 + 缩放）；
 * 4. 文案统一为「缩略图」——页面里不能再出现「代表帧」；
 * 5. 「选择缩略图」可进/可退（按钮或 Esc），点某帧即设为缩略图、退出待选态、预览跟着更新；
 * 6. 播放/停止是**单键双态**，状态与播放严格同步，播到末尾不循环时自动回到初始状态。
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import ApiService from "@services/ApiService";
import type { AnimationClipDto } from "@features/record/animation/animationClipAsset";
import * as libraryModule from "@features/record/animation/useAnimationClipLibrary";
import SpriteAnimationsTab from "./SpriteAnimationsTab";

const asset: AnimationClipDto = {
  id: "flow_abcd1234",
  name: "花开",
  canvasWidth: 600,
  canvasHeight: 400,
  fps: 30,
  frameCount: 2,
  totalFrames: 4,
  frameHolds: [3, 1],
  loop: "once",
  iterations: null,
  startFrame: 0,
  fadeInFrames: 0,
  fadeOutFrames: 0,
  opacity: 1,
  poster: { frame: 0, offsetX: 0, offsetY: 0, scale: 1 },
  createdAt: 1,
  frameBaseUrl: "/assets/animation-clips/flow_abcd1234/frames/",
  coverUrl: "/assets/animation-clips/flow_abcd1234/frames/0001.png",
  framesOnDisk: 2,
  missingFrames: false,
};

function mockLibrary(clips: AnimationClipDto[], loading = false) {
  const reload = jest.fn();
  jest.spyOn(libraryModule, "useAnimationClipLibrary").mockReturnValue({
    clips,
    loading,
    error: null,
    reload,
    find: (clipId?: string | null) => clips.find((clip) => clip.id === clipId),
  });
  return reload;
}

/** 拿到底层 spy，用来模拟"保存后列表刷新"的那一瞬间（clips 短暂为空） */
const librarySpy = () => libraryModule.useAnimationClipLibrary as unknown as jest.Mock;

const renderTab = () =>
  render(
    <SpriteAnimationsTab characters={[]} backgrounds={[]} searchTerm="" setSearchTerm={jest.fn()} />,
  );

/** 播放/停止是同一个按钮：按当前显示的文字取 */
const playToggle = () => screen.getByRole("button", { name: /▶ 播放|⏹ 停止/ }) as HTMLButtonElement;

/** 帧列表里被标为当前缩略图的那一格（角标 + 高亮） */
const posterTiles = () => document.querySelectorAll(".sprite-anim-hold.is-poster");

afterEach(() => {
  jest.restoreAllMocks();
});

describe("资源管理 · 序列帧动画", () => {
  test("空状态：给出创建入口，不自己发请求", () => {
    mockLibrary([]);
    const update = jest.spyOn(ApiService, "updateAnimationClip");
    renderTab();

    expect(screen.getByText(/还没有动画/)).toBeTruthy();
    expect(screen.getByText("新建（选图片）")).toBeTruthy();
    expect(screen.getByText("从文件夹")).toBeTruthy();
    expect(screen.getByText("导入 .lcaf")).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  test("列表列出已有动画，点选后进入编辑（名称与每帧时长都来自素材）", () => {
    mockLibrary([asset]);
    renderTab();

    // 默认自动选中第一条
    const name = screen.getByLabelText("动画名称") as HTMLInputElement;
    expect(name.value).toBe("花开");
    const first = screen.getByLabelText("第 1 张持续帧数") as HTMLInputElement;
    expect(first.value).toBe("3");
  });

  test("改每帧时长只改本地草稿；点保存才落库，且 payload 带播放参数与缩略图摆放", async () => {
    mockLibrary([asset]);
    const update = jest
      .spyOn(ApiService, "updateAnimationClip")
      .mockResolvedValue({} as any);
    renderTab();

    fireEvent.change(screen.getByLabelText("第 1 张持续帧数"), { target: { value: "5" } });
    // 还没点保存：不能有网络请求
    expect(update).not.toHaveBeenCalled();
    expect((screen.getByLabelText("第 1 张持续帧数") as HTMLInputElement).value).toBe("5");

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const [id, payload] = update.mock.calls[0] as [string, any];
    expect(id).toBe("flow_abcd1234");
    expect(payload.frameHolds).toEqual([5, 1]);
    expect(payload.poster).toEqual({ frame: 0, offsetX: 0, offsetY: 0, scale: 1 });
    expect(payload.loop).toBe("once");
  });

  test("手动调整缩略图偏移后保存，落库的是「相对头部」的偏移量", async () => {
    mockLibrary([asset]);
    const update = jest.spyOn(ApiService, "updateAnimationClip").mockResolvedValue({} as any);
    renderTab();

    fireEvent.change(screen.getByLabelText("缩略图水平偏移"), { target: { value: "0.35" } });
    fireEvent.change(screen.getByLabelText("缩略图垂直偏移"), { target: { value: "-0.2" } });
    fireEvent.change(screen.getByLabelText("缩略图缩放"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const payload = (update.mock.calls[update.mock.calls.length - 1] as [string, any])[1];
    expect(payload.poster.offsetX).toBeCloseTo(0.35, 6);
    expect(payload.poster.offsetY).toBeCloseTo(-0.2, 6);
    expect(payload.poster.scale).toBeCloseTo(1.5, 6);
  });

  test("淡入与淡出是**两个独立参数**：改一个不影响另一个", async () => {
    mockLibrary([asset]);
    const update = jest.spyOn(ApiService, "updateAnimationClip").mockResolvedValue({} as any);
    renderTab();

    fireEvent.change(screen.getByLabelText("淡入帧数"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("淡出帧数"), { target: { value: "5" } });
    expect((screen.getByLabelText("淡入帧数") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("淡出帧数") as HTMLInputElement).value).toBe("5");

    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const payload = (update.mock.calls[update.mock.calls.length - 1] as [string, any])[1];
    expect(payload.fadeInFrames).toBe(2);
    expect(payload.fadeOutFrames).toBe(5);
  });

  test("循环模式下淡出被禁用（否则每轮接缝一淡一显），淡入仍可调", () => {
    mockLibrary([{ ...asset, loop: "loop" as any }]);
    renderTab();

    expect((screen.getByLabelText("淡出帧数") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("淡入帧数") as HTMLInputElement).disabled).toBe(false);
  });

  test("文案统一成「缩略图」：页面里不留「代表帧」；独立的「缩略图」区块已并进「帧序列」", () => {
    mockLibrary([asset]);
    const { container } = renderTab();

    // 缩略图选择/摆放都收进了「帧序列」区块，不再有单独的「缩略图」区块
    expect(screen.queryByRole("heading", { name: "缩略图" })).toBeNull();
    expect(screen.getByRole("heading", { name: /帧序列/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "选择缩略图" })).toBeTruthy();
    // 摆放（相对头部的偏移/缩放）也还在这一块里
    expect(screen.getByLabelText("缩略图水平偏移")).toBeTruthy();
    expect(screen.getByLabelText("缩略图缩放")).toBeTruthy();

    // 逐元素查：文案（直接文本节点）/ title / aria-label / placeholder 都不能再有旧词
    const leftovers: string[] = [];
    container.querySelectorAll<HTMLElement>("*").forEach((element) => {
      ["title", "aria-label", "placeholder"].forEach((attribute) => {
        const value = element.getAttribute(attribute);
        if (value && value.includes("代表帧")) {
          leftovers.push(`${element.tagName}[${attribute}]=${value}`);
        }
      });
      if (["INPUT", "SELECT", "OPTION", "TEXTAREA"].includes(element.tagName)) return;
      element.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").includes("代表帧")) {
          leftovers.push(`${element.tagName}: ${node.textContent}`);
        }
      });
    });
    expect(leftovers).toEqual([]);
  });

  test("改每帧时长后，预览按新节奏播（不用等保存回包）", () => {
    jest.useFakeTimers();
    try {
      mockLibrary([asset]); // [3, 1] → 共 4 帧
      renderTab();
      jest.spyOn(ApiService, "getRecordPreview").mockResolvedValue("blob:mock");
      // 卸载时会把待落库的改动补存一次，这里别打到真实网络
      jest.spyOn(ApiService, "updateAnimationClip").mockResolvedValue({} as any);

      // 第 1 张改成 9 帧 → 一轮共 10 帧，此时还没点保存
      fireEvent.change(screen.getByLabelText("第 1 张持续帧数"), { target: { value: "9" } });
      fireEvent.click(playToggle());
      act(() => {
        jest.advanceTimersByTime(40);
      });

      expect(screen.getByText(/\/ 10 帧/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test("保存后列表刷新的那一瞬间，编辑区不闪回空白（刚改的参数还在）", () => {
    mockLibrary([asset]);
    // 卸载时会把待落库的改动补存一次，这里别打到真实网络
    jest.spyOn(ApiService, "updateAnimationClip").mockResolvedValue({} as any);
    const { rerender } = renderTab();
    fireEvent.change(screen.getByLabelText("淡入帧数"), { target: { value: "3" } });

    // 模拟 persist 成功后的 reload()：clips 短暂为空、loading = true
    librarySpy().mockReturnValue({
      clips: [],
      loading: true,
      error: null,
      reload: jest.fn(),
      find: () => undefined,
    });
    rerender(
      <SpriteAnimationsTab characters={[]} backgrounds={[]} searchTerm="" setSearchTerm={jest.fn()} />,
    );

    expect((screen.getByLabelText("动画名称") as HTMLInputElement).value).toBe("花开");
    expect((screen.getByLabelText("淡入帧数") as HTMLInputElement).value).toBe("3");
  });

  test("当前缩略图在帧列表里有明确标识（角标 + is-poster）", () => {
    mockLibrary([asset]);
    renderTab();

    const tiles = posterTiles();
    expect(tiles.length).toBe(1);
    expect(tiles[0].querySelector(".sprite-anim-hold-flag")?.textContent).toBe("缩略图");
    // 预览区的读数与帧列表一致
    expect(screen.getByText(/缩略图 第 1 \/ 2 张/)).toBeTruthy();
  });

  test("不同动画的参数相互独立：切过去看到的是它自己的淡入淡出/每帧时长/缩略图", async () => {
    const other: AnimationClipDto = {
      ...asset,
      id: "flow_other99",
      name: "雨滴",
      frameHolds: [1, 2],
      frameCount: 2,
      totalFrames: 3,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      poster: { frame: 1, offsetX: 0.3, offsetY: 0.2, scale: 2 },
    };
    mockLibrary([asset, other]);
    const update = jest.spyOn(ApiService, "updateAnimationClip").mockResolvedValue({} as any);
    renderTab();

    // 默认选中「花开」：改它的淡入（还没到防抖时间就切走）
    fireEvent.change(screen.getByLabelText("淡入帧数"), { target: { value: "2" } });
    expect((screen.getByLabelText("淡入帧数") as HTMLInputElement).value).toBe("2");

    // 切到「雨滴」：每一项都是它自己的值，没有继承「花开」的
    fireEvent.click(screen.getByText("雨滴"));
    expect((screen.getByLabelText("动画名称") as HTMLInputElement).value).toBe("雨滴");
    expect((screen.getByLabelText("淡入帧数") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("淡出帧数") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("第 1 张持续帧数") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("缩略图水平偏移") as HTMLInputElement).value).toBe("0.3");
    expect(screen.getByText(/当前缩略图：第 2 \/ 2 张/)).toBeTruthy();

    // 切走前那笔改动被存回「花开」自己，而不是写到「雨滴」上
    await waitFor(() => expect(update).toHaveBeenCalled());
    const calls = update.mock.calls as [string, any][];
    expect(calls.some((call) => call[0] === "flow_abcd1234")).toBe(true);
    expect(calls.some((call) => call[0] === "flow_other99")).toBe(false);
    const savedForFirst = calls.filter((call) => call[0] === "flow_abcd1234").pop()!;
    expect(savedForFirst[1].fadeInFrames).toBe(2);

    // 切回「花开」：它自己的参数还在
    fireEvent.click(screen.getByText("花开"));
    expect((screen.getByLabelText("动画名称") as HTMLInputElement).value).toBe("花开");
    expect((screen.getByLabelText("淡入帧数") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("第 1 张持续帧数") as HTMLInputElement).value).toBe("3");
  });

  test("「选择缩略图」：进待选态 → 点某帧即设为缩略图 → 退出并更新预览与落库数据", async () => {
    mockLibrary([asset]);
    const update = jest.spyOn(ApiService, "updateAnimationClip").mockResolvedValue({} as any);
    renderTab();

    // 常态：按钮叫「选择缩略图」，帧不是可点目标，也没有待选提示
    const entry = screen.getByRole("button", { name: "选择缩略图" });
    expect(entry.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText(/请点击某一帧设为缩略图/)).toBeNull();
    expect(screen.queryByRole("button", { name: "把第 2 张设为缩略图" })).toBeNull();

    fireEvent.click(entry);

    // 待选态：提示 + aria-pressed + 每帧可点 + 时长输入框暂时不能编辑
    expect(entry.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "取消选择" })).toBeTruthy();
    expect(screen.getByText(/请点击某一帧设为缩略图/)).toBeTruthy();
    expect((screen.getByLabelText("第 2 张持续帧数") as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "把第 2 张设为缩略图" }));

    // 选完自动退出待选态，按钮与区域恢复常态
    expect(screen.getByRole("button", { name: "选择缩略图" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.queryByText(/请点击某一帧设为缩略图/)).toBeNull();
    expect((screen.getByLabelText("第 2 张持续帧数") as HTMLInputElement).disabled).toBe(false);

    // 缩略图更新：帧列表角标 + 预览区读数
    const tiles = posterTiles();
    expect(tiles.length).toBe(1);
    expect(tiles[0].querySelector(".sprite-anim-hold-flag")?.textContent).toBe("缩略图");
    expect(screen.getByText(/缩略图 第 2 \/ 2 张/)).toBeTruthy();

    // 只换"哪一张"：相对头部区域的偏移与缩放原样保留
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const payload = (update.mock.calls[update.mock.calls.length - 1] as [string, any])[1];
    expect(payload.poster).toEqual({ frame: 1, offsetX: 0, offsetY: 0, scale: 1 });
  });

  test("待选态可以按 Esc / 再点按钮取消，当前缩略图不变", () => {
    mockLibrary([asset]);
    const update = jest.spyOn(ApiService, "updateAnimationClip").mockResolvedValue({} as any);
    renderTab();

    // Esc 取消
    fireEvent.click(screen.getByRole("button", { name: "选择缩略图" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText(/请点击某一帧设为缩略图/)).toBeNull();
    expect(screen.getByRole("button", { name: "选择缩略图" })).toBeTruthy();

    // 再进一次，点按钮取消
    fireEvent.click(screen.getByRole("button", { name: "选择缩略图" }));
    fireEvent.click(screen.getByRole("button", { name: "取消选择" }));
    expect(screen.queryByText(/请点击某一帧设为缩略图/)).toBeNull();

    // 缩略图仍是原来那张，且没有产生任何保存
    expect(posterTiles().length).toBe(1);
    expect(screen.getByText(/缩略图 第 1 \/ 2 张/)).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  test("进待选态会先把播放停下来（边播边选看不清）", () => {
    mockLibrary([asset]);
    renderTab();

    fireEvent.click(playToggle());
    expect(playToggle().textContent).toContain("⏹ 停止");
    expect((screen.getByLabelText("缩略图水平偏移") as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "选择缩略图" }));
    expect(playToggle().textContent).toContain("▶ 播放");
    expect((screen.getByLabelText("缩略图水平偏移") as HTMLInputElement).disabled).toBe(false);
  });

  test("播放/停止是单键双态：状态与播放严格同步，播放中锁定缩略图变换", () => {
    jest.useFakeTimers();
    try {
      mockLibrary([asset]);
      renderTab();
      jest.spyOn(ApiService, "getRecordPreview").mockResolvedValue("blob:mock");

      expect(playToggle().getAttribute("aria-pressed")).toBe("false");
      expect(playToggle().textContent).toContain("▶ 播放");
      const pause = screen.getByRole("button", { name: /⏸ 暂停/ }) as HTMLButtonElement;
      expect(pause.disabled).toBe(true);
      expect(screen.getByLabelText("循环播放")).toBeTruthy();

      // 播放前可编辑
      expect((screen.getByLabelText("缩略图水平偏移") as HTMLInputElement).disabled).toBe(false);

      fireEvent.click(playToggle());
      expect(playToggle().getAttribute("aria-pressed")).toBe("true");
      expect(playToggle().textContent).toContain("⏹ 停止");
      expect(pause.disabled).toBe(false);
      // 播放中锁定变换
      expect((screen.getByLabelText("缩略图水平偏移") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByLabelText("缩略图缩放") as HTMLInputElement).disabled).toBe(true);

      // 再点同一个键 = 停止，回到初始状态（显示缩略图、变换可编辑）
      fireEvent.click(playToggle());
      expect(playToggle().textContent).toContain("▶ 播放");
      expect(playToggle().getAttribute("aria-pressed")).toBe("false");
      expect(pause.disabled).toBe(true);
      expect((screen.getByLabelText("缩略图水平偏移") as HTMLInputElement).disabled).toBe(false);
      expect(screen.getByText(/缩略图 第 1 \/ 2 张/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test("不勾「循环播放」时播到末尾自动停止并回到缩略图（初始状态）", () => {
    jest.useFakeTimers();
    try {
      mockLibrary([{ ...asset, frameHolds: [1, 1], totalFrames: 2 }]);
      renderTab();
      jest.spyOn(ApiService, "getRecordPreview").mockResolvedValue("blob:mock");

      const loop = screen.getByLabelText("循环播放") as HTMLInputElement;
      fireEvent.click(loop);
      expect(loop.checked).toBe(false);

      fireEvent.click(playToggle());
      expect(playToggle().textContent).toContain("⏹ 停止");

      // 2 帧 ≈ 67ms；给足余量让它跑过末尾
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(playToggle().textContent).toContain("▶ 播放");
      expect(screen.getByText(/缩略图 第 1 \/ 2 张/)).toBeTruthy();
      expect((screen.getByLabelText("缩略图水平偏移") as HTMLInputElement).disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test("素材自己循环且设了次数时：播完「总帧数 × 次数」就停，不会一直空转", () => {
    jest.useFakeTimers();
    try {
      // loop + iterations=2、共 2 帧 → 一遍播放的末尾是第 4 帧（≈134ms）
      mockLibrary([{ ...asset, loop: "loop" as any, iterations: 2, frameHolds: [1, 1], totalFrames: 2 }]);
      renderTab();
      jest.spyOn(ApiService, "getRecordPreview").mockResolvedValue("blob:mock");

      // 关掉「循环播放」：播到末尾应当停
      const loop = screen.getByLabelText("循环播放") as HTMLInputElement;
      fireEvent.click(loop);
      expect(loop.checked).toBe(false);

      fireEvent.click(playToggle());
      expect(playToggle().textContent).toContain("⏹ 停止");

      act(() => {
        jest.advanceTimersByTime(400);
      });

      expect(playToggle().textContent).toContain("▶ 播放");
      expect(screen.getByText(/缩略图 第 1 \/ 2 张/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test("「按文件名编号推算时长」开关默认开启，关掉后导入会显式传 inferHolds=false", async () => {
    mockLibrary([]);
    const importSpy = jest
      .spyOn(ApiService, "importAnimationClips")
      .mockResolvedValue({
        asset: { ...asset, id: "new_clip" },
        warnings: ["已按文件名编号推算每帧时长（最后一张无后继编号，按默认 1 帧）"],
      } as any);
    const readFile = jest.fn().mockResolvedValue(new ArrayBuffer(8));
    (window as any).electronAPI = {
      openImageFiles: jest.fn().mockResolvedValue({ canceled: false, filePaths: ["D:/a/frame_1.png"] }),
      readFile,
    };

    renderTab();
    const toggle = screen.getByLabelText("按文件名编号自动推算时长") as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    // 开着导入 → 带 inferHolds: true
    fireEvent.click(screen.getByText("新建（选图片）"));
    await waitFor(() => expect(importSpy).toHaveBeenCalledTimes(1));
    expect((importSpy.mock.calls[0] as any[])[2]).toEqual({ inferHolds: true });
    // 推算产生的提示要显示给用户
    expect(await screen.findByText(/已按文件名编号推算每帧时长/)).toBeTruthy();

    // 关掉再导入 → 带 inferHolds: false
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    fireEvent.click(screen.getByText("新建（选图片）"));
    await waitFor(() => expect(importSpy).toHaveBeenCalledTimes(2));
    expect((importSpy.mock.calls[1] as any[])[2]).toEqual({ inferHolds: false });

    delete (window as any).electronAPI;
  });

  test("导入后每张图的持续帧数可见、可直接手改（自动值可被覆盖）", async () => {
    mockLibrary([{ ...asset, frameHolds: [1, 4], totalFrames: 6, frameCount: 2 }]);
    const update = jest.spyOn(ApiService, "updateAnimationClip").mockResolvedValue({} as any);
    renderTab();

    // 推算出来的值直接显示在时长输入框里
    expect((screen.getByLabelText("第 1 张持续帧数") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("第 2 张持续帧数") as HTMLInputElement).value).toBe("4");

    // 手动改第 1 张 → 覆盖自动推算值并落库
    fireEvent.change(screen.getByLabelText("第 1 张持续帧数"), { target: { value: "7" } });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const payload = (update.mock.calls[update.mock.calls.length - 1] as [string, any])[1];
    expect(payload.frameHolds).toEqual([7, 4]);
  });

  test("删除要二次确认；取消时什么都不做", async () => {
    mockLibrary([asset]);
    const remove = jest.spyOn(ApiService, "deleteAnimationClip").mockResolvedValue({ success: true } as any);
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
    renderTab();

    fireEvent.click(screen.getByText("删除"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByText("删除"));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("flow_abcd1234"));
  });

  test("搜不到时列表提示「没有匹配」，但当前选中的动画仍留在编辑器里", () => {
    mockLibrary([asset]);
    render(
      <SpriteAnimationsTab
        characters={[]}
        backgrounds={[]}
        searchTerm="不存在的名字"
        setSearchTerm={jest.fn()}
      />,
    );
    expect(screen.getByText(/没有匹配/)).toBeTruthy();
    // 过滤只是收窄列表，不该把正在编辑的那条踢掉（否则用户一搜索就丢上下文）
    expect(screen.getByLabelText("动画名称")).toBeTruthy();
  });
});
