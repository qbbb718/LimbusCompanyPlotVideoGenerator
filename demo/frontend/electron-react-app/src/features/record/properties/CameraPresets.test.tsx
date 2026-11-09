/**
 * 「摄像机 → 预设」区块（UI）。
 *
 * 锁的是三件事：
 * 1. **迁移**：镜头摇动现在在这里，勾选/取消写回的仍是 `record.effects` 里那条
 *    `{type:"CAMERA_SHAKE", enabled:true}`（与「特效」页签时代逐字节一致，旧工程不用迁移）；
 * 2. **行为不变**：写回的条目交给 `cameraShakeConfigOf`，拿到的参数就是运行时真正用的参数；
 * 3. **可扩展**：塞一份"假预设"进去，面板照样渲染出开关与参数、照样写回 —— 面板没有硬编码摇动。
 *
 * 测试壳是**有状态**的：写回会真的改变 `selectedRecord.effects` 并重渲染，
 * 所以"勾选后出现参数控件"这类交互走的是真实链路（面板本身不存状态）。
 */
import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  DialogueAlign,
  EFFECT_TYPE_CAMERA_SHAKE,
  EFFECT_TYPE_CROSS_DISSOLVE,
  Emotion,
  Record as PlotRecord,
} from "@types";
import type { EffectVisual } from "@types";
import CameraPresets from "./CameraPresets";
import type { CameraPresetDefinition } from "../preview/cameraPresets";
import {
  DEFAULT_CAMERA_SHAKE_AMPLITUDE,
  DEFAULT_CAMERA_SHAKE_DURATION_FRAMES,
  DEFAULT_CAMERA_SHAKE_FADE_IN_FRAMES,
  DEFAULT_CAMERA_SHAKE_FADE_OUT_FRAMES,
  DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
  cameraShakeConfigOf,
} from "../preview/cameraShake";

const makeRecord = (effects: EffectVisual[]): PlotRecord => ({
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

/** 一次写回：下标 + 写回的 effects（用例主要看后者） */
interface Write {
  index: number;
  effects: EffectVisual[];
}

/**
 * 渲染预设区块。
 *
 * @returns 每次写回的记录（有状态：写回后界面会真的更新）
 */
const setupPanel = (
  effects: EffectVisual[] = [],
  presets?: CameraPresetDefinition[],
): Write[] => {
  const writes: Write[] = [];

  const Harness: React.FC = () => {
    const [current, setCurrent] = useState(effects);
    const updateRecord = (index: number, next: PlotRecord) => {
      writes.push({ index, effects: next.effects ?? [] });
      setCurrent(next.effects ?? []);
    };
    return (
      <CameraPresets
        selectedRecord={makeRecord(current)}
        selectedRecordIndex={3}
        updateRecord={updateRecord}
        presets={presets}
      />
    );
  };

  render(<Harness />);
  return writes;
};

const checkbox = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;

/** 按一次"幅度"输入框输入（NumberField 是 text 输入，空串会被当成中间态忽略） */
const typeAmplitude = (value: string) =>
  fireEvent.change(screen.getByLabelText("镜头摇动 幅度"), {
    target: { value },
  });

describe("摄像机预设 → 镜头摇动", () => {
  it("区块里列出了「镜头摇动」，默认未启用、不显示参数", () => {
    setupPanel();

    expect(screen.getByRole("region", { name: "摄像机预设" })).toBeTruthy();
    expect(checkbox("镜头摇动")).not.toBeChecked();
    // 参数只在启用后出现
    expect(screen.queryByLabelText("镜头摇动 幅度")).toBeNull();
    expect(screen.queryByLabelText("镜头摇动 周期")).toBeNull();
  });

  it("旧数据 `{type:'CAMERA_SHAKE'}` 回显为已勾选，参数显示缺省值", () => {
    setupPanel([{ type: EFFECT_TYPE_CAMERA_SHAKE }]);

    expect(checkbox("镜头摇动")).toBeChecked();
    expect(screen.getByLabelText("镜头摇动 幅度")).toHaveValue(
      String(DEFAULT_CAMERA_SHAKE_AMPLITUDE),
    );
    expect(screen.getByLabelText("镜头摇动 周期")).toHaveValue(
      String(DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES),
    );
  });

  it("勾选写回 `{type, enabled:true}`（与「特效」页签时代一致），运行时立刻生效", async () => {
    const writes = setupPanel();

    fireEvent.click(checkbox("镜头摇动"));

    await waitFor(() => expect(writes).toHaveLength(1));
    // 写的是当前记录（下标 3），条目形状与迁移前逐字节一致
    expect(writes[0].index).toBe(3);
    expect(writes[0].effects).toEqual([{ type: "CAMERA_SHAKE", enabled: true }]);
    // 交回给运行时的参数 = 缺省值（行为与迁移前一致：整条记录、不渐入、不渐出）
    expect(cameraShakeConfigOf(writes[0].effects)).toEqual({
      amplitude: DEFAULT_CAMERA_SHAKE_AMPLITUDE,
      periodFrames: DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
      durationFrames: DEFAULT_CAMERA_SHAKE_DURATION_FRAMES,
      fadeInFrames: DEFAULT_CAMERA_SHAKE_FADE_IN_FRAMES,
      fadeOutFrames: DEFAULT_CAMERA_SHAKE_FADE_OUT_FRAMES,
    });
    // 勾上之后参数控件出现，且显示缺省值
    expect(screen.getByLabelText("镜头摇动 幅度")).toHaveValue(
      String(DEFAULT_CAMERA_SHAKE_AMPLITUDE),
    );
  });

  it("取消勾选只删这一条，转场等其它特效原样保留", async () => {
    const writes = setupPanel([
      { type: EFFECT_TYPE_CROSS_DISSOLVE, enabled: true },
      { type: EFFECT_TYPE_CAMERA_SHAKE, enabled: true },
    ]);

    fireEvent.click(checkbox("镜头摇动"));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].effects).toEqual([
      { type: EFFECT_TYPE_CROSS_DISSOLVE, enabled: true },
    ]);
  });

  it("改幅度只写回那一条的参数，其它字段保留", async () => {
    const writes = setupPanel([
      { type: EFFECT_TYPE_CAMERA_SHAKE, enabled: true, periodFrames: 4 },
    ]);

    typeAmplitude("20");

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].effects).toEqual([
      { type: "CAMERA_SHAKE", enabled: true, periodFrames: 4, amplitude: 20 },
    ]);
    // 运行时读到的就是面板上的值
    expect(cameraShakeConfigOf(writes[0].effects)).toMatchObject({
      amplitude: 20,
      periodFrames: 4,
    });
  });

  it("持续 / 渐入 / 渐出：启用后出现，改动能写回同一条", async () => {
    const writes = setupPanel([{ type: EFFECT_TYPE_CAMERA_SHAKE, enabled: true }]);

    ["持续", "渐入", "渐出"].forEach((label) => {
      expect(screen.getByLabelText(`镜头摇动 ${label}`)).toBeInTheDocument();
    });
    // 缺省都是 0（整条记录 / 不渐入 / 不渐出）
    expect(screen.getByLabelText("镜头摇动 持续")).toHaveValue("0");
    expect(screen.getByLabelText("镜头摇动 渐入")).toHaveValue("0");
    expect(screen.getByLabelText("镜头摇动 渐出")).toHaveValue("0");

    fireEvent.change(screen.getByLabelText("镜头摇动 持续"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("镜头摇动 渐入"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("镜头摇动 渐出"), { target: { value: "8" } });

    await waitFor(() =>
      expect(writes[writes.length - 1].effects[0]).toMatchObject({
        durationFrames: 30,
        fadeInFrames: 5,
        fadeOutFrames: 8,
      }),
    );
    // 写进去的仍然是同一条（不会被拆成多条特效）
    expect(writes[writes.length - 1].effects).toHaveLength(1);
    expect(cameraShakeConfigOf(writes[writes.length - 1].effects)).toMatchObject({
      durationFrames: 30,
      fadeInFrames: 5,
      fadeOutFrames: 8,
    });
  });

  it("参数输入到一半（空串）不写回记录", async () => {
    const writes = setupPanel([
      { type: EFFECT_TYPE_CAMERA_SHAKE, enabled: true, amplitude: 20 },
    ]);

    typeAmplitude("");

    await waitFor(() => expect(writes).toHaveLength(0));
    // 输入框保留用户正在敲的文本（不会被打回 12）
    expect(screen.getByLabelText("镜头摇动 幅度")).toHaveValue("");
  });

  it("参数超出范围时夹回边界（周期至少 1 帧）", async () => {
    const writes = setupPanel([{ type: EFFECT_TYPE_CAMERA_SHAKE, enabled: true }]);

    fireEvent.change(screen.getByLabelText("镜头摇动 周期"), {
      target: { value: "0" },
    });

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].effects[0].periodFrames).toBe(1);
  });
});

