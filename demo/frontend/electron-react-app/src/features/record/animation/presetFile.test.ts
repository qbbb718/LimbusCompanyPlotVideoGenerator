/**
 * 预设资产数据层的单测。
 *
 * 锁四件事：
 * 1. 文件格式的**结构校验**要拦住坏数据（坏预设套进记录 = 一条静默失效的动画，最难查）；
 * 2. 套用必须是**深拷贝**（改套用后的 clip 不能反过来污染预设本身）；
 * 3. 参数占位符只做数字替换，解析不出来就删掉该参数（让后端用默认值，而不是拿 NaN 去算）；
 * 4. 反向导出要去掉 `sourcePresetId`（否则预设会自我引用）。
 */
import type { AnimationClip } from "./animationTypes";
import {
  PRESET_FILE_VERSION,
  applyPreset,
  clipsToPreset,
  newPresetId,
  parsePreset,
  serializePreset,
} from "./presetFile";
import type { PresetFile } from "./presetFile";

const baseClip: AnimationClip = {
  id: "c1",
  kind: "preset",
  preset: "shake",
  durationFrames: 90,
  loop: "loop",
  params: { amplitude: "${amplitude}", periodFrames: 2, style: "jitter" },
};

const preset: PresetFile = {
  version: PRESET_FILE_VERSION,
  id: "dev_horror_tremble",
  name: "惊悚发抖",
  author: "builtin",
  params: { amplitude: { default: 8, min: 0, max: 40, step: 1 } },
  clips: [baseClip],
};

describe("预设文件校验", () => {
  test("合法预设解析成功，缺省字段被补齐", () => {
    const result = parsePreset(serializePreset(preset));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preset.id).toBe("dev_horror_tremble");
    expect(result.preset.name).toBe("惊悚发抖");
    expect(result.preset.clips).toHaveLength(1);
    expect(result.preset.tags).toEqual([]);
  });

  test("结构性错误被拒绝，并给出人能看懂的原因", () => {
    expect(parsePreset("not json")).toMatchObject({ ok: false, reason: "不是合法的 JSON" });
    expect(parsePreset({ ...preset, id: "有中文的 id" })).toMatchObject({ ok: false });
    expect(parsePreset({ ...preset, id: "ok", name: "  " })).toMatchObject({
      ok: false,
      reason: "缺少名称",
    });
    expect(parsePreset({ ...preset, clips: [] })).toMatchObject({
      ok: false,
      reason: "至少要有一条 clip",
    });
    expect(
      parsePreset({ ...preset, clips: [{ ...baseClip, durationFrames: 0 }] }),
    ).toMatchObject({ ok: false });
    expect(parsePreset({ ...preset, clips: [{ ...baseClip, kind: "unknown" }] })).toMatchObject({
      ok: false,
    });
  });

  test("不认识的字段被忽略（向后兼容）", () => {
    const result = parsePreset({ ...preset, futureField: 123 });
    expect(result.ok).toBe(true);
  });
});

describe("套用预设", () => {
  test("参数占位符被替换成数字，来源标记写进 clip", () => {
    const clips = applyPreset(preset, { amplitude: 12 });
    expect(clips[0].params!.amplitude).toBe(12);
    // 非占位符参数原样保留
    expect(clips[0].params!.style).toBe("jitter");
    expect(clips[0].sourcePresetId).toBe("dev_horror_tremble");
    expect(clips[0].sourcePresetVersion).toBe(PRESET_FILE_VERSION);
  });

  test("没给 override 时用声明的默认值", () => {
    const clips = applyPreset(preset);
    expect(clips[0].params!.amplitude).toBe(8);
  });

  test("是深拷贝：改套用结果不会污染预设", () => {
    const clips = applyPreset(preset);
    clips[0].params!.periodFrames = 99;
    (clips[0] as any).loop = "once";
    expect(preset.clips[0].params!.periodFrames).toBe(2);
    expect(preset.clips[0].loop).toBe("loop");
    expect(preset.clips[0].sourcePresetId).toBeUndefined();
  });

  test("解析不出来的占位符 → 删掉该参数（不产生 NaN）", () => {
    const weird: PresetFile = {
      ...preset,
      clips: [{ ...baseClip, params: { amplitude: "${notDeclared}" } }],
    };
    const clips = applyPreset(weird);
    // 参数被整个删掉（而不是留一个 NaN 让后端算出一堆 NaN）
    expect(clips[0].params!.amplitude).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(clips[0].params, "amplitude")).toBe(false);
  });
});

describe("反向导出（存为我的预设）", () => {
  test("生成的预设合法、可再解析、且不带来源标记", () => {
    const inlined = applyPreset(preset, { amplitude: 15 });
    const exported = clipsToPreset("我的发抖", inlined);
    expect(exported.author).toBe("user");
    expect(exported.clips[0].sourcePresetId).toBeUndefined();
    expect(exported.clips[0].params!.amplitude).toBe(15);

    const roundTrip = parsePreset(serializePreset(exported));
    expect(roundTrip.ok).toBe(true);
  });

  test("中文名字会生成合法 id（非 ASCII 被过滤 + 时间戳兜底）", () => {
    const id = newPresetId("我的发抖");
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(newPresetId("Hello World!")).toMatch(/^hello-world-/);
  });
});
