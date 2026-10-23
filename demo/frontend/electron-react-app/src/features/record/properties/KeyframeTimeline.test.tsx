/**
 * 关键帧时间轴。
 *
 * 三件事一起锁：
 * 1. **坐标换算**：关键帧的 `f` 是 clip 内 local 帧（含 timeScale），预览是记录绝对帧，
 *    两边换算错了"点一下跳到别的帧"这种 bug 极难看出来；
 * 2. **点轴 = 跳帧**：点标尺任意位置、点菱形，都要把记录绝对帧交给 `onSeekFrame`；
 * 3. **播放头**：当前帧落在本 clip 区间内才画，且位置按比例算。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import KeyframeTimeline, {
  localFrameAt,
  localOfRecordFrame,
  recordFrameOfLocal,
} from "./KeyframeTimeline";
import type { AnimationClip } from "../animation/animationTypes";

const clip = (patch: Partial<AnimationClip> = {}): AnimationClip => ({
  id: "k1",
  kind: "keyframes",
  durationFrames: 60,
  channels: ["x"],
  keys: [
    { f: 0, v: { x: 0 }, ease: "easeInOut" },
    { f: 30, v: { x: 100 } },
  ],
  ...patch,
});

/** jsdom 不做布局：给标尺一个固定的 200×34 矩形，点击位置才有意义 */
function stubRuler(width = 200) {
  return jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: 34,
    width,
    height: 34,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("帧号换算", () => {
  test("local ↔ 记录帧（startFrame 偏移）", () => {
    const shifted = clip({ startFrame: 30 });
    expect(recordFrameOfLocal(shifted, 10)).toBe(40);
    expect(localOfRecordFrame(shifted, 40)).toBe(10);
    // clip 开始之前是负数（调用方据此不画播放头）
    expect(localOfRecordFrame(shifted, 10)).toBe(-20);
  });

  test("timeScale 参与换算（关键帧 f 是缩放后的 local 帧）", () => {
    const fast = clip({ timeScale: 2 });
    expect(recordFrameOfLocal(fast, 20)).toBe(10);
    expect(localOfRecordFrame(fast, 10)).toBe(20);
  });

  test("localFrameAt：按比例取整并夹在 [0, duration]", () => {
    const rect = { left: 0, width: 200 };
    expect(localFrameAt(100, rect, 60)).toBe(30);
    expect(localFrameAt(0, rect, 60)).toBe(0);
    expect(localFrameAt(200, rect, 60)).toBe(60);
    // 越界（点在轴外）要夹住，不能算出负帧
    expect(localFrameAt(-50, rect, 60)).toBe(0);
    expect(localFrameAt(999, rect, 60)).toBe(60);
    // 宽度为 0（jsdom 未布局）→ 0，不产生 NaN
    expect(localFrameAt(50, { left: 0, width: 0 }, 60)).toBe(0);
  });
});

describe("时间轴交互", () => {
  test("每条关键帧一个菱形，点菱形 = 选中 + 把预览跳到该帧", () => {
    stubRuler();
    const onSeekFrame = jest.fn();
    render(
      <KeyframeTimeline clip={clip()} elementLabel="罗佳" onSeekFrame={onSeekFrame} onChange={() => undefined} />,
    );

    expect(screen.getByLabelText("罗佳 关键帧 1 第 0 帧")).toBeTruthy();
    expect(screen.getByLabelText("罗佳 关键帧 2 第 30 帧")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("罗佳 关键帧 2 第 30 帧"));
    expect(onSeekFrame).toHaveBeenCalledWith(30);
    // 选中后检查器出现，帧号可编辑
    expect(screen.getByLabelText("罗佳 关键帧 2 帧号")).toBeTruthy();
  });

  test("点标尺任意位置 = 把预览跳到那一帧（按比例）", () => {
    stubRuler(200);
    const onSeekFrame = jest.fn();
    render(
      <KeyframeTimeline clip={clip()} elementLabel="罗佳" onSeekFrame={onSeekFrame} onChange={() => undefined} />,
    );

    // 200px 宽、60 帧 → 100px 处 = 第 30 帧
    fireEvent.click(screen.getByLabelText("罗佳 时间轴标尺"), { clientX: 100 });
    expect(onSeekFrame).toHaveBeenLastCalledWith(30);

    fireEvent.click(screen.getByLabelText("罗佳 时间轴标尺"), { clientX: 50 });
    expect(onSeekFrame).toHaveBeenLastCalledWith(15);
  });

  test("startFrame 偏移会加到跳帧请求上（预览要的是记录绝对帧）", () => {
    stubRuler(200);
    const onSeekFrame = jest.fn();
    render(
      <KeyframeTimeline
        clip={clip({ startFrame: 30 })}
        elementLabel="罗佳"
        onSeekFrame={onSeekFrame}
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByLabelText("罗佳 时间轴标尺"), { clientX: 100 }); // local 30
    expect(onSeekFrame).toHaveBeenLastCalledWith(60);
  });

  test("播放头画在当前帧的位置；当前帧不在本 clip 里就不画", () => {
    const { rerender } = render(
      <KeyframeTimeline clip={clip()} elementLabel="罗佳" currentFrame={15} onChange={() => undefined} />,
    );

    const playhead = screen.getByTestId("keyframe-playhead");
    expect(playhead.style.left).toBe("25%"); // 15/60

    rerender(
      <KeyframeTimeline clip={clip({ startFrame: 30 })} elementLabel="罗佳" currentFrame={15} onChange={() => undefined} />,
    );
    expect(screen.queryByTestId("keyframe-playhead")).toBeNull();
  });

  test("在播放头处加关键帧（而不是永远加在末尾）", () => {
    const onChange = jest.fn();
    render(
      <KeyframeTimeline clip={clip()} elementLabel="罗佳" currentFrame={20} onChange={onChange} />,
    );

    fireEvent.click(screen.getByText("＋ 加关键帧"));
    const next = onChange.mock.calls[0][0] as AnimationClip;
    expect(next.keys?.map((key) => key.f)).toEqual([0, 20, 30]);
    // 新帧的值沿用插入点之前那一帧（不会突然跳回恒等值）
    expect(next.keys?.[1].v).toEqual({ x: 0 });
  });

  test("播放头不在本 clip 里时，加帧退回末尾 + 10", () => {
    const onChange = jest.fn();
    render(<KeyframeTimeline clip={clip()} elementLabel="罗佳" onChange={onChange} />);

    fireEvent.click(screen.getByText("＋ 加关键帧"));
    const next = onChange.mock.calls[0][0] as AnimationClip;
    expect(next.keys?.map((key) => key.f)).toEqual([0, 30, 40]);
  });

  test("选中帧后改通道值 / 删帧都回写新 clip", () => {    const onChange = jest.fn();
    render(
      <KeyframeTimeline clip={clip()} elementLabel="罗佳" onChange={onChange} />,
    );

    fireEvent.click(screen.getByLabelText("罗佳 关键帧 2 第 30 帧"));
    fireEvent.change(screen.getByLabelText("罗佳 关键帧 2 x"), { target: { value: "42" } });
    const changed = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AnimationClip;
    expect(changed.keys?.[1].v).toEqual({ x: 42 });

    fireEvent.click(screen.getByLabelText("罗佳 关键帧 2 删除"));
    const removed = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AnimationClip;
    expect(removed.keys).toHaveLength(1);
  });

  test("轴长对齐到台词长度 max(语音, 文字)：显示长度，不一致时给对齐按钮", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <KeyframeTimeline clip={clip({ durationFrames: 60 })} elementLabel="罗佳" lineFrames={96} onChange={onChange} />,
    );

    expect(screen.getByText(/台词长度 96 帧/)).toBeTruthy();
    fireEvent.click(screen.getByText("对齐到 96 帧"));
    expect((onChange.mock.calls[0][0] as AnimationClip).durationFrames).toBe(96);

    // 已经一致就不再显示按钮（避免无意义的常驻控件）
    rerender(
      <KeyframeTimeline clip={clip({ durationFrames: 96 })} elementLabel="罗佳" lineFrames={96} onChange={onChange} />,
    );
    expect(screen.queryByText("对齐到 96 帧")).toBeNull();
  });
});
