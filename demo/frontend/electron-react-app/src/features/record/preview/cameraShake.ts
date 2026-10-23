/**
 * @module 镜头摇动（特效 `CAMERA_SHAKE`）的求值
 *
 * <p>与后端 `CameraShake.java` **逐行对应**：同一份参数、同一套公式，预览看到的晃动
 * 幅度/相位与成片一致（双端对拍的思路同 `spriteAnimator` / `presetRegistry`）。
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
 * <h2>确定性</h2>
 * 只依赖帧号与参数，不读 `Date.now()` / `Math.random()`；`f = 0` 时位移为 `(0, 0)`，
 * 所以"没配这个特效"和"第 0 帧"都与改动前逐像素一致（预览栅格图渲的就是第 0 帧）。
 */
import type { EffectVisual } from "@types";
import { EFFECT_TYPE_CAMERA_SHAKE } from "@types";
import type { RecordCamera } from "@types";

/** 摇动幅度缺省值（屏幕像素），与后端 CameraShake.DEFAULT_AMPLITUDE 一致 */
export const DEFAULT_CAMERA_SHAKE_AMPLITUDE = 12;

/** 摇动周期缺省值（帧），与后端 CameraShake.DEFAULT_PERIOD_FRAMES 一致 */
export const DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES = 5;

const TWO_PI = Math.PI * 2;

/** 摇动参数 */
export interface CameraShakeConfig {
  /** 幅度（屏幕像素） */
  amplitude: number;
  /** 周期（帧） */
  periodFrames: number;
}

/**
 * 从 `record.effects` 里取摇动参数。
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
    if (effect.type !== EFFECT_TYPE_CAMERA_SHAKE) continue;
    const amplitude =
      typeof effect.amplitude === "number" && effect.amplitude > 0
        ? effect.amplitude
        : DEFAULT_CAMERA_SHAKE_AMPLITUDE;
    const periodFrames =
      typeof effect.periodFrames === "number" && effect.periodFrames > 0
        ? effect.periodFrames
        : DEFAULT_CAMERA_SHAKE_PERIOD_FRAMES;
    return { amplitude, periodFrames };
  }
  return null;
}

/**
 * 某一帧的屏幕位移（像素）。
 *
 * @param config 摇动参数（null → 不动）
 * @param frameIndex 记录内帧号
 */
export function cameraShakeOffset(
  config: CameraShakeConfig | null,
  frameIndex: number,
): { x: number; y: number } {
  if (!config) return { x: 0, y: 0 };
  const period = Math.max(1, config.periodFrames);
  const frame = Number.isFinite(frameIndex) ? frameIndex : 0;
  const x = config.amplitude * Math.sin((TWO_PI * frame) / period);
  // 纵轴换一个频率：两轴同频会像"画圆"，不同频才像手抖
  const y = config.amplitude * 0.45 * Math.sin((TWO_PI * frame) / (period * 0.73));
  return { x, y };
}

/**
 * 把摇动应用到这一帧的相机上（不改入参）。
 *
 * @param camera 这一帧的相机（已含摄像机动画）
 * @param config 摇动参数
 * @param frameIndex 记录内帧号
 */
export function applyCameraShake(
  camera: RecordCamera,
  config: CameraShakeConfig | null,
  frameIndex: number,
): RecordCamera {
  const offset = cameraShakeOffset(config, frameIndex);
  if (offset.x === 0 && offset.y === 0) return camera;
  const zoom = typeof camera.zoom === "number" && camera.zoom > 0 ? camera.zoom : 1;
  return {
    ...camera,
    centerX: (camera.centerX ?? 960) - offset.x / zoom,
    centerY: (camera.centerY ?? 540) - offset.y / zoom,
  };
}
