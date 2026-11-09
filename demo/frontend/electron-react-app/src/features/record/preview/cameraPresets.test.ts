/**
 * 摄像机预设注册表 + 数据读写。
 *
 * 这一层是「摄像机 → 预设」与 `record.effects` 之间**唯一**的通道，所以三条底线都在这里钉住：
 * 1. 注册表里的缺省值必须与后端 `CameraShake` / 前端 `cameraShake.ts` 一致；
 * 2. 勾选写回的条目形状必须与**迁移前的「特效」页签逐字节一致**（`{type, enabled:true}`），
 *    旧工程才不需要迁移、导出也才会继续生效；
 * 3. 通用函数不认识任何具体类型 —— 换一个假类型照样能用（新增预设不用改它们）。
 */
import {
  CAMERA_PRESETS,
  CAMERA_SHAKE_PRESET,
  groupPresets,
  isPresetEnabled,
  presetEntryOf,
  presetParamValue,
  togglePresetEffect,
  withPresetParam,
} from "./cameraPresets";
import { matchesEffectType } from "./effectType";
import {
  DEFAULT_CAMERA_SHAKE_AMPLITUDE,
  DEFAULT_CAMERA_SHAKE_DURATION_FRAMES,
  DEFAULT_CAMERA_SHAKE_FADE_IN_FRAMES,
  DEFAULT_CAMERA_SHAKE_FADE_OUT_FRAMES,
  DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
  cameraShakeConfigOf,
} from "./cameraShake";
import { EFFECT_TYPE_CAMERA_SHAKE } from "@types";
import type { EffectVisual } from "@types";

const effects = (...items: EffectVisual[]): EffectVisual[] => items;

describe("预设注册表", () => {
  test("镜头摇动已注册，标识与后端 EffectVisual.TYPE_CAMERA_SHAKE 一致", () => {
    expect(EFFECT_TYPE_CAMERA_SHAKE).toBe("CAMERA_SHAKE");
    expect(CAMERA_SHAKE_PRESET.type).toBe("CAMERA_SHAKE");
    expect(CAMERA_PRESETS).toContain(CAMERA_SHAKE_PRESET);
    expect(CAMERA_SHAKE_PRESET.label).toBe("镜头摇动");
  });

  test("参数缺省值与 cameraShake 的缺省值（= 后端 CameraShake）一致", () => {
    const byKey = Object.fromEntries(
      CAMERA_SHAKE_PRESET.params.map((param) => [param.key, param]),
    );
    expect(byKey.amplitude.defaultValue).toBe(DEFAULT_CAMERA_SHAKE_AMPLITUDE);
    expect(byKey.periodFrames.defaultValue).toBe(DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES);
    // 三个时间参数缺省 0 = 整条记录 / 不渐入 / 不渐出（= 加它们之前的行为）
    expect(byKey.durationFrames.defaultValue).toBe(DEFAULT_CAMERA_SHAKE_DURATION_FRAMES);
    expect(byKey.fadeInFrames.defaultValue).toBe(DEFAULT_CAMERA_SHAKE_FADE_IN_FRAMES);
    expect(byKey.fadeOutFrames.defaultValue).toBe(DEFAULT_CAMERA_SHAKE_FADE_OUT_FRAMES);
  });

  test("注册表自洽：类型唯一、参数键唯一、缺省值落在范围内", () => {
    const types = CAMERA_PRESETS.map((preset) => preset.type);
    expect(new Set(types).size).toBe(types.length);

    CAMERA_PRESETS.forEach((preset) => {
      expect(preset.type).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.description).toBeTruthy();
      const keys = preset.params.map((param) => param.key);
      expect(new Set(keys).size).toBe(keys.length);
      preset.params.forEach((param) => {
        expect(param.defaultValue).toBeGreaterThanOrEqual(param.min);
        expect(param.defaultValue).toBeLessThanOrEqual(param.max);
        // 整型参数（帧数）的缺省值也必须是整数（没有条件判断，避免 lint 的 conditional-expect）
        expect(!param.integer || Number.isInteger(param.defaultValue)).toBe(true);
      });
    });
  });

  test("类型比较与后端一致：忽略大小写", () => {
    expect(matchesEffectType("CAMERA_SHAKE", "CAMERA_SHAKE")).toBe(true);
    expect(matchesEffectType("camera_shake", "CAMERA_SHAKE")).toBe(true);
    expect(matchesEffectType("CROSS_DISSOLVE", "CAMERA_SHAKE")).toBe(false);
    expect(matchesEffectType(undefined, "CAMERA_SHAKE")).toBe(false);
    expect(matchesEffectType("CAMERA_SHAKE", "")).toBe(false);
  });
});

