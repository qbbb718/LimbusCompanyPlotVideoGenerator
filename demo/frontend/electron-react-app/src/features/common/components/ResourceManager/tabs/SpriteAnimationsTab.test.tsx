/**
 * 资源管理 → 序列帧动画子页面的接线测试。
 *
 * 只验"用户操作 → 交给后端的数据"，不验样式与预览渲染（预览单独靠几何纯函数测试覆盖）。
 *
 * 锁四条（对应重构验收点）：
 * 1. 列表能列出素材，点选后进入可编辑状态；
 * 2. 改「每张图持续帧数」只改本地草稿，**点保存**才落库（拖动代表帧会高频变更，不能每次都发请求）；
 * 3. 保存的 payload 覆盖播放参数与代表帧摆放（相对头部区域的偏移 + 缩放）；
 * 4. 删除要二次确认，调对接口。
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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

function mockLibrary(clips: AnimationClipDto[]) {
  const reload = jest.fn();
  jest.spyOn(libraryModule, "useAnimationClipLibrary").mockReturnValue({
    clips,
    loading: false,
    error: null,
    reload,
    find: (clipId?: string | null) => clips.find((clip) => clip.id === clipId),
  });
  return reload;
}

const renderTab = () =>
  render(
    <SpriteAnimationsTab characters={[]} backgrounds={[]} searchTerm="" setSearchTerm={jest.fn()} />,
  );

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

  test("改每帧时长只改本地草稿；点保存才落库，且 payload 带播放参数与代表帧摆放", async () => {
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

  test("拖动式调整代表帧偏移后保存，落库的是「相对头部」的偏移量", async () => {
    mockLibrary([asset]);
    const update = jest.spyOn(ApiService, "updateAnimationClip").mockResolvedValue({} as any);
    renderTab();

    fireEvent.change(screen.getByLabelText("代表帧水平偏移"), { target: { value: "0.35" } });
    fireEvent.change(screen.getByLabelText("代表帧垂直偏移"), { target: { value: "-0.2" } });
    fireEvent.change(screen.getByLabelText("代表帧缩放"), { target: { value: "1.5" } });
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

  test("预览提供播放/暂停/停止与循环开关；播放中锁定代表帧变换", () => {
    jest.useFakeTimers();
    try {
      mockLibrary([asset]);
      renderTab();
      jest.spyOn(ApiService, "getRecordPreview").mockResolvedValue("blob:mock");

      const play = screen.getByRole("button", { name: /▶ 播放/ }) as HTMLButtonElement;
      const pause = screen.getByRole("button", { name: /⏸ 暂停/ }) as HTMLButtonElement;
      const stop = screen.getByRole("button", { name: /⏹ 停止/ }) as HTMLButtonElement;
      expect(play.disabled).toBe(false);
      expect(pause.disabled).toBe(true);
      expect(stop.disabled).toBe(true);
      expect(screen.getByLabelText("循环播放")).toBeTruthy();

      // 播放前可编辑
      expect((screen.getByLabelText("代表帧水平偏移") as HTMLInputElement).disabled).toBe(false);

      fireEvent.click(play);
      expect(play.disabled).toBe(true);
      expect(pause.disabled).toBe(false);
      // 播放中锁定变换
      expect((screen.getByLabelText("代表帧水平偏移") as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByLabelText("代表帧缩放") as HTMLInputElement).disabled).toBe(true);

      fireEvent.click(stop);
      expect(stop.disabled).toBe(true);
      expect((screen.getByLabelText("代表帧水平偏移") as HTMLInputElement).disabled).toBe(false);
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
