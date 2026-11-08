/**
 * 情绪动画（序列帧）时序与几何内核的**跨语言对拍**测试（前端侧）。
 *
 * 夹具 `demo/src/test/resources/animation-fixtures.json` 的 `sequenceTiming` /
 * `emotionPlacement` 段与后端 `SequenceTimingTest.java` / `EmotionAnimPlacementTest.java`
 * 共用同一份真值：夹具由一份独立的手算结果写成，不是从任一端的输出截的图。
 *
 * 于是三者形成闭环：
 * - 本测试绿 ⇒ 前端算法与夹具一致；
 * - 后端测试绿 ⇒ Java 算法与夹具一致；
 * - ⇒ 编辑器预览与成片逐帧一致（这是两条渲染路径唯一可机械化验证的一致性）。
 */
import fs from "fs";
import path from "path";

import type { LoopMode } from "./animationTypes";
import {
  NO_FRAME,
  alphaAt,
  faceOffset,
  frameIndexAt,
  frameUrl,
  headSize,
  localFrame,
  localFrameOfImage,
  posterSample,
  sampleSequence,
  spriteRect,
  totalFrames,
} from "./sequenceTiming";

/* ==================== 夹具加载 ==================== */

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
  throw new Error("找不到双端夹具 animation-fixtures.json，试过:\n" + FIXTURE_CANDIDATES.join("\n"));
}

const FIXTURES = loadFixtures();
const EPS = 1e-6;

/* ==================== 夹具对拍 ==================== */