describe("旧数据兼容（迁移前写在 effects 里的条目）", () => {
  test("`{type:'CAMERA_SHAKE'}`（enabled 缺省）算已启用", () => {
    const legacy = effects({ type: "CAMERA_SHAKE" });
    expect(presetEntryOf(legacy, EFFECT_TYPE_CAMERA_SHAKE)).toEqual({ type: "CAMERA_SHAKE" });
    expect(isPresetEnabled(legacy, EFFECT_TYPE_CAMERA_SHAKE)).toBe(true);
  });

  test("旧数据在运行时照样摇晃（数据位置没动）", () => {
    expect(cameraShakeConfigOf(effects({ type: "CAMERA_SHAKE" }))).toEqual({
      amplitude: DEFAULT_CAMERA_SHAKE_AMPLITUDE,
      periodFrames: DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
      durationFrames: DEFAULT_CAMERA_SHAKE_DURATION_FRAMES,
      fadeInFrames: DEFAULT_CAMERA_SHAKE_FADE_IN_FRAMES,
      fadeOutFrames: DEFAULT_CAMERA_SHAKE_FADE_OUT_FRAMES,
    });
    expect(
      cameraShakeConfigOf(effects({ type: "CAMERA_SHAKE", amplitude: 8, periodFrames: 4 })),
    ).toMatchObject({ amplitude: 8, periodFrames: 4 });
  });

  test("大小写不同的老标识也认（后端 equalsIgnoreCase 的同一套规则）", () => {
    const legacy = effects({ type: "camera_shake" } as EffectVisual);
    expect(isPresetEnabled(legacy, EFFECT_TYPE_CAMERA_SHAKE)).toBe(true);
    expect(cameraShakeConfigOf(legacy)).not.toBeNull();
  });

  test("enabled:false 的条目按未启用显示，运行时也不摇", () => {
    const disabled = effects({ type: "CAMERA_SHAKE", enabled: false });
    expect(isPresetEnabled(disabled, EFFECT_TYPE_CAMERA_SHAKE)).toBe(false);
    expect(cameraShakeConfigOf(disabled)).toBeNull();
  });

  test("没有这一条 / 空列表都算未启用", () => {
    expect(isPresetEnabled([], EFFECT_TYPE_CAMERA_SHAKE)).toBe(false);
    expect(isPresetEnabled(undefined, EFFECT_TYPE_CAMERA_SHAKE)).toBe(false);
    expect(presetEntryOf([{ type: "FADE_FROM_BLACK" }], EFFECT_TYPE_CAMERA_SHAKE)).toBeUndefined();
  });
});

