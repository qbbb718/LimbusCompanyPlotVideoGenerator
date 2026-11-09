package com.lbc_plot.render.video;

import com.lbc_plot.plot.model.Record;

/**
 * @model 镜头摇动（摄像机预设 {@link EffectVisual#TYPE_CAMERA_SHAKE}）
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
 * <h2>时间包络（持续时长 / 渐入 / 渐出）</h2>
 * <pre>
 *   end   = durationFrames &gt; 0 ? min(durationFrames, 记录总帧数) : 记录总帧数   // 0 = 整条记录
 *   tIn   = fadeInFrames  &gt; 0 ? clamp(f / fadeInFrames, 0, 1) : 1
 *   tOut  = fadeOutFrames &gt; 0 ? clamp((end − f) / fadeOutFrames, 0, 1) : 1
 *   env   = min(tIn, tOut)                                                      // f ≥ end 时为 0
 *   dx    = amplitude · sin(2πf/period) · env
 *   dy    = amplitude · 0.45 · sin(2πf/(period·0.73)) · env
 * </pre>
 * 三个参数缺省都是 0（= 整条记录 / 不渐入 / 不渐出），所以**没有这三个字段的旧工程行为不变**。
 *
 * <h2>与前端必须逐帧一致</h2>
 * 预览的 DOM 层用同一个公式（{@code preview/cameraShake.ts}），两边都从
 * {@code effects} 里读同一份参数、都按"记录总帧数"定位渐出。
 * 公式只依赖帧号、参数与总帧数，不读时钟、不读随机数；{@code f = 0} 时位移恒为 0——
 * 所以**没配这个预设、或第 0 帧，画面与改动前逐像素一致**。
 */
public final class CameraShake {

    /** 摇动幅度缺省值（屏幕像素） */
    public static final double DEFAULT_AMPLITUDE = 12d;

    /** 摇动周期缺省值（帧）：5 帧一个来回，约 6Hz，观感接近"手持轻微晃动" */
    public static final double DEFAULT_PERIOD_FRAMES = 5d;

    /** 持续时长缺省值（帧）：0 = 整条记录都在摇（= 加这三个参数之前的行为） */
    public static final double DEFAULT_DURATION_FRAMES = 0d;

    /** 渐入缺省值（帧）：0 = 一开始就是满幅度 */
    public static final double DEFAULT_FADE_IN_FRAMES = 0d;

    /** 渐出缺省值（帧）：0 = 不渐出 */
    public static final double DEFAULT_FADE_OUT_FRAMES = 0d;

    private static final double TWO_PI = Math.PI * 2;

    private CameraShake() {
    }

    /**
     * @model 一次摇动的参数（单位：屏幕像素 / 帧）
     *
     * <p>用一个不可变对象而不是 {@code double[]}：字段一多，按下标取值容易写错，
     * 而且前后端对拍时"第几个是渐出"要反复查注释。
     */
    public static final class Config {

        /** 幅度（屏幕像素） */
        public final double amplitude;

        /** 周期（帧） */
        public final double periodFrames;

        /** 抖动持续多少帧；0 = 整条记录 */
        public final double durationFrames;

        /** 渐入帧数；0 = 不渐入 */
        public final double fadeInFrames;

        /** 渐出帧数；0 = 不渐出（对齐抖动结束；持续时长为 0 时对齐记录结尾） */
        public final double fadeOutFrames;

        Config(double amplitude, double periodFrames, double durationFrames, double fadeInFrames,
                double fadeOutFrames) {
            this.amplitude = amplitude;
            this.periodFrames = periodFrames;
            this.durationFrames = durationFrames;
            this.fadeInFrames = fadeInFrames;
            this.fadeOutFrames = fadeOutFrames;
        }
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
     * @return 参数；没启用时返回 null
     */
    public static Config configOf(Record record) {
        if (record == null || record.getEffects() == null) {
            return null;
        }
        for (EffectVisual effect : record.getEffects()) {
            if (effect == null || !effect.isCameraShake()) {
                continue;
            }
            return new Config(
                    positiveOr(effect.getAmplitude(), DEFAULT_AMPLITUDE),
                    positiveOr(effect.getPeriodFrames(), DEFAULT_PERIOD_FRAMES),
                    nonNegativeOr(effect.getDurationFrames(), DEFAULT_DURATION_FRAMES),
                    nonNegativeOr(effect.getFadeInFrames(), DEFAULT_FADE_IN_FRAMES),
                    nonNegativeOr(effect.getFadeOutFrames(), DEFAULT_FADE_OUT_FRAMES));
        }
        return null;
    }

