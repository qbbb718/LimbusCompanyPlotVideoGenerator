/**
 * 背景层级（z-order）单测。
 *
 * <p>这里锁的是三条约定：
 * 1. **数组顺序就是层级**：上移 = 与前一项交换、下移 = 与后一项交换（列表最上 = 画面最前）；
 * 2. **不越界**：首项不能再上移、末项不能再下移，非法下标一律什么都不做；
 * 3. **不改入参**：返回新数组，背景自己的缩放 / 位置 / 压暗等字段原样带过去。
 *
 * <p>另外把"新背景默认追加到列表末尾（画面最底层）"也钉住 —— 这是需求里要求
 * "默认插入位置明确"的那一条，改它必须同时改用例与面板文案。
 */
import type { BackgroundVisual } from "@types";
import {
  canMoveBackgroundLayer,
  insertBackgroundLayer,
  moveBackgroundLayer,
} from "./backgroundLayers";

/** 造一个最小可用的背景视觉元素（只关心顺序时，其它字段用默认值） */
const background = (uuid: string): BackgroundVisual => ({
  background: { uuid, path: `/assets/backgrounds/${uuid}.png`, name: uuid },
  posX: 0,
  posY: 0,
  scale: 1,
  visible: true,
});

/** 把列表映射成 uuid 序列，断言顺序时比整对象数组更好读 */
const uuidsOf = (list: BackgroundVisual[]): string[] =>
  list.map((bg) => bg.background.uuid);

const list = () => [background("a"), background("b"), background("c")];

describe("背景层级：上移 / 下移", () => {
  test("上移 = 与前一项交换（列表越靠上，画面越靠前）", () => {
    expect(uuidsOf(moveBackgroundLayer(list(), 1, "up")!)).toEqual([
      "b",
      "a",
      "c",
    ]);
    // 末项也能一路挪到最前
    expect(uuidsOf(moveBackgroundLayer(list(), 2, "up")!)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  test("下移 = 与后一项交换", () => {
    expect(uuidsOf(moveBackgroundLayer(list(), 0, "down")!)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(uuidsOf(moveBackgroundLayer(list(), 1, "down")!)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  test("首项不能再上移、末项不能再下移：返回 null，不越界", () => {
    expect(moveBackgroundLayer(list(), 0, "up")).toBeNull();
    expect(moveBackgroundLayer(list(), 2, "down")).toBeNull();
  });

  test("下标非法 / 空列表什么都不做", () => {
    expect(moveBackgroundLayer([], 0, "down")).toBeNull();
    expect(moveBackgroundLayer(list(), -1, "up")).toBeNull();
    expect(moveBackgroundLayer(list(), 3, "down")).toBeNull();
    expect(moveBackgroundLayer(list(), 1.5, "down")).toBeNull();
  });

  test("不改原数组，也不丢背景自己的字段", () => {
    const original = list();
    original[1].scale = 2;
    original[1].posX = 300;
    original[1].dim = true;

    const moved = moveBackgroundLayer(original, 1, "up")!;

    expect(uuidsOf(original)).toEqual(["a", "b", "c"]);
    expect(uuidsOf(moved)).toEqual(["b", "a", "c"]);
    // 交换的是位置，不是内容：缩放 / 偏移 / 压暗跟着这张背景一起走
    expect(moved[0].scale).toBe(2);
    expect(moved[0].posX).toBe(300);
    expect(moved[0].dim).toBe(true);
    expect(moved[1].scale).toBe(1);
  });
});

describe("背景层级：上移 / 下移按钮的可用性", () => {
  test("首项只能下移、末项只能上移、中间项两个方向都能", () => {
    expect(canMoveBackgroundLayer(0, "up", 3)).toBe(false);
    expect(canMoveBackgroundLayer(0, "down", 3)).toBe(true);

    expect(canMoveBackgroundLayer(1, "up", 3)).toBe(true);
    expect(canMoveBackgroundLayer(1, "down", 3)).toBe(true);

    expect(canMoveBackgroundLayer(2, "up", 3)).toBe(true);
    expect(canMoveBackgroundLayer(2, "down", 3)).toBe(false);
  });

  test("只有一张背景时两个方向都不可用", () => {
    expect(canMoveBackgroundLayer(0, "up", 1)).toBe(false);
    expect(canMoveBackgroundLayer(0, "down", 1)).toBe(false);
  });

  test("空列表 / 非法下标都不可用（按钮不会亮着却点不动）", () => {
    expect(canMoveBackgroundLayer(0, "down", 0)).toBe(false);
    expect(canMoveBackgroundLayer(-1, "down", 3)).toBe(false);
    expect(canMoveBackgroundLayer(3, "up", 3)).toBe(false);
    expect(canMoveBackgroundLayer(0.5, "down", 3)).toBe(false);
  });

  test("可用性判断与移动结果一致（能挪 ⇔ 真的挪成功）", () => {
    const original = list();
    for (let index = 0; index < original.length; index += 1) {
      (["up", "down"] as const).forEach((direction) => {
        const allowed = canMoveBackgroundLayer(
          index,
          direction,
          original.length,
        );
        const moved = moveBackgroundLayer(original, index, direction);
        expect(moved !== null).toBe(allowed);
      });
    }
  });
});

describe("背景层级：新背景的默认插入位置", () => {
  test("追加到列表末尾 = 画面最底层，已有背景的相对顺序不变", () => {
    const added = insertBackgroundLayer(list(), background("d"));
    expect(uuidsOf(added)).toEqual(["a", "b", "c", "d"]);
  });

  test("空列表加第一张时它就是列表项（同时也是最前 / 最后）", () => {
    expect(uuidsOf(insertBackgroundLayer([], background("only")))).toEqual([
      "only",
    ]);
  });

  test("不改入参", () => {
    const original = list();
    insertBackgroundLayer(original, background("d"));
    expect(uuidsOf(original)).toEqual(["a", "b", "c"]);
  });
});
