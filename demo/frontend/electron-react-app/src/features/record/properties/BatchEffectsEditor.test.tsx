/**
 * 「特效」页签的批量编辑面板（选中 2 条以上记录时替换单条面板）：
 * - 三态复选框：全部勾着 = 勾选；全部没勾 = 不勾；有的勾有的不勾 = 横杠（indeterminate）；
 * - 点一下的语义是"把这一批变成某个状态"：全勾 → 全部取消；否则 → 全部勾上；
 * - 起始转场互斥（勾一种会清掉选中记录上的其它转场），画面滤镜不互斥；
 * - 选中记录里有第 1 条时要提示交叉溶解对它不生效；
 * - 每次点击立刻写回（没有"应用"按钮）并给出结果反馈。
 */
import React, { useReducer } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  DialogueAlign,
  EFFECT_TYPE_CROSS_DISSOLVE,
  EFFECT_TYPE_FADE_FROM_BLACK,
  EFFECT_TYPE_FADE_FROM_WHITE,
  EFFECT_TYPE_T_CORP_FILTER,
  EffectVisual,
  Emotion,
  Record as PlotRecord,
} from "@types";
import BatchEffectsEditor from "./BatchEffectsEditor";
import type { BatchEditContext, RecordMutator } from "./batchEdit";

const makeRecord = (uuid: string, effects: EffectVisual[] = []): PlotRecord => ({
  uuid,
  durationFrames: 30,
  dialogue: {
    text: "",
    location: "default",
    speakerC: [],
    speakerName: "",
    faction: "",
    align: DialogueAlign.LEFT,
    speed: 3,
    emotion: Emotion.NORMAL,
  },
  bg: [],
  chars: [],
  tempImages: [],
  effects,
  audioCommands: [],
});

/**
 * 渲染批量特效面板，并模拟编辑器层"写回 → 重渲染"的闭环。
 *
 * <p>真实链路是：点复选框 → `apply(改写器)` → RecordEditor 把新记录写回 workspace →
 * 面板收到**新的 records** 重渲染（三态读数、复选框都跟着变）。这里用一个带状态的壳复现它，
 * 所以"再点一下 = 全部取消"这类来回切的行为也能测到。
 */
const renderPanel = (initial: PlotRecord[], indexes?: number[]) => {
  const state = {
    records: initial,
    /** 重渲染（由壳组件在渲染时注入） */
    rerender: () => {},
  };

  const apply = jest.fn((mutate: RecordMutator) => {
    let changed = 0;
    state.records = state.records.map((record) => {
      const next = mutate(record);
      if (next !== record) changed += 1;
      return next;
    });
    // 写回记录 → 面板重渲染（与 RecordEditor 的行为一致）
    state.rerender();
    return changed;
  });
  const exit = jest.fn();

  const Harness: React.FC = () => {
    const [, forceRender] = useReducer((count: number) => count + 1, 0);
    state.rerender = forceRender;

    const batch: BatchEditContext = {
      records: state.records,
      indexes: indexes ?? state.records.map((_, index) => index),
      apply,
      exit,
    };
    return <BatchEffectsEditor batch={batch} />;
  };

  render(<Harness />);
  return { apply, exit, records: () => state.records };
};

const checkbox = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;

describe("批量特效面板：三态回显", () => {
  test("全部勾着 → 勾选；全部没勾 → 不勾", () => {
    renderPanel([
      makeRecord("a", [{ type: EFFECT_TYPE_CROSS_DISSOLVE }]),
      makeRecord("b", [{ type: EFFECT_TYPE_CROSS_DISSOLVE }]),
    ]);

    expect(checkbox("交叉溶解转场")).toBeChecked();
    expect(checkbox("交叉溶解转场").indeterminate).toBe(false);
    expect(checkbox("黑屏转场")).not.toBeChecked();
    expect(checkbox("黑屏转场").indeterminate).toBe(false);
  });

  test("状态不一致 → 横杠（indeterminate）+ 标出几条已勾选", () => {
    renderPanel([
      makeRecord("a", [{ type: EFFECT_TYPE_FADE_FROM_BLACK }]),
      makeRecord("b"),
      makeRecord("c", [{ type: EFFECT_TYPE_FADE_FROM_BLACK }]),
    ]);

    const input = checkbox("黑屏转场");
    expect(input.indeterminate).toBe(true);
    // 横杠不算"勾选"：checked 仍是 false，视觉靠 indeterminate
    expect(input.checked).toBe(false);
    expect(screen.getByText(/部分已勾选（2\/3 条）/)).toBeTruthy();
  });

  test("标题说明句含选中条数，并说明横杠的含义", () => {
    renderPanel([makeRecord("a"), makeRecord("b")]);
    expect(screen.getByText("已选中 2 条记录")).toBeTruthy();
    expect(screen.getByText(/横杠表示选中的记录状态不一致/)).toBeTruthy();
  });
});

