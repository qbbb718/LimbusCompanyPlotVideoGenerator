package com.lbc_plot.render.video;

import com.lbc_plot.plot.model.Record;

/**
 * @model 镜头摇动（特效 {@link EffectVisual#TYPE_CAMERA_SHAKE}）
 *
 * <h2>它是什么</h2>
 * 按帧给"看世界的那台相机"加一点位移，画面像被人拿着轻轻晃。它与摄像机动画走**同一层**：
 * 只影响背景 / 立绘 / 临时图片（世界层），对话框、地点牌、角色名片与边框暗角画在设计画布上，
 * 完全不受影响——这正是"UI 与遮罩不受影响"的实现方式。
 *
 * <h2>为什么改 center 而不是直接平移画面</h2>
 * 世界 → 场景的换算是 {@code scene = (world − center) × zoom + 960}。
 * 想让**屏幕上**的位移正好是 {@code (dx, dy)} 像素，只需要把 center 反向挪
 * {@code dx / zoom}：这样无论镜头推没推近，摇动的幅度都是同一个屏幕像素值（不会"推近之后晃得更凶"）。
 *
 * <h2>与前端必须逐帧一致</h2>
 * 预览的 DOM 层用同一个公式（{@code preview/cameraShake.ts}），两边都从
 * {@code effects} 里读同一份参数。公式只依赖帧号与参数，不读时钟、不读随机数：
 * <pre>
 *   period = max(1, periodFrames)
 *   dx = amplitude · sin(2π·f / period)
 *   dy = amplitude · 0.45 · sin(2π·f / (period · 0.73))     // 两个轴不同频率，避免像画圆
 * </pre>
 * {@code f = 0} 时两者都是 0——所以**没配这个特效、或第 0 帧，画面与改动前逐像素一致**。
 */
public final class CameraShake {

    /** 摇动幅度缺省值（屏幕像素） */
    public static final double DEFAULT_AMPLITUDE = 12d;

    /** 摇动周期缺省值（帧）：5 帧一个来回，约 6Hz，观感接近"手持轻微晃动" */
    public static final double DEFAULT_PERIOD_FRAMES = 5d;

    private static final double TWO_PI = Math.PI * 2;

    private CameraShake() {
    }

    /**
     * @function 这条记录是否启用了镜头摇动
     * @param record 记录（可为 null）
     * @return 存在已启用的 {@link EffectVisual#TYPE_CAMERA_SHAKE} 时 true
     */
    public static boolean isActive(Record record) {
        return configOf(record) != null;
    }

    /**
     * @function 取摇动参数
     * @param record 记录
     * @return {amplitude, periodFrames}；没启用时返回 null
     */
    public static double[] configOf(Record record) {
        if (record == null || record.getEffects() == null) {
            return null;
        }
        for (EffectVisual effect : record.getEffects()) {
            if (effect != null && effect.isCameraShake()) {
                double amplitude = effect.getAmplitude() != null && effect.getAmplitude() > 0
                        ? effect.getAmplitude()
                        : DEFAULT_AMPLITUDE;
                double period = effect.getPeriodFrames() != null && effect.getPeriodFrames() > 0
                        ? effect.getPeriodFrames()
                        : DEFAULT_PERIOD_FRAMES;
                return new double[] { amplitude, period };
            }
        }
        return null;
    }

    /**
     * @function 某一帧的屏幕位移
     * @param config   {@link #configOf} 的结果（null 时返回 {0, 0}）
     * @param frameIndex 记录内帧号
     * @return {dx, dy}，单位是**屏幕像素**（缩放前）
     */
    public static double[] offsetOf(double[] config, int frameIndex) {
        if (config == null) {
            return new double[] { 0d, 0d };
        }
        double amplitude = config[0];
        double period = Math.max(1d, config[1]);
        double dx = amplitude * Math.sin(TWO_PI * frameIndex / period);
        // 纵轴换一个频率：两轴同频会像"画圆"，不同频才像手抖
        double dy = amplitude * 0.45d * Math.sin(TWO_PI * frameIndex / (period * 0.73d));
        return new double[] { dx, dy };
    }

    /**
     * @function 把摇动应用到这一帧的相机上
     *
     * <p>返回新实例（不改入参）：调用方可能还在用原始相机做别的事
     * （比如 {@code RecordAnimation.sceneSignature} 的缓存键）。
     *
     * @param camera     这一帧的相机（已含摄像机动画）
     * @param record     记录（读 effects）
     * @param frameIndex 记录内帧号
     * @return 摇动后的相机；没启用摇动时原样返回
     */
    public static Camera apply(Camera camera, Record record, int frameIndex) {
        double[] config = configOf(record);
        if (camera == null || config == null) {
            return camera;
        }
        double[] offset = offsetOf(config, frameIndex);
        if (offset[0] == 0d && offset[1] == 0d) {
            return camera;
        }
        float zoom = camera.getZoomFactor();
        float safeZoom = zoom > 0f ? zoom : 1f;
        return new Camera(
                camera.getCenterX() - (float) (offset[0] / safeZoom),
                camera.getCenterY() - (float) (offset[1] / safeZoom),
                camera.getZoom());
    }
}