    /**
     * @function 这次摇动在第几帧结束（不含）
     *
     * <p>持续时长与记录总帧数取较小值：设了 300 帧但记录只有 120 帧时，渐出落在记录内部。
     *
     * @param config      参数
     * @param totalFrames 记录总帧数（&le; 0 表示不知道）
     * @return 结束帧；{@link Double#POSITIVE_INFINITY} = 一直摇到记录结束且不知道长度（此时没有渐出）
     */
    public static double endFrame(Config config, int totalFrames) {
        double duration = config == null ? 0d : Math.max(0d, config.durationFrames);
        if (duration > 0d) {
            return totalFrames > 0 ? Math.min(duration, totalFrames) : duration;
        }
        return totalFrames > 0 ? totalFrames : Double.POSITIVE_INFINITY;
    }

    /**
     * @function 某一帧的时间包络（0~1）
     *
     * @param config      参数
     * @param frameIndex  记录内帧号
     * @param totalFrames 记录总帧数（"持续时长 = 0"时用来定位渐出）
     */
    public static double envelopeAt(Config config, int frameIndex, int totalFrames) {
        if (config == null || frameIndex < 0) {
            return 0d;
        }
        double end = endFrame(config, totalFrames);
        if (frameIndex >= end) {
            return 0d;
        }

        double fadeIn = Math.min(Math.max(0d, config.fadeInFrames), end);
        double fadeInGain = fadeIn > 0d ? Math.min(1d, frameIndex / fadeIn) : 1d;

        // 不知道记录总长、也没设持续时长时"结束"是无穷远，渐出没有参照点 → 按不渐出处理
        double fadeOut = Double.isInfinite(end) ? 0d : Math.min(Math.max(0d, config.fadeOutFrames), end);
        double fadeOutGain = fadeOut > 0d
                ? Math.min(1d, Math.max(0d, (end - frameIndex) / fadeOut))
                : 1d;

        return Math.max(0d, Math.min(fadeInGain, fadeOutGain));
    }

    /**
     * @function 某一帧的屏幕位移
     *
     * @param config      参数（null 时返回 {0, 0}）
     * @param frameIndex  记录内帧号
     * @param totalFrames 记录总帧数（渐出定位用；不知道传 0）
     * @return {dx, dy}，单位是**屏幕像素**（缩放前）
     */
    public static double[] offsetOf(Config config, int frameIndex, int totalFrames) {
        if (config == null) {
            return new double[] { 0d, 0d };
        }
        double envelope = envelopeAt(config, frameIndex, totalFrames);
        if (envelope <= 0d) {
            return new double[] { 0d, 0d };
        }
        double period = Math.max(1d, config.periodFrames);
        double dx = config.amplitude * Math.sin(TWO_PI * frameIndex / period) * envelope;
        // 纵轴换一个频率：两轴同频会像"画圆"，不同频才像手抖
        double dy = config.amplitude * 0.45d * Math.sin(TWO_PI * frameIndex / (period * 0.73d)) * envelope;
        return new double[] { dx, dy };
    }

    /**
     * @function 把摇动应用到这一帧的相机上
     *
     * <p>返回新实例（不改入参）：调用方可能还在用原始相机做别的事
     * （比如 {@code RecordAnimation.sceneSignature} 的缓存键）。
     *
     * @param camera      这一帧的相机（已含摄像机动画）
     * @param record      记录（读 effects）
     * @param frameIndex  记录内帧号
     * @param totalFrames 这条记录一共多少帧（渐出定位用；不知道传 0）
     * @return 摇动后的相机；没启用摇动时原样返回
     */
    public static Camera apply(Camera camera, Record record, int frameIndex, int totalFrames) {
        Config config = configOf(record);
        if (camera == null || config == null) {
            return camera;
        }
        double[] offset = offsetOf(config, frameIndex, totalFrames);
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

    /** 有限数字取正：非数字 / &le; 0 一律回落 fallback（与前端 cameraShake.cameraShakeConfigOf 一致） */
    private static double positiveOr(Double value, double fallback) {
        return value != null && !value.isNaN() && !value.isInfinite() && value > 0d ? value : fallback;
    }

    /** 有限数字取非负：非数字 / &lt; 0 一律回落 fallback（0 是合法值） */
    private static double nonNegativeOr(Double value, double fallback) {
        return value != null && !value.isNaN() && !value.isInfinite() && value >= 0d ? value : fallback;
    }
}
