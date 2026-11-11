/**
 * @module 记录级特效的清单与读写（「剧情编辑 → 特效」页签与批量编辑共用）
 *
 * <p>记录里的特效只有一份数据：`record.effects` 数组。这个模块只做三件事，避免两个入口
 * （单条面板 / 批量编辑）各写一套判断而慢慢跑偏：
 * <ol>
 *   <li><b>清单</b>：{@link TRANSITION_OPTIONS}（三种起始转场，互斥）与
 *       {@link FILTER_OPTIONS}（画面滤镜，与转场不互斥）。面板上显示什么、按什么顺序，
 *       以这里为准；</li>
 *   <li><b>读</b>：{@link isEffectEnabled} / {@link activeTransitionType} /
 *       {@link effectTriState}（选中多条记录时的"全勾 / 全不勾 / 不一致"）；</li>
 *   <li><b>写</b>：{@link setEffectEnabled} / {@link setTransition} / {@link removeEffectType}，
 *       全部是**纯函数**：不改入参，没变化时**返回原数组**（调用方据此判断"这次什么都没改"，
 *       不会白白往撤销栈里压一步空操作）。</li>
 * </ol>
 *
 * <p>数据形状与后端 {@code EffectVisual} 一致：只开关的特效写成 `{ type, enabled: true }`，
 * 取消勾选 = 把这一条删掉（不是写 `enabled: false`）；比较类型时**忽略大小写**
 * （见 {@link module:preview/effectType}，后端 `EffectVisual.isEnabledType` 也是这么比的）。
 */
import type { EffectVisual, Record } from "@types";
import {
  EFFECT_TYPE_CROSS_DISSOLVE,
  EFFECT_TYPE_FADE_FROM_BLACK,
  EFFECT_TYPE_FADE_FROM_WHITE,
  EFFECT_TYPE_T_CORP_FILTER,
} from "@types";
import { matchesEffectType } from "./preview/effectType";

/**
 * @model 面板上的一条特效选项
 *
 * <p>`description` 是"叠加的是什么、看起来是什么效果"，直接显示在选项下方：
 * 特效在预览图里看不出来（起始转场只影响成片开头几帧），说明文字是用户唯一的依据。
 */
export interface EffectOption {
  /** 特效类型，与后端 EffectVisual.TYPE_* 一致 */
  type: string;
  /** 面板上的名称 */
  name: string;
  /** 叠加的是什么、看起来是什么效果 */
  description: string;
}

/**
 * 三种起始转场：叠的内容不同，淡出规则完全一样（见 START_TRANSITION_FRAMES）。
 * 顺序即优先级，与后端 StartTransition.kindOf 保持一致。
 */
export const TRANSITION_OPTIONS: readonly EffectOption[] = [
  {
    type: EFFECT_TYPE_CROSS_DISSOLVE,
    name: "交叉溶解转场",
    description: "叠加「上一条记录的最后一帧」，把硬切变成叠化。",
  },
  {
    type: EFFECT_TYPE_FADE_FROM_BLACK,
    name: "黑屏转场",
    description: "整屏叠一层纯黑，即从黑屏淡入。",
  },
  {
    type: EFFECT_TYPE_FADE_FROM_WHITE,
    name: "白屏转场",
    description: "整屏叠一层纯白，即从白屏淡入。",
  },
];

/**
 * 画面滤镜：整幅画面调色，<b>不互斥</b>、可以与起始转场同时开。
 *
 * <p>与转场不同的是它改的是"画面内容"而不是"开头那几帧"，所以它同时影响
 * 预览图、播放和导出成片（转场只影响成片开头）。
 */
export const FILTER_OPTIONS: readonly EffectOption[] = [
  {
    type: EFFECT_TYPE_T_CORP_FILTER,
    name: "T巢滤镜",
    description:
      "整幅画面压成 T 巢的棕褐色调（老照片）：暗部偏红褐、亮部偏米白。只染画面层，UI 与台词不受影响。",
  },
];

/**
 * @function 这个类型是不是起始转场（三种互斥的那一组）
 * @param type 数据里的特效类型（可为 null / 大小写不同）
 */
export function isTransitionEffectType(
  type: string | null | undefined,
): boolean {
  return TRANSITION_OPTIONS.some((option) => matchesEffectType(type, option.type));
}

/**
 * @function 一条记录的特效列表里，某个特效是不是开着的
 *
 * <p>`enabled` 缺省视为开（手写的 `{"type":"T_CORP_FILTER"}` 也算开），与后端
 * `EffectVisual.enabled = true` 的初值一致；类型比较忽略大小写。
 *
 * @param effects 记录的特效列表（可为 null / undefined）
 * @param type    特效类型
 */
