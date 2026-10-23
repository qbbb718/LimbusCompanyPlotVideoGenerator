package com.lbc_plot.render.video.anim;

/**
 * @module 立绘动画求值内核
 * 六条程序化预设的曲线。
 *
 * <h2>两条硬约束（写新预设时必须遵守）</h2>
 * <ol>
 *   <li><b>{@code local = 0} 必须返回恒等值</b>：否则用户一加动画，画面就"啪"地跳一下。
 *       抖动的 jitter 模式用"第 −1 次换向 = 0"来满足它，弹跳的拉伸用 {@code |sin|} 而不是
 *       {@code 1 − |sin|}（后者在 0 处不为 1）。</li>
 *   <li><b>只能依赖 {@code local} 与 {@code params}</b>：不能读墙钟、不能 {@code Math.random()}。
 *       抖动要用 {@link Hash32}，否则预览与成片对不上。</li>
 * </ol>
 *
 * <p>曲线参数全部走 {@link AnimationClip#paramDouble}，缺失时用这里的默认值——
 * 于是"只写 {@code {"preset":"bounce"}} 什么都不配"也能得到一个合理的动画。
 *
 * <p>与前端 {@code features/record/animation/presetRegistry.tsx} 逐行对应，公式改一处要同时改两边，
 * 并在 {@code animation-fixtures.json} 里更新对应向量。
 */
public final class PresetRegistry {

    private static final double TWO_PI = Math.PI * 2d;

    private PresetRegistry() {
    }

    /**
     * 求某预设在第 {@code local} 帧的贡献值（其余通道为恒等值）。
     *
     * @param clip  提供参数（amplitude / periodFrames / …）
     * @param local clip 内的相对帧（可以是小数：timeScale 会让它非整数）
     * @return 本帧的变换；预设 id 非法时返回恒等
     */
    public static TransformState evaluate(AnimationClip clip, double local) {
        TransformState state = TransformState.identity();
        if (clip == null) {
            return state;
        }
        PresetId id = clip.presetId();
        if (id == null) {
            return state;
        }
        switch (id) {
            case BOUNCE:
                bounce(clip, local, state);
                break;
            case SHAKE:
                shake(clip, local, state);
                break;
            case BREATHE:
                breathe(clip, local, state);
                break;
            case SWAY:
                sway(clip, local, state);
                break;
            case BLINK:
                blink(clip, local, state);
                break;
            case PULSE:
                pulse(clip, local, state);
                break;
            default:
                break;
        }
        return state;
    }

    /**
     * 弹跳：{@code y = −A·|sin(π·s/T)|·decay^k}，{@code k} 是第几次弹跳。
     *
     * <p>用 {@code sin} 的一半周期（{@code π·s/T}）而不是整周期：这样每一次弹跳都是
     * "从地面升起再落回地面"，落地瞬间速度最大——比整周期更像真实弹跳。
     *
     * <p>可选 {@code stretch}（等比拉伸，默认 0）：顶点处略微拉长。**不做压扁**——压扁会在
     * t=0（落地帧）就产生非恒等值，违反"加动画不跳一下"的约束。
     */
    private static void bounce(AnimationClip clip, double local, TransformState state) {
        double amplitude = clip.paramDouble("amplitude", 24d);
        double period = Math.max(1d, clip.paramDouble("periodFrames", 18d));
        int iterations = clip.paramInt("iterations", 2);
        double decay = clip.paramDouble("decay", 0.55d);
        double stretch = clip.paramDouble("stretch", 0d);

        int k = (int) Math.floor(local / period);
        if (iterations > 0 && k >= iterations) {
            return;
        }
        double s = local - k * period;
        double wave = Math.abs(Math.sin(Math.PI * s / period));
        double envelope = Math.pow(decay, Math.max(0, k));

        state.setY(-amplitude * wave * envelope);
        if (stretch != 0d) {
            state.setScale(1d + stretch * wave * envelope);
        }
    }

