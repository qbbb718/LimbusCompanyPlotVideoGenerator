/**
 * 移动动画面板的接线测试：只验"用户操作 → 交给上层的数据"，不验样式。
 *
 * 注意：本项目没有加载 `@testing-library/jest-dom`（setupTests 不在 CRA 的默认位置），
 * 所以这里只用内置断言（toBeTruthy / toBeNull），不要写 toBeInTheDocument。
 *
 * 重点锁两条：
 * 1. 添加预设会产出一条完整的 clip（有 id / 时长 / 参数默认值）；
 * 2. 删掉最后一条动画时必须回传 undefined（而不是空 clips 数组）——
 *    否则渲染端会认为"有动画对象"，从而走逐帧路径，白白拖慢导出。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import CharacterAnimationPanel from "./CharacterAnimationPanel";

describe("立绘动画面板", () => {
  test("空状态：提示 + 添加预设会交出完整 clip", () => {
    const onChange = jest.fn();
    render(<CharacterAnimationPanel onChange={onChange} elementLabel="罗佳" />);
    expect(screen.getByText(/还没有动画/)).toBeTruthy();

    fireEvent.click(screen.getByText("＋ 添加"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.clips).toHaveLength(1);
    expect(next.clips[0]).toMatchObject({
      kind: "preset",
      preset: "bounce",
      durationFrames: 60,
      loop: "once",
    });
    expect(next.clips[0].id).toBeTruthy();
    expect(next.timebase).toEqual({ unit: "frame", fps: 30 });
  });

  test("已有的动画会列出可展开的参数表单", () => {
    const onChange = jest.fn();
    const clip = {
      id: "c1",
      kind: "preset" as const,
      preset: "bounce" as const,
      durationFrames: 60,
      params: { amplitude: 24 },
    };
    render(
      <CharacterAnimationPanel
        anim={{ clips: [clip] }}
        onChange={onChange}
        elementLabel="罗佳"
      />,
    );

    // 按 role=button 精确定位展开按钮（下拉框里也有"弹跳"文案，getByText 会撞车）
    fireEvent.click(screen.getByRole("button", { name: /弹跳/ }));
    const input = screen.getByLabelText("罗佳 弹跳 幅度");
    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { value: "80" } });
    const next = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(next.clips[0].params.amplitude).toBe(80);
  });

  test("删掉唯一一条动画时回传 undefined（让渲染端回到原路径）", () => {
    const onChange = jest.fn();
    render(
      <CharacterAnimationPanel
        anim={{ clips: [{ id: "c1", kind: "preset", preset: "sway", durationFrames: 30 }] }}
        onChange={onChange}
        elementLabel="罗佳"
      />,
    );

    fireEvent.click(screen.getByTitle("删除这条动画"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test("关键帧 clip 渲染出时间轴：菱形 + 选中出检查器 + 加帧按钮", () => {
    render(
      <CharacterAnimationPanel
        anim={{
          clips: [
            {
              id: "k1",
              kind: "keyframes",
              durationFrames: 60,
              channels: ["x", "y"],
              keys: [
                { f: 0, v: { x: 0, y: 0 }, ease: "easeInOut" },
                { f: 60, v: { x: 10, y: -20 } },
              ],
            },
          ],
        }}
        onChange={() => undefined}
        elementLabel="罗佳"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /关键帧/ }));
    // 表格换成时间轴：轴上有菱形，帧号输入挪到"选中之后"的检查器里
    expect(screen.getByLabelText("罗佳 时间轴标尺")).toBeTruthy();
    expect(screen.getByLabelText("罗佳 关键帧 1 第 0 帧")).toBeTruthy();
    expect(screen.getByText("＋ 加关键帧")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("罗佳 关键帧 2 第 60 帧"));
    expect(screen.getByLabelText("罗佳 关键帧 2 帧号")).toBeTruthy();
  });

  test("plot=false（人格故事）：置灰 + 提示，但仍然可编辑", () => {
    const onChange = jest.fn();
    const { container } = render(
      <CharacterAnimationPanel onChange={onChange} elementLabel="罗佳" plot={false} />,
    );

    expect(screen.getByRole("note").textContent).toContain("不参与渲染");
    const panel = container.querySelector(".animation-panel") as HTMLElement;
    expect(panel.className).toContain("is-inactive");
    expect(panel.style.opacity).toBe("0.55");

    // 不禁用：切回剧情模式时之前调的动画还在，用户也不必反复切模式
    fireEvent.click(screen.getByText("＋ 添加"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("plot=true（剧情）：没有提示、不置灰", () => {
    const { container } = render(
      <CharacterAnimationPanel onChange={() => undefined} elementLabel="罗佳" plot />,
    );
    expect(screen.queryByRole("note")).toBeNull();
    const panel = container.querySelector(".animation-panel") as HTMLElement;
    expect(panel.className).not.toContain("is-inactive");
  });

  test("每条动画包在独立卡片里（数量与标题可读）", () => {
    render(
      <CharacterAnimationPanel
        anim={{
          clips: [
            { id: "c1", kind: "preset", preset: "bounce", durationFrames: 60 },
            { id: "c2", kind: "preset", preset: "sway", durationFrames: 45 },
          ],
        }}
        onChange={() => undefined}
        elementLabel="罗佳"
      />,
    );

    expect(screen.getByTestId("animation-clip-1").className).toContain("animation-clip-card");
    expect(screen.getByTestId("animation-clip-2")).toBeTruthy();
    expect(screen.getByText(/1\. 弹跳/)).toBeTruthy();
    expect(screen.getByText(/2\. 摇摆/)).toBeTruthy();
  });

  test("整块可折叠：收起只留摘要，展开恢复卡片（收起不影响动画数据）", () => {
    const onChange = jest.fn();
    render(
      <CharacterAnimationPanel
        anim={{ clips: [{ id: "c1", kind: "preset", preset: "bounce", durationFrames: 60 }] }}
        onChange={onChange}
        elementLabel="罗佳"
      />,
    );

    const toggle = screen.getByRole("button", { name: /移动动画/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // 收起后摘要还在：不展开也能看出这个元素有没有动画
    expect(screen.getByText(/1 条：弹跳/)).toBeTruthy();
    expect(screen.queryByTestId("animation-clip-1")).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByTestId("animation-clip-1")).toBeTruthy();
    // 纯 UI 状态：折叠/展开不改数据
    expect(onChange).not.toHaveBeenCalled();
  });

  test("新建关键帧动画的时长 = max(语音, 文字)（lineFrames）；拿不到时退回默认 60", () => {
    const onChange = jest.fn();
    render(
      <CharacterAnimationPanel onChange={onChange} elementLabel="罗佳" lineFrames={96} />,
    );

    fireEvent.change(screen.getByLabelText("罗佳 新增动画类型"), {
      target: { value: "keyframes" },
    });
    fireEvent.click(screen.getByText("＋ 添加"));
    expect(onChange.mock.calls[0][0].clips[0].durationFrames).toBe(96);
  });

  test("没有台词长度（后端还没算出来）时，关键帧动画用默认时长", () => {
    const onChange = jest.fn();
    render(<CharacterAnimationPanel onChange={onChange} elementLabel="罗佳" />);

    fireEvent.change(screen.getByLabelText("罗佳 新增动画类型"), {
      target: { value: "keyframes" },
    });
    fireEvent.click(screen.getByText("＋ 添加"));
    expect(onChange.mock.calls[0][0].clips[0].durationFrames).toBe(60);
  });
});
