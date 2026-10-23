/**
 * 立绘动画求值内核的**跨语言对拍**测试（前端侧）。
 *
 * 夹具 `demo/src/test/resources/animation-fixtures.json` 与后端
 * `SpriteAnimatorTest.java` 共用同一份真值：夹具由一份独立实现算出，不是从任一端的输出截的图。
 *
 * 于是三者形成闭环：
 * - 本测试绿 ⇒ 前端算法与夹具一致；
 * - 后端测试绿 ⇒ Java 算法与夹具一致；
 * - ⇒ 预览与成片逐帧一致（这是两条渲染路径唯一可机械化验证的一致性）。
 *
 * 任何一端改了公式而忘了更新夹具，那一端立刻红，不会静默漂移。
 */
import fs from "fs";
import path from "path";

import type { AnimationClip, SpriteAnimation } from "./animationTypes";
import { hash01 } from "./hash32";
import { PRESET_IDS } from "./presetRegistry";
import {
  anchorOf,
  durationEndFrameOf,
  envelope,
  evaluate,
  isAnimated,
  project,
} from "./spriteAnimator";

/* ==================== 夹具加载 ==================== */

/**
 * 夹具在仓库里的位置（`demo/src/test/resources`）。
 *
 * 两个候选路径：`process.cwd()` 是常规情况（jest 以 electron-react-app 为根目录运行），
 * `__dirname` 兜底（某些 IDE 直接跑单文件时 cwd 会变）。都找不到就明确报错，
 * 不要静默跳过——"跳过"等于这条最关键的测试形同不存在。
 */
const FIXTURE_CANDIDATES = [
  path.resolve(process.cwd(), "../../src/test/resources/animation-fixtures.json"),
  path.resolve(__dirname, "../../../../../../src/test/resources/animation-fixtures.json"),
];

function loadFixtures(): any {
  for (const candidate of FIXTURE_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    }
  }
  throw new Error(
    "找不到双端夹具 animation-fixtures.json，试过:\n" + FIXTURE_CANDIDATES.join("\n"),
  );
}

const FIXTURES = loadFixtures();

/** 夹具期望值保留 6 位小数，容差取 1e-6（覆盖舍入误差，又不放过真实偏差） */
const EPS = 1e-6;

function expectClose(label: string, expected: number, actual: number): void {
  if (!(Math.abs(expected - actual) <= EPS)) {
    throw new Error(`${label}: expect=${expected} actual=${actual}`);
  }
}

/* ==================== 夹具对拍 ==================== */

