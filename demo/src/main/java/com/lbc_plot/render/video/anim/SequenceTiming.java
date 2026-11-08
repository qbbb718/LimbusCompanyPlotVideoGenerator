package com.lbc_plot.render.video.anim;

/**
 * @module 情绪动画（序列帧）时序内核
 * 把「一张图持续 N 帧」的帧序列投影成某一帧该显示哪张图、多透明。
 *
 * <h2>为什么单独成类、且必须与前端逐位一致</h2>
 * 预览用浏览器 DOM 播帧、成片用 Java2D 画帧，两条路径无法互测。能保证"编辑器里看到的
 * 就是导出后的样子"的唯一办法是：**同一份输入、同一份纯函数、同一份夹具**
 * （{@code demo/src/test/resources/animation-fixtures.json} 的 {@code sequenceTiming} 段）。
 * 因此本类禁止：读时间、读随机数、读文件、依赖任何 Spring bean。它是纯算术。
 *
 * <p>与前端 {@code features/record/animation/sequenceTiming.ts} 逐行对应，**改公式必须两端一起改**。
 *
 * <h2>时间单位的坑：帧，不是秒</h2>
 * 全项目 timebase 恒为 30fps（{@code SpriteAnimation.timebase.fps} 是契约断言，不是配置项）。
 * 所以「每张图持续多久」直接存**整数帧**：存秒会引入浮点，两端最后一位必然对不上，
 * 表现为"预览第 37 帧还在第 5 张图，成片已经跳到第 6 张"。
 *
 * <h2>与 {@link AnimationClip} 的循环语义保持一致</h2>
 * 循环模式直接复用 {@link LoopMode}（once / loop / pingpong / hold），不新造枚举：
 * <ul>
 *   <li>{@code once}：播完就结束（{@link #NO_FRAME}，什么都不画）；</li>
 *   <li>{@code hold}：播完停在最后一帧；</li>
 *   <li>{@code loop}：取模无限循环（{@code iterations} 有限时播够次数结束）；</li>
 *   <li>{@code pingpong}：三角波往返。</li>
 * </ul>
 *
 * <h2>透明度包络：与 clip 的 {@code fadeIn/fadeOut} 有意义差别（刻意为之）</h2>
 * 序列的淡出以**最后一帧为 0**：{@code w = (len-1-local)/fadeOut}。
 * 这样"淡出 6 帧"就是字面意思——最后 6 帧从 1 线性降到 0，最后一帧完全透明。
 * 而 {@link SpriteAnimator#envelope} 用的是 {@code (duration-local)/fadeOut}，最后一帧停在
 * {@code 1/fadeOut} 再硬切到 0（那是 clip 的历史行为，不改它，免得动已冻结的对拍夹具）。
 * 两处口径在本类注释里写清楚，避免后人"顺手统一"。
 */
public final class SequenceTiming {

    /** 该帧不显示任何图（还没开始 / 已播完 / 没有帧） */
    public static final int NO_FRAME = -1;

    private SequenceTiming() {
    }

    /**
     * 一轮总帧数 = {@code Σ frameHolds}。
     *
     * @param frameHolds 每帧持续帧数；null / 空 → 0
     * @return 总帧数（非法条目按 1 帧计，保证"有 N 张图就有 N 帧"）
     */
    public static int totalFrames(int[] frameHolds) {
        if (frameHolds == null || frameHolds.length == 0) {
            return 0;
        }
        int total = 0;
        for (int hold : frameHolds) {
            total += hold > 0 ? hold : 1;
        }
        return total;
    }

    /** 帧数（图有几张）；null / 空 → 0 */
    public static int frameCount(int[] frameHolds) {
        return frameHolds == null ? 0 : frameHolds.length;
    }

    /**
     * 求某一轮之内的**局部帧号**。
     *
     * @param frameHolds 每帧持续帧数
     * @param loop       循环模式（null → once）
     * @param iterations 循环次数；null / ≤0 = 无限（仅 loop / pingpong 有意义）
     * @param startFrame 相对记录开头的延迟帧数
     * @param frameIndex 记录内的绝对帧号
     * @return {@code [0, totalFrames)}，或 {@link #NO_FRAME}
     */
    public static int localFrame(int[] frameHolds, LoopMode loop, Integer iterations, int startFrame,
            int frameIndex) {
        final int length = totalFrames(frameHolds);
        if (length <= 0) {
            return NO_FRAME;
        }
        final int t = frameIndex - startFrame;
        if (t < 0) {
            return NO_FRAME;
        }
        final LoopMode mode = loop == null ? LoopMode.ONCE : loop;
        final int finiteIterations = iterations == null ? 0 : iterations;
        switch (mode) {
            case HOLD:
                return Math.min(t, length - 1);
            case LOOP: {
                if (finiteIterations > 0) {
                    long total = (long) length * finiteIterations;
                    if (t >= total) {
                        return NO_FRAME;
                    }
                }
                return t % length;
            }
            case PINGPONG: {
                if (finiteIterations > 0) {
                    long total = (long) length * finiteIterations;
                    if (t >= total) {
                        return NO_FRAME;
                    }
                }
                int period = length * 2;
                int m = t % period;
                int localFrame = m <= length ? m : period - m;
                // m == length 时两个分支都给 length（越界一帧），夹回最后一帧
                return Math.min(localFrame, length - 1);
            }
            case ONCE:
            default:
                return t >= length ? NO_FRAME : t;
        }
    }

