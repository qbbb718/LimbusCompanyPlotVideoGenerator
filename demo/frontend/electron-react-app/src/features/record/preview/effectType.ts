/**
 * @module 记录级特效/预设的类型标识
 *
 * 特效与摄像机预设的类型字符串是**序列化标识**：它随记录、工程文件与导出请求一起去后端
 * （`EffectVisual.type`）。所以"两个 type 是不是同一种"这件事必须前后端判断一致——
 * 后端 `EffectVisual.isEnabledType` 用的是 {@code equalsIgnoreCase}，这里也**忽略大小写**，
 * 否则会出现"后端在晃、前端面板没勾上"（手写/旧版工程里写了 `camera_shake` 就会这样）。
 *
 * <p>只做类型身份判断，不认识任何一种具体特效——具体语义由
 * {@link module:preview/cameraShake} 与 {@link module:preview/cameraPresets} 各自负责。
 */

/**
 * @function 判断两个特效类型是否是同一种
 * @param candidate 数据里的类型（可能为 null / 空 / 大小写不同）
 * @param expected  期望的类型（`EFFECT_TYPE_*` 常量）
 * @returns 忽略大小写相等时返回 true；任一为空返回 false
 */
export function matchesEffectType(
  candidate: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!candidate || !expected) return false;
  return candidate.toLowerCase() === expected.toLowerCase();
}
