/**
 * @module 立绘动画求值内核（前端）
 * 确定性整数哈希 —— 与后端 `Hash32.java` 逐位一致。
 *
 * **绝对不要**在这里用 `Math.random()` 或 `Math.sin(seed)`：
 * - `Math.random()` 会让每次播放/每次导出的抖动轨迹都不同；
 * - `Math.sin` 在 JS 与 Java 的末位可能不同，6 位小数的对拍会随机失败。
 *
 * 全部运算保持在 32 位有符号整数上：
 * - JS 必须用 {@link Math.imul}（用 `*` 会先升格成 double，溢出部分丢失）；
 * - 无符号化用 `>>> 0`（对应 Java 的 `& 0xFFFFFFFFL`）。
 */

/**
 * MurmurHash3 的 finalizer（雪崩混合）。
 *
 * 直接用帧号当随机数会看出明显规律（相邻帧偏移只差一点），混合之后才是白噪声。
 */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h | 0;
}

/**
 * 取一个 [0, 1) 的确定性随机数。
 *
 * @param seed  工程里存的随机种子（缺省由编辑器掷出并入库）
 * @param index 变化的整数（抖动用"第几次换向"）
 * @param axis  轴号（x=0 / y=1 / rotate=2 …）
 */
export function hash01(seed: number, index: number, axis: number): number {
  const bits = fmix32(
    Math.imul(index, 374761393) + Math.imul(seed | 0, 668265263) + axis,
  );
  return (bits >>> 0) / 4294967296;
}

/** 取一个 [-1, 1) 的确定性随机数 */
export function signed(seed: number, index: number, axis: number): number {
  return hash01(seed, index, axis) * 2 - 1;
}
