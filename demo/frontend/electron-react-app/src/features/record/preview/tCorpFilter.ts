/**
 * @module T 巢滤镜（画面层调色，`T_CORP_FILTER`）
 *
 * 把画面压成 T 巢（T Corp）的棕褐色老照片：先按 Rec.601 算亮度，再把亮度映射成一条
 * "暗部偏红褐、亮部偏米白"的单色带。**只作用于画面层**（背景 / 立绘 / 临时图片）。
 *
 * <h2>成片与预览各自怎么实现</h2>
 * <ul>
 *   <li><b>成片 / 栅格预览图</b>：后端 {@code RenderOfImage} 在"场景画布"上查 256 级表
 *       （{@code TCorpFilter.applyInPlace}），UI 是之后才叠上去的；</li>
 *   <li><b>DOM 场景层</b>（拖拽跟手、播放、对位自检时顶上的那一层）：用等价的 SVG 滤镜
 *       {@code #dsh-t-corp-filter}，见 {@link module:preview/TCorpFilterDefs}。</li>
 * </ul>
 *
 * <h2>为什么两边能逐像素对上</h2>
 * 两边的数学是同一句：
 * <pre>
 *   y = round(0.299R + 0.587G + 0.114B)     // 0~255
 *   (R', G', B') = TABLE[y]                 // alpha 原样保留
 * </pre>
 * {@link tCorpTableValues} 用**同一份控制点**导出 256 级表，喂给 SVG 的
 * {@code feComponentTransfer type="table"}；{@code feColorMatrix} 用的也正好是
 * 0.299 / 0.587 / 0.114 这一行（必须显式写 {@code color-interpolation-filters="sRGB"}，
 * 否则滤镜在 linearRGB 里算，画面会明显偏亮）。
 *
 * <h2>数据存在哪</h2>
 * 与其它特效一样：`record.effects` 里的一条 `{ type: "T_CORP_FILTER", enabled: true }`。
 * 勾选 = 加一条，取消 = 删掉这一条（与「摄像机 → 预设」的写回形状完全一致），
 * 所以工程保存 / 加载、撤销栈、导出请求都不用额外处理。
 */
import type { EffectVisual } from "@types";
import { EFFECT_TYPE_T_CORP_FILTER } from "@types";
import { matchesEffectType } from "./effectType";

/**
 * SVG 滤镜的 id。{@code filter: url(#...)} 直接引用这个 id，
 * 因此**整页只能有一份同名滤镜**（由 `RecordPreview` 挂载）。
 */
export const T_CORP_FILTER_ID = "dsh-t-corp-filter";

/**
 * 控制点：亮度位置（0~1，递增），与 {@link T_CORP_FILTER_RGB} 一一对应。
 *
 * <p>与后端 `TCorpFilter.CONTROL_LUMA` 是<b>同一份数</b>，改动必须两边一起改，
 * 否则预览与成片会出现一条"对不上"的色带。
 */
export const T_CORP_FILTER_LUMA: readonly number[] = [
  0.0, 0.015, 0.045, 0.08, 0.125, 0.185, 0.26, 0.35,
  0.45, 0.56, 0.67, 0.76, 0.835, 0.9, 0.965, 1.0,
];

/**
 * 控制点：目标颜色（0~255），与 {@link T_CORP_FILTER_LUMA} 一一对应。
 *
 * <p>暗部是偏红的深棕（R:G:B ≈ 1:0.4:0），亮部接近中性米白 —— 这个"随亮度变化的色偏"
 * 正是两点线性插值做不出来的地方。
 */
export const T_CORP_FILTER_RGB: readonly (readonly [number, number, number])[] = [
  [7, 3, 0],
  [10, 5, 0],
  [17, 11, 4],
  [25, 18, 11],
  [38, 28, 20],
  [65, 41, 26],
  [85, 60, 42],
  [106, 83, 66],
  [132, 108, 91],
  [164, 136, 116],
  [194, 165, 143],
  [218, 189, 166],
  [235, 206, 183],
  [251, 225, 202],
  [251, 233, 210],
  [251, 233, 210],
];

/** 表的精度：与后端查找表同为 256 级（对应亮度 0~255） */
export const T_CORP_FILTER_STEPS = 256;

/**
 * 在控制点上做线性插值。
 *
 * @param luma    亮度 0~1
 * @param channel 0=R / 1=G / 2=B
 * @returns 0~255 的目标通道值
 */
