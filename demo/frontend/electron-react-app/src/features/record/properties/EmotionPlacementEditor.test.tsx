/**
 * 情绪动画「摆放」编辑器（剧情编辑 → 立绘 → 情绪动画 → 摆放）的接线测试。
 *
 * 只验"用户操作 → 交给上层的数据"，不验样式。本项目没有加载
 * `@testing-library/jest-dom`，所以只用内置断言。
 *
 * 锁六条（对应这个控件的验收点）：
 * 1. 三行控件（X 位置 / Y 位置 / 缩放）都在，初值就是记录里的那份快照；
 * 2. 滑杆 / 数值框只回传**变化的那一个字段**——上层要能原样合并回 emotionAnim；
 * 3. 写回时收敛到两位小数：滑杆给的 0.30000000000000004 不该进工程文件；
 * 4. 「还原」一次性回到**素材上的摆放**，而不是"居中 100%"（那是 ↺ 清零，不是还原）；
 * 5. 已经等于素材摆放时「还原」禁用（点了也什么都没发生），提示里也不说"已微调"；
 * 6. 素材缺失（baseline = null）时没有原摆放可比：还原回落到居中 + 原始尺寸。
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import type { EmotionPlacement } from "../animation/animationTypes";
import EmotionPlacementEditor from "./EmotionPlacementEditor";

/** 素材上的原始摆放（资源管理里对着脸调好的那套） */
const BASELINE: EmotionPlacement = { offsetX: 0.25, offsetY: -0.4, scale: 1.2 };

/** 这条记录当前的摆放（被用户微调过） */
const CURRENT: EmotionPlacement = { offsetX: 0.5, offsetY: -0.1, scale: 0.8 };

const renderEditor = (
  overrides: Partial<React.ComponentProps<typeof EmotionPlacementEditor>> = {},
) => {
  const onChange = jest.fn();
  render(
    <EmotionPlacementEditor
      elementLabel="罗佳"
      value={CURRENT}
      baseline={BASELINE}
      onChange={onChange}
      {...overrides}
    />,
  );
  return onChange;
};

const valueOf = (label: string): string =>
  (screen.getByLabelText(label) as HTMLInputElement).value;

describe("情绪动画摆放编辑器", () => {
  test("三行控件都在，数值框显示记录里的摆放，提示里写明素材摆放", () => {
    renderEditor();

    expect(valueOf("罗佳 动画 X 位置")).toBe("0.5");
    expect(valueOf("罗佳 动画 Y 位置")).toBe("-0.1");
    expect(valueOf("罗佳 动画 缩放")).toBe("0.8");

    // 滑杆的范围按"头宽"来，位置滑杆比数值框窄（粗调 vs 精确输入）
    const xSlider = screen.getByLabelText("罗佳 动画 X 位置滑块") as HTMLInputElement;
    expect(xSlider.value).toBe("0.5");
    expect(xSlider.min).toBe("-3");
    expect(xSlider.max).toBe("3");

    // 用户得知道"还原"会回到哪 —— 素材上的那套摆放要写在明面上
    expect(screen.getByText(/素材摆放：X 0\.25 · Y -0\.40 头宽/)).toBeTruthy();
    expect(screen.getByText(/缩放 120%/)).toBeTruthy();
    // 已经被这条记录改过：提示里要说清楚，别让人以为界面上的值就是素材值
    expect(screen.getByText(/已微调/)).toBeTruthy();
  });

  test("拖滑杆只回传那一个字段，并收敛到两位小数", () => {
    const onChange = renderEditor();

    fireEvent.change(screen.getByLabelText("罗佳 动画 Y 位置滑块"), {
      target: { value: "-1.234" },
    });

    // 只有 offsetY：上层拿到的是"补丁"，剩下的字段它自己合并
    expect(onChange).toHaveBeenCalledWith({ offsetY: -1.23 });
  });

  test("数值框支持小数与负数（手输比滑杆更自由，能超过 ±3 头宽）", () => {
    const onChange = renderEditor();

    fireEvent.change(screen.getByLabelText("罗佳 动画 X 位置"), {
      target: { value: "-8.5" },
    });

    expect(onChange).toHaveBeenCalledWith({ offsetX: -8.5 });
  });

  test("「还原」一次性回到素材上的摆放，而不是居中 100%", () => {
    const onChange = renderEditor();

    fireEvent.click(screen.getByLabelText("罗佳 还原动画摆放"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      offsetX: 0.25,
      offsetY: -0.4,
      scale: 1.2,
    });
  });

  test("已经等于素材摆放时：还原按钮禁用、提示里不出现「已微调」", () => {
    renderEditor({ value: { ...BASELINE } });

    const reset = screen.getByLabelText("罗佳 还原动画摆放") as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    expect(screen.queryByText(/已微调/)).toBeNull();
    // 单行 ↺ 同理：三行都已等于素材值
    expect(
      (screen.getByLabelText("罗佳 还原动画 缩放") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  test("单行 ↺ 只复原那一行", () => {
    const onChange = renderEditor();

    fireEvent.click(screen.getByLabelText("罗佳 还原动画 X 位置"));

    expect(onChange).toHaveBeenCalledWith({ offsetX: 0.25 });
    // 其余两行还是用户调过的值，不该被顺带写回
    expect(valueOf("罗佳 动画 Y 位置")).toBe("-0.1");
    expect(valueOf("罗佳 动画 缩放")).toBe("0.8");
  });

  test("素材缺失（baseline = null）：没有原摆放可比，还原回落到居中 + 原始尺寸", () => {
    const onChange = renderEditor({ baseline: null });

    expect(screen.getByText(/素材已删除：还原回居中、原始尺寸/)).toBeTruthy();
    // 缺素材时也要能对齐到"渲染端默认会画的位置"
    expect(screen.getByLabelText("罗佳 还原动画摆放")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("罗佳 还原动画摆放"));
    expect(onChange).toHaveBeenCalledWith({ offsetX: 0, offsetY: 0, scale: 1 });
  });
});