describe("勾选 / 取消", () => {
  test("勾选写回的条目与迁移前的「特效」页签完全一致（不带参数）", () => {
    const next = togglePresetEffect([], EFFECT_TYPE_CAMERA_SHAKE, true);
    expect(next).toEqual([{ type: "CAMERA_SHAKE", enabled: true }]);
    // 写进去之后运行时立刻生效（时间参数缺省 = 整条记录 / 不渐入 / 不渐出）
    expect(cameraShakeConfigOf(next)).toEqual({
      amplitude: DEFAULT_CAMERA_SHAKE_AMPLITUDE,
      periodFrames: DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES,
      durationFrames: DEFAULT_CAMERA_SHAKE_DURATION_FRAMES,
      fadeInFrames: DEFAULT_CAMERA_SHAKE_FADE_IN_FRAMES,
      fadeOutFrames: DEFAULT_CAMERA_SHAKE_FADE_OUT_FRAMES,
    });
  });

  test("勾选保留其它特效（转场 / 以后新增的类型）", () => {
    const next = togglePresetEffect(
      effects({ type: "CROSS_DISSOLVE" }, { type: "SOME_FUTURE_EFFECT" }),
      EFFECT_TYPE_CAMERA_SHAKE,
      true,
    );
    expect(next).toEqual([
      { type: "CROSS_DISSOLVE" },
      { type: "SOME_FUTURE_EFFECT" },
      { type: "CAMERA_SHAKE", enabled: true },
    ]);
  });

  test("取消只删自己，其它特效原样保留", () => {
    const next = togglePresetEffect(
      effects({ type: "CAMERA_SHAKE", enabled: true }, { type: "FADE_FROM_BLACK" }),
      EFFECT_TYPE_CAMERA_SHAKE,
      false,
    );
    expect(next).toEqual([{ type: "FADE_FROM_BLACK" }]);
  });

  test("已经启用再勾一次：不制造新数组（避免多余的撤销步骤）", () => {
    const current = effects({ type: "CAMERA_SHAKE", enabled: true });
    expect(togglePresetEffect(current, EFFECT_TYPE_CAMERA_SHAKE, true)).toBe(current);
  });

  test("停用过的条目再勾上：保留已调好的参数，只打开开关", () => {
    const next = togglePresetEffect(
      effects({ type: "CAMERA_SHAKE", enabled: false, amplitude: 9, periodFrames: 3 }),
      EFFECT_TYPE_CAMERA_SHAKE,
      true,
    );
    expect(next).toEqual([
      { type: "CAMERA_SHAKE", enabled: true, amplitude: 9, periodFrames: 3 },
    ]);
  });
});

