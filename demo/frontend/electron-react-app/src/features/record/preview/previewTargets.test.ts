/**
 * 「预览点选 → 页签 + 面板定位」映射的单测。
 *
 * 这组规则一旦错了，用户点立绘会跳错页签（最典型的是点临时图片跳到「立绘」），
 * 所以把六种图层全部钉死在用例里。
 */
import {
  focusRequestForLayer,
  selectionOfLayer,
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
});
