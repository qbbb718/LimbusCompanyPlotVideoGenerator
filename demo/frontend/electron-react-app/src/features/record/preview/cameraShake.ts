/**
 * @module 镜头摇动的求值（摄像机预设 `CAMERA_SHAKE`）
 *
 * <p>与后端 `CameraShake.java` **逐行对应**：同一份参数、同一套公式，预览看到的晃动
 * 幅度/相位与成片一致（双端对拍的思路同 `spriteAnimator` / `presetRegistry`）。
 *
 * <p><b>开关在哪</b>：这个效果原先挂在「特效」页签，现在归到「摄像机 → 预设」
 * （注册表见 {@link module:preview/cameraPresets}），但**数据仍然写在 `record.effects`**：
 * 一条 `{ type: "CAMERA_SHAKE", enabled, amplitude?, periodFrames?, durationFrames?,
 * fadeInFrames?, fadeOutFrames? }`（= 后端 {@code EffectVisual.TYPE_CAMERA_SHAKE}）。
 * 存储格式没动，旧工程的摇动不需要迁移。
 *
 * <h2>为什么改相机中心而不是平移画面元素</h2>
 * 世界 → 场景的换算是 `scene = (world − center) × zoom + 960`。想让**屏幕上**的位移正好是
 * `(dx, dy)` 像素，只要把 center 反向挪 `dx / zoom`：这样镜头推近时摇动幅度不会跟着变大。
 *
 * <h2>为什么它不影响 UI 与遮罩</h2>
 * 预览/渲染里只有世界层（背景、立绘、临时图片）经过相机；对话框、地点牌、角色名片与
 * 边框暗角都画在设计画布坐标系上，压根不读 camera —— 所以"UI 与遮罩不受影响"是结构性的，
 * 不是靠额外判断排除的。
 *
 * <h2>时间包络（持续时长 / 渐入 / 渐出）</h2>
 * <pre>
 *   end   = durationFrames > 0 ? durationFrames : 记录总帧数     // 0 = 整条记录
 *   tIn   = fadeInFrames  > 0 ? clamp(f / fadeInFrames, 0, 1) : 1
 *   tOut  = fadeOutFrames > 0 ? clamp((end − f) / fadeOutFrames, 0, 1) : 1
 *   env   = min(tIn, tOut)                                      // f ≥ end 时为 0
 *   dx    = amplitude · sin(2πf/period) · env
 *   dy    = amplitude · 0.45 · sin(2πf/(period·0.73)) · env
 * </pre>
 * 三个新参数缺省都是 0（= 整条记录 / 不渐入 / 不渐出），所以**老数据的行为一个字都没变**。
 *
 * <h2>确定性</h2>
 * 只依赖帧号、参数与总帧数，不读 `Date.now()` / `Math.random()`；`f = 0` 时位移为 `(0, 0)`，
 * 所以"没配这个预设"和"第 0 帧"都与改动前逐像素一致（预览栅格图渲的就是第 0 帧）。
 */
import type { EffectVisual } from "@types";
import { EFFECT_TYPE_CAMERA_SHAKE } from "@types";
import type { RecordCamera } from "@types";
import { matchesEffectType } from "./effectType";

/** 摇动幅度缺省值（屏幕像素），与后端 CameraShake.DEFAULT_AMPLITUDE 一致 */
export const DEFAULT_CAMERA_SHAKE_AMPLITUDE = 12;

/** 摇动周期缺省值（帧），与后端 CameraShake.DEFAULT_PERIOD_FRAMES 一致 */
export const DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES = 5;

/**
 * 持续时长缺省值（帧）：**0 = 整条记录都在摇**。
 *
 * <p>这也是加"持续时长 / 渐入 / 渐出"之前的行为，所以老数据不需要写这三个字段。
 */
export const DEFAULT_CAMERA_SHAKE_DURATION_FRAMES = 0;

/** 渐入帧数缺省值：0 = 不渐入（一开始就是满幅度） */
export const DEFAULT_CAMERA_SHAKE_FADE_IN_FRAMES = 0;

/** 渐出帧数缺省值：0 = 不渐出（一直摇到结束） */
export const DEFAULT_CAMERA_SHAKE_FADE_OUT_FRAMES = 0;

const TWO_PI = Math.PI * 2;

/** 摇动参数 */
export interface CameraShakeConfig {
  /** 幅度（屏幕像素） */
  amplitude: number;
  /** 周期（帧） */
  periodFrames: number;
  /** 抖动持续多少帧；0 = 整条记录 */
  durationFrames: number;
  /** 渐入帧数（0 = 不渐入） */
  fadeInFrames: number;
  /** 渐出帧数（0 = 不渐出）；相对"抖动结束"往前推，未设持续时长时相对记录结尾 */
  fadeOutFrames: number;
}

/** 有限数字取正：非数字 / <= 0 一律回落 fallback（后端同样的读法） */
const positiveOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

/** 有限数字取非负：非数字 / < 0 一律回落 fallback（0 是合法值） */
const nonNegativeOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;

/**
 * @function 从 `record.effects` 里取摇动参数。
 *
 * <p>镜头摇动的 UI 已经从「特效」页签搬到「摄像机 → 预设」，但**数据位置没变**
 * （仍然是 `record.effects` 里的一条 `{type:"CAMERA_SHAKE", …}`），所以这里不用做任何迁移：
 * 旧工程打开照样生效。类型比较与后端一致（忽略大小写），见 {@link matchesEffectType}。
 *
 * @param effects 记录的特效列表
 * @returns 参数；没启用（或没有这一条）时返回 null
 */