describe("参数读写", () => {
  test("写在匹配的那一条上，其它特效与其它字段不动", () => {
    const current = effects(
      { type: "CROSS_DISSOLVE" },
      { type: "CAMERA_SHAKE", enabled: true, periodFrames: 4 },
    );
    const next = withPresetParam(current, EFFECT_TYPE_CAMERA_SHAKE, "amplitude", 20);

    expect(next).toEqual([
      { type: "CROSS_DISSOLVE" },
      { type: "CAMERA_SHAKE", enabled: true, periodFrames: 4, amplitude: 20 },
    ]);
    // 参数真的传到了运行时
    expect(cameraShakeConfigOf(next)).toMatchObject({ amplitude: 20, periodFrames: 4 });
    // 不改入参
    expect(current[1]).toEqual({ type: "CAMERA_SHAKE", enabled: true, periodFrames: 4 });
  });

  test("没有这一条时原样返回（不会凭空创建）", () => {
    const current = effects({ type: "CROSS_DISSOLVE" });
    expect(withPresetParam(current, EFFECT_TYPE_CAMERA_SHAKE, "amplitude", 20)).toBe(current);
    expect(withPresetParam([], EFFECT_TYPE_CAMERA_SHAKE, "amplitude", 20)).toEqual([]);
  });

  test("值没变化时返回原数组", () => {
    const current = effects({ type: "CAMERA_SHAKE", enabled: true, amplitude: 20 });
    expect(withPresetParam(current, EFFECT_TYPE_CAMERA_SHAKE, "amplitude", 20)).toBe(current);
  });

  test("面板显示值：缺失 / 非数字 / <= 0 一律回落缺省", () => {
    const amplitude = CAMERA_SHAKE_PRESET.params[0];
    expect(presetParamValue(undefined, amplitude)).toBe(DEFAULT_CAMERA_SHAKE_AMPLITUDE);
    expect(presetParamValue({ type: "CAMERA_SHAKE" }, amplitude)).toBe(
      DEFAULT_CAMERA_SHAKE_AMPLITUDE,
    );
    expect(presetParamValue({ type: "CAMERA_SHAKE", amplitude: 0 }, amplitude)).toBe(
      DEFAULT_CAMERA_SHAKE_AMPLITUDE,
    );
    expect(presetParamValue({ type: "CAMERA_SHAKE", amplitude: -5 }, amplitude)).toBe(
      DEFAULT_CAMERA_SHAKE_AMPLITUDE,
    );
    expect(
      presetParamValue(
        { type: "CAMERA_SHAKE", amplitude: "8" } as unknown as EffectVisual,
        amplitude,
      ),
    ).toBe(DEFAULT_CAMERA_SHAKE_AMPLITUDE);
    expect(presetParamValue({ type: "CAMERA_SHAKE", amplitude: 8 }, amplitude)).toBe(8);
  });

  test("0 是合法值的参数（持续 / 渐入 / 渐出）不会被打回缺省", () => {
    const duration = CAMERA_SHAKE_PRESET.params.find((param) => param.key === "durationFrames")!;
    const fadeIn = CAMERA_SHAKE_PRESET.params.find((param) => param.key === "fadeInFrames")!;

    // 0 = 整条记录 / 不渐入，必须原样显示
    expect(presetParamValue({ type: "CAMERA_SHAKE", durationFrames: 0 }, duration)).toBe(0);
    expect(presetParamValue({ type: "CAMERA_SHAKE", fadeInFrames: 0 }, fadeIn)).toBe(0);
    // 低于下限（负数）才回落缺省；超过上限按上限显示
    expect(presetParamValue({ type: "CAMERA_SHAKE", durationFrames: -5 }, duration)).toBe(0);
    expect(presetParamValue({ type: "CAMERA_SHAKE", durationFrames: 9999 }, duration)).toBe(
      duration.max,
    );
  });

  test("时间参数写回同一条（持续 / 渐入 / 渐出）", () => {
    const current = effects({ type: "CAMERA_SHAKE", enabled: true });
    const withTiming = withPresetParam(
      withPresetParam(
        withPresetParam(current, EFFECT_TYPE_CAMERA_SHAKE, "durationFrames", 30),
        EFFECT_TYPE_CAMERA_SHAKE,
        "fadeInFrames",
        5,
      ),
      EFFECT_TYPE_CAMERA_SHAKE,
      "fadeOutFrames",
      5,
    );

    expect(withTiming[0]).toMatchObject({
      durationFrames: 30,
      fadeInFrames: 5,
      fadeOutFrames: 5,
    });
    expect(cameraShakeConfigOf(withTiming)).toMatchObject({
      durationFrames: 30,
      fadeInFrames: 5,
      fadeOutFrames: 5,
    });
  });
});

describe("分组（新增预设类型时布局不用改）", () => {
  const makePreset = (type: string, group?: string) => ({
    type,
    emoji: "🎯",
    label: type,
    description: "",
    group,
    params: [],
  });

  test("没填 group 时平铺成一组", () => {
    const groups = groupPresets([makePreset("A"), makePreset("B")]);
    expect(groups).toEqual([{ group: undefined, presets: [makePreset("A"), makePreset("B")] }]);
  });

  test("相邻同名分组合并，不同分组分开，顺序保持注册顺序", () => {
    const groups = groupPresets([
      makePreset("A", "动态"),
      makePreset("B", "动态"),
      makePreset("C", "构图"),
      makePreset("D"),
    ]);
    expect(groups.map((group) => group.group)).toEqual(["动态", "构图", undefined]);
    expect(groups[0].presets.map((preset) => preset.type)).toEqual(["A", "B"]);
    expect(groups[1].presets.map((preset) => preset.type)).toEqual(["C"]);
    expect(groups[2].presets.map((preset) => preset.type)).toEqual(["D"]);
  });
});