describe("双端夹具对拍", () => {
  test("抖动哈希与后端逐位一致", () => {
    expect(Array.isArray(FIXTURES.hash)).toBe(true);
    for (const item of FIXTURES.hash) {
      expectClose(
        `hash01(seed=${item.seed}, index=${item.index}, axis=${item.axis})`,
        item.expect,
        hash01(item.seed, item.index, item.axis),
      );
    }
  });

  test("全部用例的每个采样帧、五个通道都一致", () => {
    const failures: string[] = [];
    for (const testCase of FIXTURES.cases) {
      for (const frame of testCase.frames) {
        const actual = evaluate(testCase.anim as SpriteAnimation, frame.frame);
        const label = `${testCase.name} @frame ${frame.frame}`;
        try {
          expectClose(`${label} x`, frame.expect.x, actual.x);
          expectClose(`${label} y`, frame.expect.y, actual.y);
          expectClose(`${label} scale`, frame.expect.scale, actual.scale);
          expectClose(`${label} rotate`, frame.expect.rotate, actual.rotate);
          expectClose(`${label} alpha`, frame.expect.alpha, actual.alpha);
        } catch (error) {
          failures.push((error as Error).message);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

/* ==================== 语义约束 ==================== */

describe("预设的恒等性", () => {
  test("每条预设在第 0 帧都必须是恒等（否则一加动画就跳一下）", () => {
    for (const preset of PRESET_IDS) {
      const anim: SpriteAnimation = {
        version: 1,
        timebase: { unit: "frame", fps: 30 },
        clips: [
          {
            id: `p-${preset}`,
            kind: "preset",
            preset,
            durationFrames: 60,
            loop: "loop",
          },
        ],
      };
      const state = evaluate(anim, 0);
      expectClose(`${preset}.x`, 0, state.x);
      expectClose(`${preset}.y`, 0, state.y);
      expectClose(`${preset}.scale`, 1, state.scale);
      expectClose(`${preset}.rotate`, 0, state.rotate);
      expectClose(`${preset}.alpha`, 1, state.alpha);
    }
  });
});

describe("时间投影", () => {
  const makeClip = (patch: Partial<AnimationClip>): AnimationClip => ({
    id: "t",
    kind: "preset",
    preset: "pulse",
    durationFrames: 10,
    loop: "once",
    ...patch,
  });

  test("once 播完结束；onEnd=hold 停在最后一帧", () => {
    const clip = makeClip({});
    expect(project(clip, 9)).toBe(9);
    expect(project(clip, 10)).toBeNull();
    expect(project(makeClip({ onEnd: "hold" }), 25)).toBe(9);
  });

  test("startFrame 之前不生效，endFrame 之后截断", () => {
    const clip = makeClip({ durationFrames: 100, loop: "loop", startFrame: 10, endFrame: 50 });
    expect(project(clip, 9)).toBeNull();
    expect(project(clip, 10)).toBe(0);
    expect(project(clip, 49)).toBe(39);
    expect(project(clip, 50)).toBeNull();
  });

  test("loop 取模、pingpong 三角波、timeScale 缩放时间", () => {
    const loop = makeClip({ durationFrames: 50, loop: "loop" });
    expect(project(loop, 60)).toBe(10);
    expect(project(loop, 100)).toBe(0);

    const pingpong = makeClip({ durationFrames: 50, loop: "pingpong" });
    expect(project(pingpong, 60)).toBe(40);
    expect(project(pingpong, 100)).toBe(0);

    const fast = makeClip({ durationFrames: 50, loop: "once", timeScale: 2 });
    expect(project(fast, 5)).toBe(10);
    expect(project(fast, 25)).toBeNull();
  });

  test("时长无法播放时返回 null（时长 0 / 负数）", () => {
    expect(project(makeClip({ durationFrames: 0 }), 0)).toBeNull();
    expect(project(makeClip({ durationFrames: -5 }), 3)).toBeNull();
  });
});

describe("权重包络", () => {
  test("淡入淡出把贡献压到 0~1，且不越界", () => {
    const clip: AnimationClip = {
      id: "e",
      kind: "preset",
      preset: "pulse",
      durationFrames: 20,
      fadeInFrames: 4,
      fadeOutFrames: 4,
    };
    expect(envelope(clip, 0)).toBeCloseTo(0, 10);
    expect(envelope(clip, 2)).toBeCloseTo(0.5, 10);
    expect(envelope(clip, 10)).toBeCloseTo(1, 10);
    expect(envelope(clip, 18)).toBeCloseTo(0.5, 10);
    expect(envelope(clip, 20)).toBeCloseTo(0, 10);
    expect(envelope({ ...clip, fadeInFrames: 0, fadeOutFrames: 0 }, 0)).toBe(1);
  });
});

describe("通道合成", () => {
  const constantClip = (
    channel: "x" | "y" | "scale",
    value: number,
    patch: Partial<AnimationClip> = {},
  ): AnimationClip => {
    // 逐通道赋值而不是 { [channel]: value }：计算键会退化成索引签名，逃掉类型检查
    const v: Partial<{ x: number; y: number; scale: number }> = {};
    v[channel] = value;
    return {
      id: `k-${channel}-${value}`,
      kind: "keyframes",
      durationFrames: 20,
      loop: "hold",
      channels: [channel],
      keys: [{ f: 0, v }],
      ...patch,
    };
  };

  const wrap = (...clips: AnimationClip[]): SpriteAnimation => ({ version: 1, clips });

  test("加法合成与顺序无关", () => {
    expectClose("10+25", 35, evaluate(wrap(constantClip("x", 10), constantClip("x", 25)), 3).x);
    expectClose("25+10", 35, evaluate(wrap(constantClip("x", 25), constantClip("x", 10)), 3).x);
  });

  test("乘法合成是连乘（1.2 × 1.2 = 1.44）", () => {
    const clip = constantClip("scale", 1.2);
    expectClose("1.44", 1.44, evaluate(wrap(clip, clip), 0).scale);
  });

  test("replace 按 priority 覆盖，与数组顺序无关", () => {
    const low = constantClip("x", 10, { blend: "replace", priority: 0 });
    const high = constantClip("x", 90, { blend: "replace", priority: 5 });
    expectClose("low,high", 90, evaluate(wrap(low, high), 0).x);
    expectClose("high,low", 90, evaluate(wrap(high, low), 0).x);
  });
});

describe("降级行为", () => {
  test("空 / 禁用 / 未知预设 / 未知通道 一律恒等且不抛异常", () => {
    expect(evaluate(null, 0)).toEqual({ x: 0, y: 0, scale: 1, rotate: 0, alpha: 1 });
    expect(evaluate({ clips: [] }, 0).scale).toBe(1);

    const unknownPreset: SpriteAnimation = {
      clips: [{ id: "u", kind: "preset", preset: "no-such", durationFrames: 30 }],
    };
    expect(evaluate(unknownPreset, 5)).toEqual({ x: 0, y: 0, scale: 1, rotate: 0, alpha: 1 });
    expect(isAnimated(unknownPreset)).toBe(false);

    const disabled: SpriteAnimation = {
      clips: [{ id: "d", kind: "preset", preset: "bounce", durationFrames: 30, enabled: false }],
    };
    expect(evaluate(disabled, 5).y).toBe(0);
    expect(isAnimated(disabled)).toBe(false);
  });

  test("isAnimated 保守：无 clips / 时长 0 / 无有效通道都不算会动", () => {
    expect(isAnimated(undefined)).toBe(false);
    expect(isAnimated(null)).toBe(false);
    expect(isAnimated({ clips: [] })).toBe(false);
    expect(
      isAnimated({
        clips: [{ id: "z", kind: "preset", preset: "bounce", durationFrames: 0 }],
      }),
    ).toBe(false);
    expect(
      isAnimated({
        clips: [{ id: "ok", kind: "preset", preset: "bounce", durationFrames: 30 }],
      }),
    ).toBe(true);
  });
});

describe("锚点", () => {
  test("没配时用元素类型默认值，配了就用配的，非法值回落", () => {
    expect(anchorOf(normalize({ clips: [] }), 0.5, 1)).toEqual({ x: 0.5, y: 1 });
    expect(anchorOf(normalize({ clips: [], anchor: { x: 0.5, y: 0.2 } }), 0.5, 1).y).toBeCloseTo(0.2, 10);
    expect(anchorOf(normalize({ clips: [], anchor: { x: 0.5, y: NaN } }), 0.5, 1).y).toBe(1);
  });
});

describe("时长参与规则", () => {
  const base: AnimationClip = { id: "d", kind: "preset", preset: "bounce", durationFrames: 40 };

  test("once / hold 参与；无限循环不参与；显式 endFrame 不参与", () => {
    expect(durationEndFrameOf({ ...base, loop: "once", startFrame: 5 })).toBe(45);
    expect(durationEndFrameOf({ ...base, loop: "hold" })).toBe(40);
    expect(durationEndFrameOf({ ...base, loop: "loop" })).toBeNull();
    expect(durationEndFrameOf({ ...base, loop: "loop", iterations: 3 })).toBe(120);
    expect(durationEndFrameOf({ ...base, loop: "once", endFrame: 20 })).toBeNull();
    expect(durationEndFrameOf({ ...base, enabled: false })).toBeNull();
    expect(durationEndFrameOf({ ...base, durationFrames: 0 })).toBeNull();
  });
});

/** 让 TS 接受"部分字段"的测试数据，同时保持运行时是同一对象 */
function normalize(anim: Partial<SpriteAnimation>): SpriteAnimation {
  return { ...anim, clips: anim.clips ?? [] };
}