export function cameraShakeConfigOf(
  effects: EffectVisual[] | null | undefined,
): CameraShakeConfig | null {
  if (!Array.isArray(effects)) return null;
  for (const effect of effects) {
    if (!effect || effect.enabled === false) continue;
    if (!matchesEffectType(effect.type, EFFECT_TYPE_CAMERA_SHAKE)) continue;
    return {
      amplitude: positiveOr(effect.amplitude, DEFAULT_CAMERA_SHAKE_AMPLITUDE),
      periodFrames: positiveOr(effect.periodFrames, DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES),
      durationFrames: nonNegativeOr(
        effect.durationFrames,
        DEFAULT_CAMERA_SHAKE_DURATION_FRAMES,
      ),
      fadeInFrames: nonNegativeOr(effect.fadeInFrames, DEFAULT_CAMERA_SHAKE_FADE_IN_FRAMES),
      fadeOutFrames: nonNegativeOr(
        effect.fadeOutFrames,
        DEFAULT_CAMERA_SHAKE_FADE_OUT_FRAMES,
      ),
    };
  }
  return null;
}

/**
 * @function 这次摇动在第几帧结束（不含）
 *
 * <p>**持续时长与记录总帧数取较小值**：设了 300 帧但记录只有 120 帧时，摇动到 120 帧就没了，
 * 渐出也应该落在记录内部，而不是跑到画面之外。
 *
 * @param config      摇动参数
 * @param totalFrames 记录总帧数（≤ 0 表示不知道）
 * @returns 结束帧；`Infinity` = 一直摇到记录结束且不知道长度（此时没有渐出）
 */
export function cameraShakeEndFrame(
  config: CameraShakeConfig,
  totalFrames: number,
): number {
  const total =
    typeof totalFrames === "number" && Number.isFinite(totalFrames) && totalFrames > 0
      ? totalFrames
      : 0;
  const duration = nonNegativeOr(config.durationFrames, 0);
  if (duration > 0) return total > 0 ? Math.min(duration, total) : duration;
  return total > 0 ? total : Infinity;
}

/**
 * @function 某一帧的时间包络（0~1）
 *
 * <p>渐入从第 0 帧开始线性升到 1（第 `fadeInFrames` 帧满幅）；渐出在结束前
 * `fadeOutFrames` 帧内线性降到 0；两者取较小值，所以"渐入比渐出还长"时中间没有满幅段，
 * 但不会互相叠加到超过 1。
 *
 * @param config      摇动参数
 * @param frameIndex  记录内帧号（可以是小数：预览是按浮点帧推进的）
 * @param totalFrames 记录总帧数（用于"持续时长 = 0（整条记录）"时的渐出定位）
 */
export function cameraShakeEnvelope(
  config: CameraShakeConfig,
  frameIndex: number,
  totalFrames = 0,
): number {
  const frame = typeof frameIndex === "number" && Number.isFinite(frameIndex) ? frameIndex : 0;
  if (frame < 0) return 0;

  const end = cameraShakeEndFrame(config, totalFrames);
  if (frame >= end) return 0;

  const fadeIn = Math.min(nonNegativeOr(config.fadeInFrames, 0), end);
  const fadeInGain = fadeIn > 0 ? Math.min(1, frame / fadeIn) : 1;

  // 不知道记录总长、也没设持续时长时，"结束"是无穷远，渐出没有参照点 → 按不渐出处理
  const fadeOut = Number.isFinite(end) ? Math.min(nonNegativeOr(config.fadeOutFrames, 0), end) : 0;
  const fadeOutGain =
    fadeOut > 0 ? Math.min(1, Math.max(0, (end - frame) / fadeOut)) : 1;

  return Math.max(0, Math.min(fadeInGain, fadeOutGain));
}

/**
 * @function 某一帧的屏幕位移（像素）
 *
 * @param config      摇动参数（null → 不动）
 * @param frameIndex  记录内帧号
 * @param totalFrames 记录总帧数（"持续时长 = 0"时决定渐出位置；不知道可不传）
 */
export function cameraShakeOffset(
  config: CameraShakeConfig | null,
  frameIndex: number,
  totalFrames = 0,
): { x: number; y: number } {
  if (!config) return { x: 0, y: 0 };
  const envelope = cameraShakeEnvelope(config, frameIndex, totalFrames);
  if (envelope <= 0) return { x: 0, y: 0 };

  const period = Math.max(1, positiveOr(config.periodFrames, DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES));
  const frame = typeof frameIndex === "number" && Number.isFinite(frameIndex) ? frameIndex : 0;
  const x = config.amplitude * Math.sin((TWO_PI * frame) / period) * envelope;
  // 纵轴换一个频率：两轴同频会像"画圆"，不同频才像手抖
  const y =
    config.amplitude * 0.45 * Math.sin((TWO_PI * frame) / (period * 0.73)) * envelope;
  return { x, y };
}

/**
 * @function 把摇动应用到这一帧的相机上（不改入参）。
 *
 * @param camera      这一帧的相机（已含摄像机动画）
 * @param config      摇动参数
 * @param frameIndex  记录内帧号
 * @param totalFrames 记录总帧数（渐出定位用；不知道可不传）
 */
export function applyCameraShake(
  camera: RecordCamera,
  config: CameraShakeConfig | null,
  frameIndex: number,
  totalFrames = 0,
): RecordCamera {
  const offset = cameraShakeOffset(config, frameIndex, totalFrames);
  if (offset.x === 0 && offset.y === 0) return camera;
  const zoom = typeof camera.zoom === "number" && camera.zoom > 0 ? camera.zoom : 1;
  return {
    ...camera,
    centerX: (camera.centerX ?? 960) - offset.x / zoom,
    centerY: (camera.centerY ?? 540) - offset.y / zoom,
  };
}