export function isEffectEnabled(
  effects: EffectVisual[] | null | undefined,
  type: string,
): boolean {
  if (!Array.isArray(effects)) return false;
  return effects.some(
    (effect) => effect && effect.enabled !== false && matchesEffectType(effect.type, type),
  );
}

/**
 * @function 取记录当前生效的起始转场类型
 *
 * <p>与后端 {@code StartTransition.kindOf} 的优先级一致（交叉溶解 &gt; 黑屏 &gt; 白屏）：
 * 数据里同时存在多种时，面板上显示勾选的那一项就是导出视频时真正会用的那一项。
 * 正常情况下三种互斥，只会有一种。
 *
 * @param record 当前记录
 * @return 生效的特效类型；没有启用起始转场时返回 undefined
 */
export function activeTransitionType(record: Record): string | undefined {
  return TRANSITION_OPTIONS.find((option) =>
    isEffectEnabled(record?.effects, option.type),
  )?.type;
}

/**
 * @model 多条记录上的同一特效的三态
 *
 * <p>批量编辑用的"三方框"：`all` = 选中的记录全都勾着；`none` = 全都没勾；
 * `mixed` = 有勾有不勾（原生复选框只能用 `indeterminate` 表达，见 BatchEffectsEditor）。
 */
export type EffectTriState = "all" | "none" | "mixed";

/**
 * @function 选中多条记录时，某个特效的整体状态
 * @param records 选中的记录（空数组 = 没有可判断的对象，按"全没勾"处理）
 * @param type    特效类型
 */
export function effectTriState(
  records: Record[],
  type: string,
): EffectTriState {
  if (!records || records.length === 0) return "none";
  const enabledCount = records.filter((record) =>
    isEffectEnabled(record?.effects, type),
  ).length;
  if (enabledCount === records.length) return "all";
  return enabledCount === 0 ? "none" : "mixed";
}

/**
 * @function 勾选 / 取消勾选一个"只开关"的特效（画面滤镜、镜头摇动…）
 *
 * <p>写回的条目形状与其它纯开关特效完全一致：勾选 = `{ type, enabled: true }`（不带参数），
 * 取消 = 把这一条删掉。其它特效（转场、镜头摇动…）原样保留。
 *
 * <p>例外：记录里已经有一条**停用**的同类型条目时，勾选只把开关打开，不重复追加。
 *
 * @param effects 记录的特效列表
 * @param type    特效类型
 * @param enabled 目标状态
 * @returns 新的 effects 数组（无变化时返回原数组，便于浅比较 / 撤销栈去重）
 */
export function setEffectEnabled(
  effects: EffectVisual[] | null | undefined,
  type: string,
  enabled: boolean,
): EffectVisual[] {
  const list = Array.isArray(effects) ? effects : [];
  const entry = list.find((effect) => effect && matchesEffectType(effect.type, type));

  if (enabled) {
    if (!entry) return [...list, { type, enabled: true }];
    if (entry.enabled === false) {
      return list.map((effect) =>
        effect === entry ? { ...effect, enabled: true } : effect,
      );
    }
    return list;
  }

  if (!entry) return list;
  return list.filter((effect) => effect !== entry);
}

/**
 * @function 把记录设成某一种起始转场（三种互斥：先把其它转场清掉，再追加这一种）
 *
 * <p>已经是"唯一生效的那种"时返回原数组 —— 批量编辑里点一下"全部勾选某个本来全勾着的转场"
 * 不应该产生一步空撤销。
 *
 * @param effects 记录的特效列表
 * @param type    要启用的转场类型
 */
export function setTransition(
  effects: EffectVisual[] | null | undefined,
  type: string,
): EffectVisual[] {
  const list = Array.isArray(effects) ? effects : [];
  const transitions = list.filter((effect) =>
    isTransitionEffectType(effect?.type),
  );
  if (
    transitions.length === 1 &&
    transitions[0].enabled !== false &&
    matchesEffectType(transitions[0].type, type)
  ) {
    return list;
  }
  return [
    ...list.filter((effect) => !isTransitionEffectType(effect?.type)),
    { type, enabled: true },
  ];
}

/**
 * @function 删掉某种特效（取消勾选）
 *
 * <p>只删这一种：其它转场 / 滤镜 / 镜头摇动 / 将来新增的特效都原样保留，
 * 与单条面板里"取消勾选只删自己"的规则一致。类型比较忽略大小写。
 *
 * @param effects 记录的特效列表
 * @param type    要删掉的类型
 */
export function removeEffectType(
  effects: EffectVisual[] | null | undefined,
  type: string,
): EffectVisual[] {
  const list = Array.isArray(effects) ? effects : [];
  const next = list.filter((effect) => !matchesEffectType(effect?.type, type));
  return next.length === list.length ? list : next;
}
