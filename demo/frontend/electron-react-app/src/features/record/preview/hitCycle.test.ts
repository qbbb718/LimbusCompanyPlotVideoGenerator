/**
 * 「重叠区域循环下钻」的纯逻辑单测。
 *
 * 规则：命中集合相同 → 索引 +1 取模；集合变了 → 归零；空集合 → 清空。
 * 这组用例覆盖了"钻到底回顶层"和"换区域重新开始"两个最容易写错的分支。
 */
import { isSameHitSet, resolveCycledHit } from "./hitCycle";
import type { PreviewLayer } from "./previewLayout";

const makeLayer = (
  key: string,
  z: number,
  rect: { x: number; y: number; w: number; h: number },
): PreviewLayer => ({
  key,
  kind: key.startsWith("character") ? "character" : "background",
  index: Number(key.split(":")[1] ?? -1),
  label: key,
  z,
  space: "world",
  baseRect: rect,
  outRect: rect,
});

// 三层叠在 (800,400) 这一点上：A(z100) > B(z90) > BG(z10)
const BACKGROUND = makeLayer("background:0", 10, { x: 192, y: 108, w: 1536, h: 864 });
const CHAR_A = makeLayer("character:0", 100, { x: 600, y: 100, w: 400, h: 600 });
const CHAR_B = makeLayer("character:1", 90, { x: 700, y: 200, w: 400, h: 600 });
const LAYERS = [BACKGROUND, CHAR_B, CHAR_A];

/** 连点同一个坐标，返回每次命中的图层 key */
const clickTimes = (point: { x: number; y: number }, times: number): string[] => {
  let state = null as ReturnType<typeof resolveCycledHit>["state"];
  const picked: string[] = [];
  for (let i = 0; i < times; i++) {
    const result = resolveCycledHit(LAYERS, point, state);
    state = result.state;
    picked.push(result.layer ? result.layer.key : "(空白)");
  }
  return picked;
};

describe("重叠区域循环下钻", () => {
  test("首次点击重叠区域 → 选中最上层", () => {
    const { layer, state } = resolveCycledHit(LAYERS, { x: 800, y: 400 }, null);
    expect(layer?.key).toBe("character:0");
    expect(state).toEqual({ keys: ["character:0", "character:1", "background:0"], index: 0 });
  });

  test("同一重叠区域连续点击 → 逐层下钻，钻到底后回到顶层", () => {
    expect(clickTimes({ x: 800, y: 400 }, 7)).toEqual([
      "character:0",
      "character:1",
      "background:0",
      "character:0",
      "character:1",
      "background:0",
      "character:0",
    ]);
  });

  test("命中集合不同（只压住立绘 A 的位置）→ 从该区域最上层重新开始", () => {
    const first = resolveCycledHit(LAYERS, { x: 800, y: 400 }, null);
    // (620,500) 只命中 A 与背景，集合变了 → 索引归零
    const second = resolveCycledHit(LAYERS, { x: 620, y: 500 }, first.state);
    expect(second.layer?.key).toBe("character:0");
    expect(second.state).toEqual({ keys: ["character:0", "background:0"], index: 0 });
  });

  test("点非重叠区域 → 选它并重置循环状态（再回重叠区从最上层开始）", () => {
    let state = resolveCycledHit(LAYERS, { x: 800, y: 400 }, null).state; // A
    state = resolveCycledHit(LAYERS, { x: 800, y: 400 }, state).state; // B
    const single = resolveCycledHit(LAYERS, { x: 300, y: 900 }, state); // 只有背景
    expect(single.layer?.key).toBe("background:0");
    const back = resolveCycledHit(LAYERS, { x: 800, y: 400 }, single.state);
    expect(back.layer?.key).toBe("character:0");
  });

  test("点空白 → 无选中且清空循环状态", () => {
    const empty = resolveCycledHit(LAYERS, { x: 10, y: 10 }, null);
    expect(empty.layer).toBeNull();
    expect(empty.state).toBeNull();
  });

  test("空集合会丢弃上次的循环记忆（下一次一定从最上层开始）", () => {
    const first = resolveCycledHit(LAYERS, { x: 800, y: 400 }, null);
    const afterBlank = resolveCycledHit(LAYERS, { x: 10, y: 10 }, first.state);
    const next = resolveCycledHit(LAYERS, { x: 800, y: 400 }, afterBlank.state);
    expect(next.layer?.key).toBe("character:0");
  });

  test("同一位置但图层 z 序变了 → 视为不同命中集合，从新的最上层开始", () => {
    const reordered = [
      { ...CHAR_A, z: 90 },
      { ...CHAR_B, z: 100 },
    ];
    const first = resolveCycledHit(LAYERS, { x: 800, y: 400 }, null);
    const second = resolveCycledHit(reordered, { x: 800, y: 400 }, first.state);
    expect(second.layer?.key).toBe("character:1");
    expect(second.state?.index).toBe(0);
  });

  test("isSameHitSet 要求长度与顺序都一致", () => {
    expect(isSameHitSet(["a", "b"], ["a", "b"])).toBe(true);
    expect(isSameHitSet(["a", "b"], ["b", "a"])).toBe(false);
    expect(isSameHitSet(["a"], ["a", "b"])).toBe(false);
    expect(isSameHitSet([], [])).toBe(true);
  });
});
