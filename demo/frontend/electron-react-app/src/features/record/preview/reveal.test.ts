import {
  REVEAL_MIN_VISIBLE_RATIO,
  intersectionArea,
  shouldRevealInWorld,
  visibleRatioOf,
} from "./reveal";
import type { PreviewRect } from "./previewLayout";

/**
 * 预览可见性判断（素材页签点卡片 → 要不要切世界视图）：
 * 画面里看得到就留在成片，只剩一条边/完全在外才切世界视图。
 */

const frame = { width: 640, height: 360 };
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): PreviewRect => ({ x, y, w, h });

describe("intersectionArea", () => {
  test("重叠 / 相切 / 完全分离", () => {
    expect(intersectionArea(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(25);
    // 只贴边：交集高度为 0
    expect(intersectionArea(rect(0, 0, 10, 10), rect(0, 10, 10, 10))).toBe(0);
    expect(intersectionArea(rect(-50, -50, 10, 10), rect(0, 0, 10, 10))).toBe(
      0,
    );
  });
});

describe("visibleRatioOf", () => {
  test("整个在画面里 = 1，完全在外 = 0", () => {
    expect(visibleRatioOf(rect(100, 100, 200, 100), frame)).toBe(1);
    expect(visibleRatioOf(rect(-500, 100, 200, 100), frame)).toBe(0);
    expect(visibleRatioOf(rect(100, -500, 200, 100), frame)).toBe(0);
  });

  test("半张露在左边界外 = 0.5", () => {
    expect(visibleRatioOf(rect(-100, 100, 200, 100), frame)).toBeCloseTo(0.5);
  });

  test("矩形无效（宽高非正）按看不见处理", () => {
    expect(visibleRatioOf(rect(100, 100, 0, 100), frame)).toBe(0);
    expect(visibleRatioOf(rect(100, 100, 100, 0), frame)).toBe(0);
  });
});

describe("shouldRevealInWorld", () => {
  test("露得够多 → 留在成片；只剩一点点 → 切世界视图", () => {
    // 一半在画面外：仍然算看得见
    expect(shouldRevealInWorld(rect(-100, 100, 200, 100), frame)).toBe(false);
    // 只露出 5%：低于 8% 的门槛
    expect(visibleRatioOf(rect(-190, 100, 200, 100), frame)).toBeCloseTo(0.05);
    expect(shouldRevealInWorld(rect(-190, 100, 200, 100), frame)).toBe(true);
    // 完全在外
    expect(shouldRevealInWorld(rect(-900, 100, 200, 100), frame)).toBe(true);
  });

  test("门槛可以按需覆盖（便于别的调用方复用）", () => {
    const half = rect(-100, 100, 200, 100);
    expect(shouldRevealInWorld(half, frame, 0.4)).toBe(false);
    expect(shouldRevealInWorld(half, frame, 0.6)).toBe(true);
    expect(REVEAL_MIN_VISIBLE_RATIO).toBe(0.08);
  });
});