function interpolate(luma: number, channel: number): number {
  const last = T_CORP_FILTER_LUMA.length - 1;
  if (luma <= T_CORP_FILTER_LUMA[0]) return T_CORP_FILTER_RGB[0][channel];
  if (luma >= T_CORP_FILTER_LUMA[last]) return T_CORP_FILTER_RGB[last][channel];

  for (let i = 0; i < last; i++) {
    const left = T_CORP_FILTER_LUMA[i];
    const right = T_CORP_FILTER_LUMA[i + 1];
    if (luma >= left && luma <= right) {
      const span = right - left;
      const t = span <= 0 ? 1 : (luma - left) / span;
      const from = T_CORP_FILTER_RGB[i][channel];
      const to = T_CORP_FILTER_RGB[i + 1][channel];
      return from + (to - from) * t;
    }
  }
  return T_CORP_FILTER_RGB[last][channel];
}

let cachedTables: { r: number[]; g: number[]; b: number[] } | null = null;

/**
 * @function 256 级查找表（每个通道一条，值域 0~255）
 *
 * <p>与后端 `TCorpFilter` 的 `buildTable()` 同一套算法，同样强制单调不减：
 * 保证"更亮的地方不会更暗"，也不会因为控制点末端 ±1 的抖动出现回跌。
 */
export function tCorpTables(): { r: number[]; g: number[]; b: number[] } {
  if (cachedTables) return cachedTables;

  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  let pr = T_CORP_FILTER_RGB[0][0];
  let pg = T_CORP_FILTER_RGB[0][1];
  let pb = T_CORP_FILTER_RGB[0][2];

  for (let i = 0; i < T_CORP_FILTER_STEPS; i++) {
    const luma = i / (T_CORP_FILTER_STEPS - 1);
    pr = Math.min(255, Math.max(pr, Math.round(interpolate(luma, 0))));
    pg = Math.min(255, Math.max(pg, Math.round(interpolate(luma, 1))));
    pb = Math.min(255, Math.max(pb, Math.round(interpolate(luma, 2))));
    r.push(pr);
    g.push(pg);
    b.push(pb);
  }

  cachedTables = { r, g, b };
  return cachedTables;
}

/**
 * @function 喂给 `feComponentTransfer` 的 `tableValues`
 *
 * <p>SVG 要求归一化到 0~1 的字符串；256 个点之间按线性插值，与后端的整数表只差
 * 舍入（≤1/255）。
 */
export function tCorpTableValues(): { r: string; g: string; b: string } {
  const tables = tCorpTables();
  const join = (values: number[]) =>
    values.map((value) => (value / 255).toFixed(6)).join(" ");
  return { r: join(tables.r), g: join(tables.g), b: join(tables.b) };
}

/** @function CSS 里可直接用的滤镜值：`url(#dsh-t-corp-filter)` */
export function tCorpFilterUrl(): string {
  return `url(#${T_CORP_FILTER_ID})`;
}

/**
 * @function 这条记录是否开着 T 巢滤镜
 *
 * <p>`enabled` 缺省视为启用（手写的 `{"type":"T_CORP_FILTER"}` 也算开），
 * 与后端 `EffectVisual.enabled = true` 的初值一致。
 *
 * @param effects 记录的特效列表
 */
export function isTCorpFilterEnabled(effects: EffectVisual[] | null | undefined): boolean {
  if (!Array.isArray(effects)) return false;
  return effects.some(
    (effect) => effect && effect.enabled !== false && matchesEffectType(effect.type, EFFECT_TYPE_T_CORP_FILTER),
  );
}

/**
 * @function 勾选 / 取消 T 巢滤镜
 *
 * <p>写回的条目形状与其它纯开关特效完全一致：勾选 = `{ type, enabled: true }`（不带参数），
 * 取消 = 把这一条删掉。其它特效（转场、镜头摇动…）原样保留。
 *
 * <p>例外：记录里已经有一条**停用**的同类型条目时，勾选只把开关打开，不重复追加。
 *
 * @param effects 记录的特效列表
 * @param enabled 目标状态
 * @returns 新的 effects 数组（无变化时返回原数组，便于浅比较 / 撤销栈去重）
 */
export function toggleTCorpFilter(
  effects: EffectVisual[] | null | undefined,
  enabled: boolean,
): EffectVisual[] {
  const list = Array.isArray(effects) ? effects : [];
  const entry = list.find((effect) => effect && matchesEffectType(effect.type, EFFECT_TYPE_T_CORP_FILTER));

  if (enabled) {
    if (!entry) return [...list, { type: EFFECT_TYPE_T_CORP_FILTER, enabled: true }];
    if (entry.enabled === false) {
      return list.map((effect) => (effect === entry ? { ...effect, enabled: true } : effect));
    }
    return list;
  }

  if (!entry) return list;
  return list.filter((effect) => effect !== entry);
}
