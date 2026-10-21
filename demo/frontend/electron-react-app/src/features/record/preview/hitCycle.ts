/**
 * @module 重叠区域「循环下钻」选中
 *
 * 多个立绘 / 临时图片叠在一起时，只选最上层会让下面那张**永远点不到**。
 * 这里改成：在同一片重叠区域里**重复点击**，每次往下钻一层，钻到底再回到顶层。
 *
 * <h3>规则</h3>
 * <ol>
 *   <li>命中集合 = 该点命中的全部图层，按层级（`z`）从高到低排序；</li>
 *   <li>命中集合为空 → 取消选中，并清空循环状态；</li>
 *   <li>命中集合与上次**完全相同**（key 序列一致）→ 索引 +1 并对长度取模；</li>
 *   <li>否则（首次点击 / 换了区域）→ 索引归零，即最上层；</li>
 * </ol>
 *
 * <p>循环状态是"上一次的命中集合 + 索引"这一对，因此切到另一片重叠区域时
 * 集合不同、自然从最上层重新开始；点空白则直接清空。
 * 「非重叠区域」只有一个成员，`(0+1) % 1 === 0`，行为上等价于始终选中它。
 *
 * 纯函数，不碰 DOM/React：点击坐标 → 该选谁，全部可单测。
 */
import { layersAt } from "./previewLayout";
import type { PreviewLayer } from "./previewLayout";

/** 循环下钻的记忆：上次命中的图层 key 序列（已按 z 降序）+ 上次选中的下标 */
export interface HitCycleState {
  keys: string[];
  /** 上次选中的下标；下次点击要 +1 */
  index: number;
}

/** 一次点击的判定结果 */
export interface HitCycleResult {
  /** 本次应当选中的图层；null 表示点到空白 */
  layer: PreviewLayer | null;
  /** 下一次点击要用的记忆；null 表示清空 */
  state: HitCycleState | null;
}

/** 两个 key 序列是否完全一致（顺序也要一致：z 序变化说明图层关系变了） */
export const isSameHitSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((key, i) => key === b[i]);

/**
 * 计算一次点击应该选中谁。
 *
 * @param layers   几何模块产出的全部图层
 * @param point    点击位置（**预览图像素**，不是舞台 CSS 像素）
 * @param previous 上一次点击留下的循环记忆；null 表示从最上层开始
 * @returns 选中的图层与新的循环记忆
 */
export function resolveCycledHit(
  layers: PreviewLayer[],
  point: { x: number; y: number },
  previous: HitCycleState | null,
): HitCycleResult {
  // 命中集合已按 z 从高到低排好（layersAt 内部排序）
  const stack = layersAt(layers, point);
  if (stack.length === 0) {
    return { layer: null, state: null };
  }

  const keys = stack.map((layer) => layer.key);
  const continueCycle = previous !== null && isSameHitSet(previous.keys, keys);
  const index = continueCycle ? (previous!.index + 1) % stack.length : 0;

  return { layer: stack[index], state: { keys, index } };
}