describe("摄像机预设 → 可扩展（面板不硬编码任何类型）", () => {
  /** 一个"未来才可能有"的预设：推镜冲击，带一个自定义参数 */
  const PUNCH_PRESET: CameraPresetDefinition = {
    type: "CAMERA_ZOOM_PUNCH",
    emoji: "🎯",
    label: "推镜冲击",
    description: "测试用的假预设：只在最后几帧猛推一下镜头。",
    params: [
      {
        key: "strength",
        label: "强度",
        min: 1,
        max: 10,
        defaultValue: 5,
        integer: true,
        hint: "推镜的力度",
      },
    ],
  };

  it("注册表里新增一条定义，面板就多一张卡片（开关 + 参数都能用）", async () => {
    const writes = setupPanel([], [PUNCH_PRESET]);

    // 只有这一条（假）预设：说明面板完全按注册表渲染
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(checkbox("推镜冲击")).not.toBeChecked();

    fireEvent.click(checkbox("推镜冲击"));
    await waitFor(() => expect(writes).toHaveLength(1));
    // 写回的就是这条假类型 —— 通用读写不认识具体类型
    expect(writes[0].effects).toEqual([
      { type: "CAMERA_ZOOM_PUNCH", enabled: true },
    ]);
    // 勾选后参数控件出现（缺省值 5）
    expect(screen.getByLabelText("推镜冲击 强度")).toHaveValue("5");
  });

  it("填了 group 的预设会归到小标题下，且不改变布局骨架", () => {
    setupPanel(
      [],
      [
        { ...PUNCH_PRESET, type: "A", label: "甲", group: "动态" },
        { ...PUNCH_PRESET, type: "B", label: "乙", group: "构图" },
        { ...PUNCH_PRESET, type: "C", label: "丙" },
      ],
    );

    expect(screen.getByText("动态")).toBeInTheDocument();
    expect(screen.getByText("构图")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });
});
