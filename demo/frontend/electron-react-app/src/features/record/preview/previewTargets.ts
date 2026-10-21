/**
 * @module 预览选中 → 属性面板定位
 *
 * 预览舞台里点中一个元素之后，要回答两个问题：
 * 1. **切到哪个页签**（`PropertyTab`）；
 * 2. **滚到面板里的哪一块并闪一下**（`PropertyFocusRequest`）。
 *
 * 这里把「元素种类 → 页签 + 定位目标」的映射做成纯函数，一是方便单测覆盖全部组合，
 * 二是避免这套规则散落在 RecordPreview / RecordEditor 两处。
 *
 * @see PreviewHitLayer 负责在预览图上铺出可点击的热区
 * @see useFocusFlash 负责滚动 + 闪烁
 */
import type { PropertyTab } from "../useProjectWorkspace";
import type { PreviewLayer, PreviewLayerKind } from "./previewLayout";

/** 属性面板里需要"滚过去 + 闪一下"的目标类型（= 页签 key，text 用字段区分） */
export type PropertyFocusKind =
  | "text"
  | "characters"
  | "tempImages"
  | "background";

/** 「文本」页签里的具体字段：说话人 / 场景 / 对话内容 */
export type TextFocusField = "speaker" | "location" | "dialogue";

/** 预览里当前选中的元素（由 RecordEditor 持有） */
export interface PreviewSelection {
  /** 图层 key（`character:0` / `dialogBox` …），用于画选中框 */
  key: string;
  kind: PreviewLayerKind;
  /** 同类数组下标；UI 图层为 -1 */
  index: number;
}

/**
 * 一次「定位到属性」的请求。
 *
 * <p>`nonce` 每次点选都会变：同一个元素连点两次也要重新滚动/闪烁，
 * 否则 effect 依赖没变化、看起来像"点了没反应"。
 */
export interface PropertyFocusRequest {
  kind: PropertyFocusKind;
  /** 列表类目标的数组下标；文本页签固定 -1 */
  index: number;
  /** 仅「文本」页签使用 */
  field?: TextFocusField;
  /** 每次请求自增的标记（用时间戳即可） */
  nonce: number;
}

/** 点中的图层 → 选中态（RecordEditor 用它画选中框、并在面板里定位） */
export const selectionOfLayer = (layer: PreviewLayer): PreviewSelection => ({
  key: layer.key,
  kind: layer.kind,
  index: layer.index,
});

/**
 * 元素种类 → 页签 + 定位目标。
 *
 * <p>注意「临时图片」是**独立页签**（2026-10 起从「立绘」里拆出来），
 * 所以临时图片必须落到 `tempImages` 而不是 `characters`。
 *
 * @param kind   图层种类
 * @param index  图层在所属数组里的下标（UI 图层传 -1）
 * @returns 页签与定位目标；`null` 表示该类图层不参与交互
 */
export function targetForLayerKind(
  kind: PreviewLayerKind,
  index: number,
): { tab: PropertyTab; focus: Omit<PropertyFocusRequest, "nonce"> } | null {
  switch (kind) {
    case "background":
      return { tab: "background", focus: { kind: "background", index } };
    case "character":
      return { tab: "characters", focus: { kind: "characters", index } };
    case "tempImage":
      return { tab: "tempImages", focus: { kind: "tempImages", index } };
    // 台词不单独成框，点对话框 == 点台词 → 定位到「对话内容」输入框
    case "dialogBox":
      return { tab: "text", focus: { kind: "text", index: -1, field: "dialogue" } };
    // 角色名片承载的是说话人信息 → 定位到「说话人」下拉
    case "namePlate":
      return { tab: "text", focus: { kind: "text", index: -1, field: "speaker" } };
    // 地点牌 → 定位到「场景」
    case "locationPlate":
      return { tab: "text", focus: { kind: "text", index: -1, field: "location" } };
    default:
      return null;
  }
}

/** 点中图层 → 一次完整的定位请求（带 nonce） */
export function focusRequestForLayer(
  layer: PreviewLayer,
  nonce: number,
): { tab: PropertyTab; focus: PropertyFocusRequest } | null {
  const target = targetForLayerKind(layer.kind, layer.index);
  if (!target) return null;
  return { tab: target.tab, focus: { ...target.focus, nonce } };
}
