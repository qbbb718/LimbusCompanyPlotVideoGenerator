import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
// 本项目没有全局 setupTests（jest-dom 匹配器未注册），用到 toBeChecked/toBeInTheDocument 的文件自行引入
import "@testing-library/jest-dom";
import {
  DialogueAlign,
  EFFECT_TYPE_CROSS_DISSOLVE,
  EFFECT_TYPE_FADE_FROM_BLACK,
  EFFECT_TYPE_FADE_FROM_WHITE,
  EffectVisual,
  Emotion,
  Record as PlotRecord,
} from "@types";
import EffectsProperties from "./EffectsProperties";

/**
 * "剧情编辑 → 特效" tab 的起始转场开关：
 * - 三种转场（交叉溶解 / 黑屏 / 白屏）互斥：勾一种会把其它两种去掉；
 * - 已有特效（包括 enabled 缺省的旧数据）能正确回显成勾选；
 * - 数据里同时存在多种时按 交叉溶解 > 黑屏 > 白屏 只显示一种勾选（与后端渲染一致）；
 * - 第一条记录勾了交叉溶解要提示"没有上一条"，黑屏/白屏不受影响。
 */

const makeRecord = (effects: EffectVisual[] = []): PlotRecord => ({
  uuid: "r1",
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

const setupPanel = (
  record: PlotRecord,
  selectedRecordIndex = 1,
  updateRecord = jest.fn(),
) => {
  render(
    <EffectsProperties
      selectedRecord={record}
      selectedRecordIndex={selectedRecordIndex}
      updateRecord={updateRecord}
    />,
  );
  return updateRecord;
};

const checkbox = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;

describe("EffectsProperties 起始转场", () => {
  it("没有特效时三个复选框都未勾选", () => {
    setupPanel(makeRecord());
    expect(checkbox("交叉溶解")).not.toBeChecked();
    expect(checkbox("黑屏转场")).not.toBeChecked();
    expect(checkbox("白屏转场")).not.toBeChecked();
  });

  it("记录里已有的转场回显为勾选（enabled 缺省也算勾选）", () => {
    setupPanel(makeRecord([{ type: EFFECT_TYPE_CROSS_DISSOLVE }]));
    expect(checkbox("交叉溶解")).toBeChecked();
    expect(checkbox("黑屏转场")).not.toBeChecked();
    expect(checkbox("白屏转场")).not.toBeChecked();
  });

  it("黑屏 / 白屏转场同样能回显", () => {
    setupPanel(makeRecord([{ type: EFFECT_TYPE_FADE_FROM_BLACK }]));
    expect(checkbox("黑屏转场")).toBeChecked();
    expect(checkbox("白屏转场")).not.toBeChecked();
  });

  it("enabled 为 false 的特效按未勾选显示", () => {
    setupPanel(
      makeRecord([{ type: EFFECT_TYPE_FADE_FROM_WHITE, enabled: false }]),
    );
    expect(checkbox("白屏转场")).not.toBeChecked();
  });

  it("勾选黑屏转场会替换掉交叉溶解（三种互斥）", async () => {
    const updateRecord = setupPanel(
      makeRecord([{ type: EFFECT_TYPE_CROSS_DISSOLVE, enabled: true }]),
    );

    fireEvent.click(checkbox("黑屏转场"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [index, updatedRecord] = updateRecord.mock.calls[0];
    expect(index).toBe(1);
    expect(updatedRecord.effects).toEqual([
      { type: EFFECT_TYPE_FADE_FROM_BLACK, enabled: true },
    ]);
  });

  it("勾选白屏转场会替换掉已有的黑屏转场", async () => {
    const updateRecord = setupPanel(
      makeRecord([{ type: EFFECT_TYPE_FADE_FROM_BLACK }]),
    );

    fireEvent.click(checkbox("白屏转场"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.effects).toEqual([
      { type: EFFECT_TYPE_FADE_FROM_WHITE, enabled: true },
    ]);
  });

  it("取消勾选只删自己，其它特效保留", async () => {
    const updateRecord = setupPanel(
      makeRecord([
        { type: "SOME_FUTURE_EFFECT" },
        { type: EFFECT_TYPE_CROSS_DISSOLVE },
      ]),
    );

    fireEvent.click(checkbox("交叉溶解"));

    await waitFor(() => expect(updateRecord).toHaveBeenCalledTimes(1));
    const [, updatedRecord] = updateRecord.mock.calls[0];
    expect(updatedRecord.effects).toEqual([{ type: "SOME_FUTURE_EFFECT" }]);
  });

  it("数据里同时有多种转场时，按优先级只显示一种勾选", () => {
    // 故意把低优先级的放在前面，确认显示不看数组顺序
    setupPanel(
      makeRecord([
        { type: EFFECT_TYPE_FADE_FROM_WHITE },
        { type: EFFECT_TYPE_FADE_FROM_BLACK },
      ]),
    );
    expect(checkbox("黑屏转场")).toBeChecked();
    expect(checkbox("白屏转场")).not.toBeChecked();
  });

  it("第一条记录勾了交叉溶解时提示没有上一条", () => {
    setupPanel(makeRecord([{ type: EFFECT_TYPE_CROSS_DISSOLVE }]), 0);
    expect(screen.getByText(/没有「上一条记录」可以叠加/)).toBeInTheDocument();
  });

  it("第一条记录用黑屏转场时不提示（不依赖上一条）", () => {
    setupPanel(makeRecord([{ type: EFFECT_TYPE_FADE_FROM_BLACK }]), 0);
    expect(
      screen.queryByText(/没有「上一条记录」可以叠加/),
    ).not.toBeInTheDocument();
  });

  it("第二条及以后的记录不显示交叉溶解提示", () => {
    setupPanel(makeRecord([{ type: EFFECT_TYPE_CROSS_DISSOLVE }]), 1);
    expect(
      screen.queryByText(/没有「上一条记录」可以叠加/),
    ).not.toBeInTheDocument();
  });
});
