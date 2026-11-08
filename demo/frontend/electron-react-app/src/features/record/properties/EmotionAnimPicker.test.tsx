/**
 * 情绪动画选择器的接线测试：只验"用户操作 → 交给上层的数据"，不验样式。
 *
 * 本项目没有加载 `@testing-library/jest-dom`，所以只用内置断言。
 *
 * 锁三条（对应重构的验收点）：
 * 1. 只能**选**已有动画，选完交出的是一份完整快照；
 * 2. 「新建成/编辑」在资源管理，这里只有一个跳转按钮；
 * 3. 选「不使用」回传 undefined（渲染端回到逐像素不变的原路径）。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import type { AnimationClipDto } from "../animation/animationClipAsset";
import * as libraryModule from "../animation/useAnimationClipLibrary";
import EmotionAnimPicker from "./EmotionAnimPicker";

const asset: AnimationClipDto = {
  id: "flow_abcd1234",
  name: "花开",
  canvasWidth: 600,
  canvasHeight: 400,
  fps: 30,
  frameCount: 3,
  totalFrames: 6,
  frameHolds: [3, 1, 2],
  loop: "hold",
  iterations: null,
  startFrame: 0,
  fadeInFrames: 4,
  fadeOutFrames: 0,
  opacity: 1,
  poster: { frame: 1, offsetX: 0.25, offsetY: -0.4, scale: 1.2 },
  createdAt: 1,
  frameBaseUrl: "/assets/animation-clips/flow_abcd1234/frames/",
  coverUrl: "/assets/animation-clips/flow_abcd1234/frames/0001.png",
  framesOnDisk: 3,
  missingFrames: false,
};

function mockLibrary(clips: AnimationClipDto[]) {
  jest.spyOn(libraryModule, "useAnimationClipLibrary").mockReturnValue({
    clips,
    loading: false,
    error: null,
    reload: jest.fn(),
    find: (clipId?: string | null) => clips.find((clip) => clip.id === clipId),
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("情绪动画选择器", () => {
  test("默认「不使用」；素材库为空时提示去资源管理创建", () => {
    mockLibrary([]);
    const onChange = jest.fn();
    render(<EmotionAnimPicker onChange={onChange} elementLabel="罗佳" />);

    const select = screen.getByLabelText("罗佳 选用情绪动画") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByText(/还没有可用于序列帧动画的素材/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("选中动画后交出的是一份完整快照（含素材上的播放参数与代表帧摆放）", () => {
    mockLibrary([asset]);
    const onChange = jest.fn();
    render(<EmotionAnimPicker onChange={onChange} elementLabel="罗佳" />);

    fireEvent.change(screen.getByLabelText("罗佳 选用情绪动画"), {
      target: { value: "flow_abcd1234" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      clipId: "flow_abcd1234",
      frameHolds: [3, 1, 2],
      loop: "hold",
      fadeInFrames: 4,
      posterFrame: 1,
      offsetX: 0.25,
      offsetY: -0.4,
      scale: 1.2,
    });
  });

  test("选「不使用」回传 undefined", () => {
    mockLibrary([asset]);
    const onChange = jest.fn();
    render(
      <EmotionAnimPicker
        emotionAnim={{
          version: 1,
          clipId: "flow_abcd1234",
          name: "花开",
          canvasWidth: 600,
          canvasHeight: 400,
          frameHolds: [3, 1, 2],
        }}
        onChange={onChange}
        elementLabel="罗佳"
      />,
    );

    fireEvent.change(screen.getByLabelText("罗佳 选用情绪动画"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test("跳转按钮只在给了回调时出现（这里只负责跳，不负责做）", () => {
    mockLibrary([asset]);
    const onJump = jest.fn();
    const { unmount } = render(
      <EmotionAnimPicker onChange={jest.fn()} elementLabel="罗佳" onOpenAnimationLibrary={onJump} />,
    );
    fireEvent.click(screen.getByText(/前往资源管理编辑动画/));
    expect(onJump).toHaveBeenCalledTimes(1);
    unmount();

    render(<EmotionAnimPicker onChange={jest.fn()} elementLabel="罗佳" />);
    expect(screen.queryByText(/前往资源管理编辑动画/)).toBeNull();
  });

  test("素材被删除后给出提示，且下拉里保留占位项（不能显示成「不使用」骗用户）", () => {
    mockLibrary([]);
    render(
      <EmotionAnimPicker
        emotionAnim={{
          version: 1,
          clipId: "gone_id",
          name: "花开",
          canvasWidth: 600,
          canvasHeight: 400,
          frameHolds: [3, 1, 2],
        }}
        onChange={jest.fn()}
        elementLabel="罗佳"
      />,
    );

    expect(screen.getByText(/素材已不在资源管理里/)).toBeTruthy();
    expect(screen.getByText(/素材已删除/)).toBeTruthy();
  });
});
