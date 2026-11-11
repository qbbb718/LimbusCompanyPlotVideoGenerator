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
import { sceneLayerKey } from "./previewLayout";
import type { SceneLayerKind } from "./previewLayout";

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
 * @function 素材页签里的一张卡片 → 预览选中态
 *
 * <p>与 {@link selectionOfLayer} 是同一个形状，只是来源不同：那边来自"在预览里点中"，
 * 这边来自"在属性面板里点卡片"。key 必须用 {@link sceneLayerKey} 拼，
 * 否则预览热区层按 key 找不到这一层，选中框不会出现。
 *
 * @param kind  素材种类（只有世界图层：立绘 / 临时图片 / 背景）
 * @param index 在所属数组里的下标
 */
export const selectionOfVisual = (
  kind: SceneLayerKind,
  index: number,
): PreviewSelection => ({
  key: sceneLayerKey(kind, index),
  kind,
  index,
});

/** @function 是不是世界图层种类（立绘 / 临时图片 / 背景） */
export function isSceneLayerKind(
  kind: PreviewLayerKind,
): kind is SceneLayerKind {
  return kind === "background" || kind === "character" || kind === "tempImage";
}

/**
 * @function 删掉若干素材之后，预览选中态该变成什么
 *
 * <p>三种情况：
 * 1. 删的正是选中的那条 → 选中态清空（预览里已经没有这个元素了）；
 * 2. 删的是它**前面**的若干条 → 下标整体前移，key 必须跟着重算，
 *    否则选中框会指到"下一张"上；
 * 3. 其它情况 → 原样返回（同一个引用，避免无意义的重渲染）。
 *
 * @param kind      这次被删的素材种类
 * @param selection 当前预览选中态
 * @param removed   删掉的下标（可以乱序 / 重复 / 越界）
 * @returns 新的预览选中态；null = 选中项已被删除
 */
export function selectionAfterRemoval(
  kind: SceneLayerKind,
  selection: PreviewSelection | null,
  removed: number[],
): PreviewSelection | null {
  if (!selection || selection.kind !== kind || selection.index < 0) {
    return selection;
  }
  const removedIndexes = Array.from(
    new Set(removed.filter((index) => Number.isInteger(index) && index >= 0)),
  ).sort((a, b) => a - b);
  if (removedIndexes.length === 0) return selection;
  if (removedIndexes.includes(selection.index)) return null;

  const shift = removedIndexes.filter((index) => index < selection.index).length;
  if (shift === 0) return selection;
  return selectionOfVisual(kind, selection.index - shift);
}

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

/**
 * @function 在这个页签下点中元素要不要"切到它的页签"
 *
 * <p>通常要切（点立绘 → 滚到「立绘」页签并高亮那一张）。**「摄像机」页签例外**：
 * 那里的预览是**世界视图**（背景/立绘铺在可缩放画布上 + 一个取景框），它属于这个页签。
 * 切页签会把世界视图卸载掉——除了"看着构图改元素"这件事直接断掉，正在拖的手势也会
 * 中断在卸载的那一刻（`PreviewHitLayer` 再也收不到 pointerup）。
 *
 * <p>所以摄像机页签下点中元素只记选中态（画选中框、可继续拖动），
 * 要看/改它的属性由用户自己切到「立绘」「临时图片」「背景」页签。
 *
 * @param activeTab 当前页签
 * @returns true = 保持当前页签，不跳转
 */
export function keepsActiveTabOnSelect(activeTab: PropertyTab): boolean {
  return activeTab === "camera";
}