    /**
     * 局部帧号 → 第几张图（0 起）。
     *
     * @return {@code -1} 当 {@code local} 非法或超出总长
     */
    public static int frameIndexAt(int[] frameHolds, int local) {
        if (frameHolds == null || frameHolds.length == 0 || local < 0) {
            return NO_FRAME;
        }
        int accumulated = 0;
        for (int i = 0; i < frameHolds.length; i++) {
            int hold = frameHolds[i] > 0 ? frameHolds[i] : 1;
            accumulated += hold;
            if (local < accumulated) {
                return i;
            }
        }
        return NO_FRAME;
    }

    /**
     * 透明度包络（含用户设的整体不透明度乘子）。
     *
     * <p>淡入 / 淡出帧数会被收敛到 {@code len-1} 以内：单帧序列不淡出
     * （否则唯一那一帧的权重恒为 0，图永远不可见）。
     *
     * @param local        局部帧号；{@link #NO_FRAME} → 0
     * @param fadeInFrames 淡入帧数（0 = 不淡入）
     * @param fadeOutFrames 淡出帧数（0 = 不淡出）
     * @param opacity      整体不透明度（非法值按 1）
     * @return {@code [0, 1]}
     */
    public static double alphaAt(int[] frameHolds, int local, int fadeInFrames, int fadeOutFrames,
            double opacity) {
        final int length = totalFrames(frameHolds);
        if (local == NO_FRAME || length <= 0) {
            return 0d;
        }
        double weight = 1d;
        int fadeIn = Math.min(Math.max(0, fadeInFrames), length - 1);
        int fadeOut = Math.min(Math.max(0, fadeOutFrames), length - 1);
        if (fadeIn > 0) {
            weight *= clamp01(local / (double) fadeIn);
        }
        if (fadeOut > 0) {
            weight *= clamp01((length - 1 - local) / (double) fadeOut);
        }
        double baseOpacity = Double.isFinite(opacity) ? clamp01(opacity) : 1d;
        return clamp01(baseOpacity * weight);
    }

    /**
     * 一次求完：这一帧该显示第几张图、多透明。
     *
     * <p>**渲染端与预览端都只调这一个方法**——分散调用 {@link #localFrame} + {@link #frameIndexAt}
     * 很容易漏掉"loop 模式必须把 fadeOut 归零"这条规则，然后循环接缝上一淡一显。
     *
     * @return 永不返回 null；{@code imageIndex == NO_FRAME} 表示这一帧什么都不画
     */
    public static Sample sample(int[] frameHolds, LoopMode loop, Integer iterations, int startFrame,
            int fadeInFrames, int fadeOutFrames, double opacity, int frameIndex) {
        final int local = localFrame(frameHolds, loop, iterations, startFrame, frameIndex);
        if (local == NO_FRAME) {
            return new Sample(NO_FRAME, NO_FRAME, 0d);
        }
        final LoopMode mode = loop == null ? LoopMode.ONCE : loop;
        // 循环模式的淡出会让每一轮接缝都"一淡一显"，直接归零（与 AnimationClip 同一约定）
        final boolean looping = mode == LoopMode.LOOP || mode == LoopMode.PINGPONG;
        double alpha = alphaAt(frameHolds, local, fadeInFrames, looping ? 0 : fadeOutFrames, opacity);
        return new Sample(frameIndexAt(frameHolds, local), local, alpha);
    }

    /**
     * 求值结果。
     *
     * @param imageIndex 第几张图（0 起）；{@link #NO_FRAME} = 不画
     * @param localFrame 该帧在一轮里的局部帧号；{@link #NO_FRAME} = 不画
     * @param alpha      最终不透明度
     */
    public record Sample(int imageIndex, int localFrame, double alpha) {
        /** 这一帧是否要画 */
        public boolean visible() {
            return imageIndex != NO_FRAME && alpha > 1e-4;
        }
    }

    private static double clamp01(double value) {
        if (!Double.isFinite(value)) {
            return 0d;
        }
        return Math.min(1d, Math.max(0d, value));
    }
}