describe("批量特效面板：起始转场", () => {
  test("横杠状态点一下 = 全部勾上这一种（互斥：清掉其它转场）", () => {
    const panel = renderPanel([
      makeRecord("a", [{ type: EFFECT_TYPE_CROSS_DISSOLVE }]),
      makeRecord("b"),
    ]);

    fireEvent.click(checkbox("黑屏转场"));

    expect(panel.records().map((record) => record.effects)).toEqual([
      [{ type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: true }],
      [{ type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: true }],
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("2 条记录已勾选「黑屏转场」");
  });

  test("全部没勾时点一下也是全部勾上", () => {
    const panel = renderPanel([makeRecord("a"), makeRecord("b")]);

    fireEvent.click(checkbox("白屏转场"));

    expect(panel.records().map((record) => record.effects)).toEqual([
      [{ type: EFFECT_TYPE_FADE_FROM_WHITE, enabled: true }],
      [{ type: EFFECT_TYPE_FADE_FROM_WHITE, enabled: true }],
    ]);
  });

  test("全部勾着时点一下 = 全部取消（只删这一种，其它特效保留）", () => {
    const panel = renderPanel([
      makeRecord("a", [
        { type: EFFECT_TYPE_CROSS_DISSOLVE },
        { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
      ]),
      makeRecord("b", [{ type: EFFECT_TYPE_CROSS_DISSOLVE }]),
    ]);

    fireEvent.click(checkbox("交叉溶解转场"));

    expect(panel.records().map((record) => record.effects)).toEqual([
      [{ type: EFFECT_TYPE_T_CORP_FILTER, enabled: true }],
      [],
    ]);
  });

  test("全部取消时结果反馈同样带条数", () => {
    const panel = renderPanel([
      makeRecord("a", [{ type: EFFECT_TYPE_CROSS_DISSOLVE }]),
      makeRecord("b", [{ type: EFFECT_TYPE_CROSS_DISSOLVE }]),
    ]);

    fireEvent.click(checkbox("交叉溶解转场"));

    expect(panel.apply).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 条记录已取消「交叉溶解转场」",
    );
  });

  test("取消勾选后复选框回到未勾选（三态跟着刷新）", () => {
    renderPanel([
      makeRecord("a", [{ type: EFFECT_TYPE_CROSS_DISSOLVE }]),
      makeRecord("b", [{ type: EFFECT_TYPE_CROSS_DISSOLVE }]),
    ]);

    expect(checkbox("交叉溶解转场")).toBeChecked();
    fireEvent.click(checkbox("交叉溶解转场"));

    // 写回记录后重渲染：这批记录已经没有这个转场了
    expect(checkbox("交叉溶解转场")).not.toBeChecked();
    expect(screen.queryByText(/部分已勾选/)).toBeNull();
  });
});

describe("批量特效面板：画面滤镜", () => {
  test("横杠点一下 = 全部勾上；再点一下 = 全部取消", () => {
    const panel = renderPanel([
      makeRecord("a", [{ type: EFFECT_TYPE_T_CORP_FILTER, enabled: true }]),
      makeRecord("b"),
    ]);

    expect(checkbox("T巢滤镜").indeterminate).toBe(true);

    fireEvent.click(checkbox("T巢滤镜"));
    expect(
      panel
        .records()
        .every((record) =>
          record.effects.some((effect) => effect.type === EFFECT_TYPE_T_CORP_FILTER),
        ),
    ).toBe(true);

    fireEvent.click(checkbox("T巢滤镜"));
    expect(panel.records().every((record) => record.effects.length === 0)).toBe(true);
  });

  test("滤镜与转场不互斥：批量勾滤镜不会把转场挤掉", () => {
    const panel = renderPanel([
      makeRecord("a", [{ type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: true }]),
      makeRecord("b", [{ type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: true }]),
    ]);

    fireEvent.click(checkbox("T巢滤镜"));

    expect(panel.records().map((record) => record.effects)).toEqual([
      [
        { type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: true },
        { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
      ],
      [
        { type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: true },
        { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true },
      ],
    ]);
  });
});

describe("批量特效面板：提示与退出", () => {
  test("选中记录包含第 1 条时提示交叉溶解不生效", () => {
    renderPanel([makeRecord("a"), makeRecord("b")], [0, 1]);
    expect(screen.getByText(/第 1 条/)).toBeTruthy();
    expect(screen.getByText(/交叉溶解对它不生效/)).toBeTruthy();
  });

  test("只有后面的记录时没有这条提示", () => {
    renderPanel([makeRecord("b"), makeRecord("c")], [1, 2]);
    expect(screen.queryByText(/交叉溶解对它不生效/)).toBeNull();
  });

  test("「只编辑当前记录」交给上层（退出批量）", () => {
    const panel = renderPanel([makeRecord("a"), makeRecord("b")]);

    fireEvent.click(screen.getByRole("button", { name: "只编辑当前记录" }));
    expect(panel.exit).toHaveBeenCalledTimes(1);
  });
});