    /**
     * 发抖：两种风格。
     *
     * <ul>
     *   <li>{@code jitter}（默认）：每 {@code periodFrames} 帧换一个目标偏移（由 seed 决定），
     *       帧间线性过渡。periodFrames = 2 时观感是"高频小抖"，且开销极低（纯平移，不需要重采样）；</li>
     *   <li>{@code sine}：x 走主频正弦、y 走双倍频半幅正弦（保证 t=0 恒等）。</li>
     * </ul>
     *
     * <p>{@code rotateAmplitude}（默认 0）> 0 时叠加绕锚点的轻微旋转。注意旋转要求每帧重采样，
     * 所以默认关闭。
     */
    private static void shake(AnimationClip clip, double local, TransformState state) {
        double amplitude = clip.paramDouble("amplitude", 6d);
        double period = Math.max(1d, clip.paramDouble("periodFrames", 2d));
        double rotateAmplitude = clip.paramDouble("rotateAmplitude", 0d);
        String style = clip.paramString("style", "jitter");

        if ("sine".equalsIgnoreCase(style)) {
            double w = TWO_PI * local / period;
            state.setX(amplitude * Math.sin(w));
            state.setY(amplitude * 0.5d * Math.sin(2d * w));
            if (rotateAmplitude != 0d) {
                state.setRotate(rotateAmplitude * Math.sin(w));
            }
            return;
        }

        long seed = (long) clip.paramDouble("seed", 0d);
        double step = Math.floor(local / period);
        double fraction = (local - step * period) / period;
        int index = (int) step;

        // 第 −1 次换向按 0 处理：于是 local = 0 处位移为 0（恒等）
        double prevX = index <= 0 ? 0d : Hash32.signed(seed, index - 1, 0);
        double curX = Hash32.signed(seed, index, 0);
        state.setX(amplitude * (prevX + (curX - prevX) * fraction));

        double prevY = index <= 0 ? 0d : Hash32.signed(seed, index - 1, 1);
        double curY = Hash32.signed(seed, index, 1);
        state.setY(amplitude * (prevY + (curY - prevY) * fraction));

        if (rotateAmplitude != 0d) {
            double prevR = index <= 0 ? 0d : Hash32.signed(seed, index - 1, 2);
            double curR = Hash32.signed(seed, index, 2);
            state.setRotate(rotateAmplitude * (prevR + (curR - prevR) * fraction));
        }
    }

    /** 呼吸：{@code scale = 1 + A·sin(2π·local/T)}，t=0 与每个整周期都是恒等 */
    private static void breathe(AnimationClip clip, double local, TransformState state) {
        double amplitude = clip.paramDouble("amplitude", 0.025d);
        double period = Math.max(1d, clip.paramDouble("periodFrames", 120d));
        state.setScale(1d + amplitude * Math.sin(TWO_PI * local / period));
    }

    /** 摇摆：{@code rotate = A·sin(2π·local/T)}，绕 anchor 旋转（立绘的 anchor 默认为脚底） */
    private static void sway(AnimationClip clip, double local, TransformState state) {
        double angle = clip.paramDouble("angle", 2.5d);
        double period = Math.max(1d, clip.paramDouble("periodFrames", 90d));
        state.setRotate(angle * Math.sin(TWO_PI * local / period));
    }

    /**
     * 闪烁：在周期前 {@code duty} 比例内把不透明度压到 {@code min}，边缘 2 帧线性过渡。
     *
     * <p>用"梯形窗"而不是方波：方波的开关是硬切，编码后在 H.264 里会拖出一片马赛克。
     */
    private static void blink(AnimationClip clip, double local, TransformState state) {
        double min = clamp(clip.paramDouble("min", 0.35d), 0d, 1d);
        double period = Math.max(2d, clip.paramDouble("periodFrames", 24d));
        double duty = clamp(clip.paramDouble("duty", 0.5d), 0.01d, 0.99d);

        double phase = (local % period + period) % period / period;
        double edge = Math.min(2d / period, duty / 2d);
        double weight = edge <= 0d
                ? 1d
                : clamp(phase / edge, 0d, 1d) * clamp((duty - phase) / edge, 0d, 1d);

        state.setAlpha(1d + (min - 1d) * weight);
    }

    /** 缩放脉冲：{@code scale = 1 + (peak−1)·sin(π·q)}，q 在 period 帧内从 0 走到 1 */
    private static void pulse(AnimationClip clip, double local, TransformState state) {
        double peak = clip.paramDouble("peak", 1.12d);
        double period = Math.max(1d, clip.paramDouble("periodFrames", 18d));
        double q = clamp(local / period, 0d, 1d);
        state.setScale(1d + (peak - 1d) * Math.sin(Math.PI * q));
    }

    private static double clamp(double value, double min, double max) {
        return Math.min(max, Math.max(min, value));
    }
}
