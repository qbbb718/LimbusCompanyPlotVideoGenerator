/**
 * 「预览点选 → 页签 + 面板定位」映射的单测。
 *
 * 这组规则一旦错了，用户点立绘会跳错页签（最典型的是点临时图片跳到「立绘」），
 * 所以把六种图层全部钉死在用例里。
 */
import {
  focusRequestForLayer,
  isSceneLayerKind,
  keepsActiveTabOnSelect,
  selectionAfterRemoval,
  selectionOfLayer,
  selectionOfVisual,
  targetForLayerKind,
} from "./previewTargets";
import type { PreviewLayer } from "./previewLayout";

const makeLayer = (over: Partial<PreviewLayer> = {}): PreviewLayer => ({
  key: "dialogBox",
  kind: "dialogBox",
  index: -1,
  label: "对话框（含台词）",
  z: 300,
  space: "design",
  baseRect: { x: 264, y: 826, w: 1470, h: 254 },
  outRect: { x: 264, y: 826, w: 1470, h: 254 },
  ...over,
});

describe("预览点选 → 页签与定位目标", () => {
  test("背景 → 背景页签，定位到第 i 张背景", () => {
    expect(targetForLayerKind("background", 2)).toEqual({
      tab: "background",
      focus: { kind: "background", index: 2 },
    });
  });

  test("立绘 → 立绘页签", () => {
    expect(targetForLayerKind("character", 1)).toEqual({
      tab: "characters",
      focus: { kind: "characters", index: 1 },
    });
  });

  test("临时图片 → **临时图片**页签（不是立绘页签）", () => {
    expect(targetForLayerKind("tempImage", 0)).toEqual({
      tab: "tempImages",
      focus: { kind: "tempImages", index: 0 },
    });
  });

  test("对话框（含台词）→ 文本页签的「对话内容」", () => {
    expect(targetForLayerKind("dialogBox", -1)).toEqual({
      tab: "text",
      focus: { kind: "text", index: -1, field: "dialogue" },
    });
  });

  test("角色名片 → 文本页签的「说话人」", () => {
    expect(targetForLayerKind("namePlate", -1)).toEqual({
      tab: "text",
      focus: { kind: "text", index: -1, field: "speaker" },
    });
  });

  test("地点牌 → 文本页签的「场景」", () => {
    expect(targetForLayerKind("locationPlate", -1)).toEqual({
      tab: "text",
      focus: { kind: "text", index: -1, field: "location" },
    });
  });

  test("点中的图层 → 选中态（key/kind/index 原样带过去）", () => {
    const layer = makeLayer({ key: "character:3", kind: "character", index: 3 });
    expect(selectionOfLayer(layer)).toEqual({
      key: "character:3",
      kind: "character",
      index: 3,
    });
  });

  test("定位请求带 nonce：同一个元素连点两次也会重新滚动/闪烁", () => {
    const layer = makeLayer({ key: "character:0", kind: "character", index: 0 });
    const first = focusRequestForLayer(layer, 1)!;
    const second = focusRequestForLayer(layer, 2)!;
    expect(first.focus.nonce).toBe(1);
    expect(second.focus.nonce).toBe(2);
    expect(first.tab).toBe("characters");
    expect(second.focus).toEqual({ kind: "characters", index: 0, nonce: 2 });
  });

  test("「摄像机」页签下点中元素不切页签（世界视图就挂在这个页签上）", () => {
    // 切走会把世界视图卸载掉：正在拖的元素手势会断在半路（收不到 pointerup）
    expect(keepsActiveTabOnSelect("camera")).toBe(true);
    // 其它页签照旧：点了就跳过去（点立绘 → 立绘页签并高亮那一张）
    (["text", "characters", "tempImages", "background", "effects", "audio", "global"] as const)
      .forEach((tab) => expect(keepsActiveTabOnSelect(tab)).toBe(false));
  });
});

describe("属性面板点卡片 → 预览选中态", () => {
  test("卡片下标 → 与热区层同一个 key（sceneLayerKey）", () => {
    expect(selectionOfVisual("character", 2)).toEqual({
      key: "character:2",
      kind: "character",
      index: 2,
    });
    expect(selectionOfVisual("tempImage", 0).key).toBe("tempImage:0");
    expect(selectionOfVisual("background", 1).key).toBe("background:1");
  });

  test("只有立绘 / 临时图片 / 背景是世界图层（UI 图层不参与素材页签联动）", () => {
    expect(isSceneLayerKind("character")).toBe(true);
    expect(isSceneLayerKind("tempImage")).toBe(true);
    expect(isSceneLayerKind("background")).toBe(true);
    expect(isSceneLayerKind("dialogBox")).toBe(false);
    expect(isSceneLayerKind("namePlate")).toBe(false);
    expect(isSceneLayerKind("locationPlate")).toBe(false);
  });
});

describe("删除素材后同步预览选中态", () => {
  test("删掉的正是选中项 → 清空", () => {
    expect(
      selectionAfterRemoval("character", selectionOfVisual("character", 1), [1]),
    ).toBeNull();
  });

  test("删的是它前面的若干条 → 下标前移，key 重算", () => {
    expect(
      selectionAfterRemoval("character", selectionOfVisual("character", 3), [
        0, 2,
      ]),
    ).toEqual({ key: "character:1", kind: "character", index: 1 });
  });

  test("删的是它后面的 → 原样返回同一个引用（不触发无意义的重渲染）", () => {
    const current = selectionOfVisual("tempImage", 0);
    expect(selectionAfterRemoval("tempImage", current, [2, 5])).toBe(current);
  });

  test("种类不同 / 没有选中 / 空删除列表 → 原样返回", () => {
    const character = selectionOfVisual("character", 1);
    expect(selectionAfterRemoval("background", character, [1])).toBe(character);
    expect(selectionAfterRemoval("character", null, [0])).toBeNull();
    const background = selectionOfVisual("background", 0);
    expect(selectionAfterRemoval("background", background, [])).toBe(background);
  });

  test("删除列表里的重复 / 越界下标不影响前移量", () => {
    expect(
      selectionAfterRemoval("background", selectionOfVisual("background", 2), [
        0,
        0,
        -3,
        1.5,
        NaN,
      ]),
    ).toEqual({ key: "background:1", kind: "background", index: 1 });
  });
});