describe("sequenceTiming 与后端逐项一致", () => {
  test("夹具存在且非空", () => {
    expect(Array.isArray(FIXTURES.sequenceTiming)).toBe(true);
    expect(FIXTURES.sequenceTiming.length).toBeGreaterThan(0);
  });

  test("全部夹具用例：图片序号 / 局部帧号 / 透明度都一致", () => {
    const failures: string[] = [];
    for (const testCase of FIXTURES.sequenceTiming) {
      const sample = sampleSequence(
        testCase.frameHolds,
        testCase.loop as LoopMode,
        testCase.iterations ?? null,
        testCase.startFrame ?? 0,
        testCase.fadeInFrames ?? 0,
        testCase.fadeOutFrames ?? 0,
        testCase.opacity ?? 1,
        testCase.frame,
      );
      if (sample.imageIndex !== testCase.expect.imageIndex) {
        failures.push(
          `${testCase.name}: imageIndex expect=${testCase.expect.imageIndex} actual=${sample.imageIndex}`,
        );
      }
      if (sample.localFrame !== testCase.expect.localFrame) {
        failures.push(
          `${testCase.name}: localFrame expect=${testCase.expect.localFrame} actual=${sample.localFrame}`,
        );
      }
      if (Math.abs(sample.alpha - testCase.expect.alpha) > EPS) {
        failures.push(
          `${testCase.name}: alpha expect=${testCase.expect.alpha} actual=${sample.alpha}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("emotionPlacement 与后端逐项一致", () => {
  test("头部方框边长", () => {
    const failures: string[] = [];
    for (const testCase of FIXTURES.emotionPlacement.headSize) {
      const actual = headSize(testCase.length, testCase.renderScale);
      if (Math.abs(actual - testCase.expect) > EPS) {
        failures.push(`${testCase.name}: expect=${testCase.expect} actual=${actual}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("脸框中心偏移", () => {
    const failures: string[] = [];
    for (const testCase of FIXTURES.emotionPlacement.faceOffset) {
      const actual = faceOffset(testCase.face, testCase.length, testCase.renderScale);
      if (Math.abs(actual - testCase.expect) > EPS) {
        failures.push(`${testCase.name}: expect=${testCase.expect} actual=${actual}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("素材矩形", () => {
    const failures: string[] = [];
    for (const testCase of FIXTURES.emotionPlacement.spriteRect) {
      const rect = spriteRect(
        testCase.faceCenterX,
        testCase.faceCenterY,
        testCase.headSize,
        testCase.canvasWidth,
        testCase.canvasHeight,
        testCase.scale,
        testCase.userScale,
        testCase.offsetX,
        testCase.offsetY,
      );
      (
        [
          ["x", testCase.expect.x, rect.x],
          ["y", testCase.expect.y, rect.y],
          ["w", testCase.expect.w, rect.w],
          ["h", testCase.expect.h, rect.h],
        ] as const
      ).forEach(([field, expect, actual]) => {
        if (Math.abs(expect - actual) > EPS) {
          failures.push(`${testCase.name} ${field}: expect=${expect} actual=${actual}`);
        }
      });
    }
    expect(failures).toEqual([]);
  });
});

/* ==================== 独立的行为约束 ==================== */

describe("序列帧时序的边界行为", () => {
  test("总帧数 = 每帧持续帧数之和；非法值按 1 帧算", () => {
    expect(totalFrames([3, 1, 2])).toBe(6);
    expect(totalFrames([])).toBe(0);
    expect(totalFrames(null)).toBe(0);
    expect(totalFrames([0, -5, 2])).toBe(4);
  });

  test("空帧序列一律不画", () => {
    const sample = sampleSequence(null, "once", null, 0, 0, 0, 1, 0);
    expect(sample.imageIndex).toBe(NO_FRAME);
    expect(sample.alpha).toBe(0);
  });

  test("淡出以最后一帧为 0（与 clip 的 envelope 口径不同）", () => {
    expect(alphaAt([1, 1, 1, 1], 3, 0, 3, 1)).toBeCloseTo(0, 10);
    expect(alphaAt([1, 1, 1, 1], 2, 0, 3, 1)).toBeCloseTo(1 / 3, 10);
    expect(alphaAt([1, 1, 1, 1], 0, 0, 3, 1)).toBeCloseTo(1, 10);
  });

  test("淡入淡出帧数被收敛到 len-1：单帧序列不会永远不可见", () => {
    expect(alphaAt([1], 0, 5, 5, 1)).toBeCloseTo(1, 10);
  });

  test("loop / pingpong 强制忽略淡出（否则每轮接缝一淡一显）", () => {
    expect(sampleSequence([2, 2, 2], "loop", null, 0, 0, 4, 1, 4).alpha).toBeCloseTo(1, 10);
    expect(sampleSequence([2, 2, 2], "pingpong", null, 0, 0, 4, 1, 4).alpha).toBeCloseTo(1, 10);
    expect(sampleSequence([2, 2, 2], "once", null, 0, 0, 4, 1, 4).alpha).toBeLessThan(1);
  });

  test("素材中心永远跟着脸框中心走（与缩放无关，偏移单位是头宽）", () => {
    // 头宽 200，偏移 +0.05 头宽 / -0.04 头宽 → 场景里 (+10, -8)
    for (const scale of [0.1, 0.5, 1, 2.5]) {
      const rect = spriteRect(960, 221, 200, 600, 400, scale, 1.7, 0.05, -0.04);
      expect(rect.x + rect.w / 2).toBeCloseTo(970, 10);
      expect(rect.y + rect.h / 2).toBeCloseTo(213, 10);
    }
  });

  test("localFrame 与 frameIndexAt 组合等于 sampleSequence（组合语义自洽）", () => {
    const holds = [3, 1, 2];
    for (let frame = 0; frame < 20; frame += 1) {
      const local = localFrame(holds, "once", null, 0, frame);
      const viaParts = local === NO_FRAME ? NO_FRAME : frameIndexAt(holds, local);
      expect(sampleSequence(holds, "once", null, 0, 0, 0, 1, frame).imageIndex).toBe(viaParts);
    }
  });
});

describe("代表帧（静止画面）采样", () => {
  const holds = [2, 2, 2]; // 共 6 帧

  test("取的是第 posterFrame 个局部帧对应的图，而不是第 0 张", () => {
    expect(posterSample(holds, 0, "once", 0, 0, 1).imageIndex).toBe(0);
    expect(posterSample(holds, 3, "once", 0, 0, 1).imageIndex).toBe(1);
    expect(posterSample(holds, 5, "once", 0, 0, 1).imageIndex).toBe(2);
  });

  test("序号越界被夹到有效范围（指到不存在的帧等于什么都不画）", () => {
    expect(posterSample(holds, 99, "once", 0, 0, 1).localFrame).toBe(5);
    expect(posterSample(holds, -5, "once", 0, 0, 1).localFrame).toBe(0);
  });

  test("带上淡入淡出：淡入起点的代表帧 alpha 是 0（所以静止预览要能选代表帧）", () => {
    expect(posterSample(holds, 0, "once", 3, 0, 1).alpha).toBeCloseTo(0, 10);
    expect(posterSample(holds, 3, "once", 3, 0, 1).alpha).toBeCloseTo(1, 10);
  });

  test("loop / pingpong 下忽略淡出（与成片同一口径）", () => {
    expect(posterSample(holds, 5, "once", 0, 4, 1).alpha).toBeCloseTo(0, 10);
    expect(posterSample(holds, 5, "loop", 0, 4, 1).alpha).toBeCloseTo(1, 10);
  });

  test("空序列不画", () => {
    const sample = posterSample([], 0, "once", 0, 0, 1);
    expect(sample.imageIndex).toBe(NO_FRAME);
    expect(sample.alpha).toBe(0);
  });
});

describe("缩略图的图片序号 → 局部帧号", () => {
  test("每张停多帧时，图片序号不能当局部帧用", () => {
    const holds = [2, 3]; // 第 1 张占局部帧 0-1，第 2 张占 2-4
    expect(localFrameOfImage(holds, 0)).toBe(0);
    expect(localFrameOfImage(holds, 1)).toBe(2);
    // 反例：直接把图片序号 1 当局部帧传进去，落回的还是第 1 张图
    expect(frameIndexAt(holds, 1)).toBe(0);
    expect(frameIndexAt(holds, localFrameOfImage(holds, 1))).toBe(1);
  });

  test("越界序号夹到首尾，不会指到不存在的帧", () => {
    const holds = [1, 4, 2];
    expect(localFrameOfImage(holds, -3)).toBe(0);
    expect(localFrameOfImage(holds, 99)).toBe(5); // 最后一张的首帧局部帧号
    expect(localFrameOfImage(holds, 99)).toBeLessThanOrEqual(totalFrames(holds) - 1);
  });

  test("空序列不给帧号", () => {
    expect(localFrameOfImage([], 0)).toBe(NO_FRAME);
    expect(localFrameOfImage(null, 0)).toBe(NO_FRAME);
  });

  test("与 posterSample 组合：挑第几张就画第几张（每张停多帧也成立）", () => {
    const holds = [3, 1, 4];
    for (let image = 0; image < holds.length; image += 1) {
      const sample = posterSample(holds, localFrameOfImage(holds, image), "once", 0, 0, 1);
      expect(sample.imageIndex).toBe(image);
    }
  });
});

describe("素材帧地址", () => {
  test("文件名从 1 开始、补零到 4 位（与后端 %04d.png 一致）", () => {
    expect(frameUrl("flow_abc", 0)).toBe("/assets/animation-clips/flow_abc/frames/0001.png");
    expect(frameUrl("flow_abc", 9)).toBe("/assets/animation-clips/flow_abc/frames/0010.png");
    expect(frameUrl("flow_abc", 239)).toBe("/assets/animation-clips/flow_abc/frames/0240.png");
  });
});
