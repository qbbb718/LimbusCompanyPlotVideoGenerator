/**
 * 情绪动画选择器的接线测试：只验"用户操作 → 交给上层的数据"，不验样式。
 *
 * 本项目没有加载 `@testing-library/jest-dom`，所以只用内置断言。
 *
 * 锁九条（对应重构的验收点）：
 * 1. 只能**选**已有动画，选完交出的是一份完整快照；
 * 2. 「新建成/编辑」在资源管理，这里只有一个跳转按钮；
 * 3. 选「不使用」回传 undefined（渲染端回到逐像素不变的原路径）；
 * 4. 下拉里每一项都带**缩略图**（原生 select 做不到这个，这是换自定义下拉的唯一原因）；
 * 5. 素材被删后下拉里保留占位项，不能显示成「不使用」骗用户；
 * 6. 选了动画就能**就地微调摆放**（位置 + 缩放），交出的仍是一份完整的 emotionAnim；
 * 7. 「还原」回到**素材上的摆放**；素材删了则回到居中 + 原始尺寸；
 * 8. 只微调过摆放**不算**"与素材不一致"：不弹「从素材同步」；
 * 9. 时序/播放参数真的不一样时才弹那条警告。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import type { EmotionAnim } from "../animation/animationTypes";
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

/** 打开「选用动画」下拉（触发器靠 aria-label 定位，与真实用户点的是同一个按钮） */
function openDropdown() {
  fireEvent.click(screen.getByLabelText("罗佳 选用情绪动画"));
  return screen.getByRole("listbox", { name: "罗佳 情绪动画素材" });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("情绪动画选择器", () => {
  test("默认「不使用」；素材库为空时提示去资源管理创建", () => {
    mockLibrary([]);
    const onChange = jest.fn();
    render(<EmotionAnimPicker onChange={onChange} elementLabel="罗佳" />);

    const trigger = screen.getByLabelText("罗佳 选用情绪动画");
    expect(trigger.textContent).toContain("不使用");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText(/还没有素材/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("选中动画后交出的是一份完整快照（含素材上的播放参数与代表帧摆放）", () => {
    mockLibrary([asset]);
    const onChange = jest.fn();
    render(<EmotionAnimPicker onChange={onChange} elementLabel="罗佳" />);

    openDropdown();
    fireEvent.click(screen.getByRole("option", { name: /花开/ }));

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
    // 选完自动收起
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("下拉里每一项都带缩略图：素材用「代表帧」，不使用的项没有图", () => {
    mockLibrary([asset]);
    render(<EmotionAnimPicker onChange={jest.fn()} elementLabel="罗佳" />);

    openDropdown();

    const clipOption = screen.getByRole("option", { name: /花开/ });
    const thumb = clipOption.querySelector("img");
    expect(thumb).not.toBeNull();
    // poster.frame = 1 → 第 2 张，不是第 1 张（缩略图 = 预览图静止时画的那一张）
    expect(thumb!.getAttribute("src")).toContain("0002.png");
    // 帧数也写在选项里，光看名字分不出两段"花开"
    expect(clipOption.textContent).toContain("3 张 / 6 帧");

    expect(screen.getByRole("option", { name: /不使用/ }).querySelector("img")).toBeNull();
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

    openDropdown();
    fireEvent.click(screen.getByRole("option", { name: /不使用/ }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test("Esc 关闭下拉（不改变当前选择）", () => {
    mockLibrary([asset]);
    const onChange = jest.fn();
    render(<EmotionAnimPicker onChange={onChange} elementLabel="罗佳" />);

    openDropdown();
    expect(screen.queryByRole("listbox")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
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
    expect(screen.getByLabelText("罗佳 选用情绪动画").textContent).toContain("素材已删除");

    openDropdown();
    expect(screen.getByRole("option", { name: /素材已删除/ })).toBeTruthy();
  });
});

/* ===================== 摆放（位置 + 缩放）微调 ===================== */

/** 挂好素材的记录快照（摆放与素材的 poster 一致：0.25 / -0.4 / 1.2） */
const animWith = (overrides: Partial<EmotionAnim> = {}): EmotionAnim => ({
  version: 1,
  clipId: "flow_abcd1234",
  name: "花开",
  canvasWidth: 600,
  canvasHeight: 400,
  frameHolds: [3, 1, 2],
  loop: "hold",
  iterations: null,
  startFrame: 0,
  fadeInFrames: 4,
  fadeOutFrames: 0,
  opacity: 1,
  posterFrame: 1,
  offsetX: 0.25,
  offsetY: -0.4,
  scale: 1.2,
  ...overrides,
});

describe("情绪动画摆放（剧情编辑页就地微调）", () => {
  test("拖摆放滑杆交出的是一份完整的 emotionAnim（只换那一个字段）", () => {
    mockLibrary([asset]);
    const onChange = jest.fn();
    render(
      <EmotionAnimPicker emotionAnim={animWith()} onChange={onChange} elementLabel="罗佳" />,
    );

    fireEvent.change(screen.getByLabelText("罗佳 动画 X 位置滑块"), {
      target: { value: "1.5" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.offsetX).toBe(1.5);
    // 时序 / 播放参数 / 摆放的其余两项原样带回去：上层拿到的永远是完整快照
    expect(next.frameHolds).toEqual([3, 1, 2]);
    expect(next.loop).toBe("hold");
    expect(next.posterFrame).toBe(1);
    expect(next.offsetY).toBe(-0.4);
    expect(next.scale).toBe(1.2);
  });

  test("「还原」回到素材上的摆放（不是居中 100%）", () => {
    mockLibrary([asset]);
    const onChange = jest.fn();
    render(
      <EmotionAnimPicker
        emotionAnim={animWith({ offsetX: 2, offsetY: 1, scale: 0.4 })}
        onChange={onChange}
        elementLabel="罗佳"
      />,
    );

    fireEvent.click(screen.getByLabelText("罗佳 还原动画摆放"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      offsetX: 0.25,
      offsetY: -0.4,
      scale: 1.2,
    });
  });

  test("只微调过摆放不算「与素材不一致」：不弹「从素材同步」", () => {
    mockLibrary([asset]);
    render(
      <EmotionAnimPicker
        emotionAnim={animWith({ offsetX: 2, scale: 0.4 })}
        onChange={jest.fn()}
        elementLabel="罗佳"
      />,
    );

    expect(screen.queryByText(/配置与素材当前版本不一致/)).toBeNull();
    // 但"这条记录改过摆放"要说清楚，否则用户会以为素材被改了
    expect(screen.getByText(/已微调/)).toBeTruthy();
  });

  test("时序确实与素材不同时才弹「从素材同步」", () => {
    mockLibrary([asset]);
    render(
      <EmotionAnimPicker
        emotionAnim={animWith({ frameHolds: [1, 1, 1] })}
        onChange={jest.fn()}
        elementLabel="罗佳"
      />,
    );

    expect(screen.getByText(/配置与素材当前版本不一致/)).toBeTruthy();
  });

  test("素材缺失时摆放编辑仍在：还原回到居中 + 原始尺寸", () => {
    mockLibrary([]);
    const onChange = jest.fn();
    render(
      <EmotionAnimPicker
        emotionAnim={animWith({ offsetX: 1 })}
        onChange={onChange}
        elementLabel="罗佳"
      />,
    );

    expect(screen.getByText(/素材已删除：还原回居中、原始尺寸/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("罗佳 还原动画摆放"));
    expect(onChange.mock.calls[0][0]).toMatchObject({ offsetX: 0, offsetY: 0, scale: 1 });
  });

  test("「不使用」时没有摆放控件（没有东西可摆）", () => {
    mockLibrary([asset]);
    render(<EmotionAnimPicker onChange={jest.fn()} elementLabel="罗佳" />);

    expect(screen.queryByText("摆放（相对头部区域）")).toBeNull();
    expect(screen.queryByLabelText("罗佳 还原动画摆放")).toBeNull();
  });
});
