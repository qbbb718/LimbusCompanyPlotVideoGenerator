package com.lbc_plot.render.video.anim;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * @module 立绘动画求值内核
 * 求值入口：{@code evaluate(anim, frameIndex)} —— **纯函数**，输入帧号、输出变换。
 *
 * <h2>为什么必须是纯函数</h2>
 * 预览（浏览器 DOM）与成片（Java2D 逐帧）是两条完全独立的渲染路径，唯一能让两者逐帧一致的办法
 * 就是"同一个输入 → 同一个输出"。所以这里：
 * <ul>
 *   <li>不读墙钟、不读 {@code Random}、不读 devicePixelRatio；</li>
 *   <li>抖动只用 {@link Hash32}（整数哈希，两端逐位一致）；</li>
 *   <li>缓动只有 5 条固定曲线（{@link Easing}），不引入需要数值迭代的 cubic-bezier。</li>
 * </ul>
 *
 * <h2>与前端的关系</h2>
 * 前端 {@code features/record/animation/spriteAnimator.ts} 是本类的镜像实现，
 * 两者的正确性由共享夹具 {@code demo/src/test/resources/animation-fixtures.json} 双向锁死。
 * **改这里的公式必须同时改前端并更新夹具**，否则预览与成片会静默错位（最坏的 bug 类型：
 * 编辑器里一切正常，导出来才发现对不上）。
 */
public final class SpriteAnimator {

    private SpriteAnimator() {
    }

    /**
     * 求某元素在第 {@code frameIndex} 帧的变换。
     *
     * <p>没有任何动画 / 全部 clip 都未生效时返回**恒等变换**，渲染端据此走"完全不经过仿射"的
     * 旧路径（这是"旧工程逐像素不变"的实现前提）。
     *
     * @param anim       元素的动画装备（可为 null）
     * @param frameIndex 记录内的绝对帧号（0 = 记录第一帧）
     */
    public static TransformState evaluate(SpriteAnimation anim, int frameIndex) {
        TransformState result = TransformState.identity();
        if (anim == null || !anim.isEffectivelyEnabled() || anim.getClips() == null || anim.getClips().isEmpty()) {
            return result;
        }

        for (AnimationClip clip : orderedClips(anim.getClips())) {
            if (clip == null || !clip.isEffectivelyEnabled()) {
                continue;
            }
            Double local = project(clip, frameIndex);
            if (local == null) {
                continue;
            }
            TransformState value = valueAt(clip, local);
            if (value == null) {
                continue;
            }
            double weight = envelope(clip, local);
            if (weight <= 0d) {
                continue;
            }
            for (AnimChannel channel : clip.resolvedChannels()) {
                BlendMode mode = clip.blendModeFor(channel);
                result.set(channel, mode.compose(result.get(channel), value.get(channel), weight));
            }
        }
        return result;
    }

    /**
     * 把绝对帧号投影成 clip 内的相对帧（{@code null} = 本 clip 在这一帧不生效）。
     *
     * <p>时间语义（与前端逐行对应）：
     * <ul>
     *   <li>{@code frame < startFrame} → 不生效；{@code endFrame} 显式设置且已过 → 不生效；</li>
     *   <li>{@code once}：超过时长后按 {@code onEnd} 收尾（hold 停在最后一帧 / reset 回恒等）；</li>
     *   <li>{@code hold}：永远停在最后一帧；</li>
     *   <li>{@code loop}：取模；{@code pingpong}：三角波（天然无接缝）。</li>
     * </ul>
     */
    public static Double project(AnimationClip clip, int frameIndex) {
        if (clip == null) {
            return null;
        }
        int startFrame = clip.getStartFrame();
        if (frameIndex < startFrame) {
            return null;
        }
        Integer endFrame = clip.getEndFrame();
        if (endFrame != null && frameIndex >= endFrame) {
            return null;
        }
        int duration = clip.getDurationFrames();
        if (duration <= 0) {
            return null;
        }

        double local = (frameIndex - startFrame) * clip.timeScaleOrDefault();

        switch (clip.loopMode()) {
            case HOLD:
                return Math.min(local, duration - 1d);
            case LOOP:
                return local % duration;
            case PINGPONG: {
                double period = duration * 2d;
                double m = local % period;
                return m <= duration ? m : period - m;
            }
            case ONCE:
            default:
                if (local >= duration) {
                    boolean hold = "hold".equalsIgnoreCase(clip.getOnEnd() == null ? "" : clip.getOnEnd().trim());
                    return hold ? duration - 1d : null;
                }
                return local;
        }
    }

    /**
     * 权重包络：入场 / 出场各用若干帧把这条 clip 的贡献淡入淡出。
     *
     * <p>存在的意义是"不硬跳"：{@code once} 播完回恒等、{@code endFrame} 截断，都会在边界上产生
     * 一次跳变，有了包络就变成自然收尾。注意 {@code loop} 模式**必须**把 fadeOut 设为 0，
     * 否则循环接缝会一淡一显。
     *
     * @param local 投影后的相对帧（可能是小数）
     * @return 0~1
     */
    public static double envelope(AnimationClip clip, double local) {
        if (clip == null) {
            return 0d;
        }
        double weight = 1d;
        int fadeIn = clip.getFadeInFrames();
        if (fadeIn > 0) {
            weight *= clamp01(local / fadeIn);
        }
        int fadeOut = clip.getFadeOutFrames();
        int duration = clip.getDurationFrames();
        if (fadeOut > 0 && duration > 0) {
            weight *= clamp01((duration - local) / fadeOut);
        }
        return clamp01(weight);
    }

    /**
     * 求某 clip 在相对帧 {@code local} 的贡献值（不含权重包络）。
     *
     * @return 预设 → 注册表曲线；关键帧 → 分段插值；无有效内容 → null（跳过）
     */
    public static TransformState valueAt(AnimationClip clip, double local) {
        if (clip.isPresetClip()) {
            return PresetRegistry.evaluate(clip, local);
        }
        return interpolate(clip, local);
    }

    /**
     * 关键帧分段插值（逐通道独立，共用 `以本帧为起点` 的缓动）。
     *
     * <p>用户只填一列时（比如只写 y），其余通道要**沿用上一关键帧**而不是回到 0 ——
     * 否则"只想让它上下飘"会连带把 x 拽回原点。
     */
    private static TransformState interpolate(AnimationClip clip, double local) {
        List<Keyframe> keys = new ArrayList<>();
        if (clip.getKeys() != null) {
            for (Keyframe key : clip.getKeys()) {
                if (key != null) {
                    keys.add(key);
                }
            }
        }
        if (keys.isEmpty()) {
            return null;
        }
        keys.sort(Comparator.comparingInt(Keyframe::getF));

        TransformState state = TransformState.identity();
        for (AnimChannel channel : clip.resolvedChannels()) {
            state.set(channel, channelAt(keys, channel, local));
        }
        return state;
    }

    /** 单通道的分段插值 */
    private static double channelAt(List<Keyframe> keys, AnimChannel channel, double local) {
        int count = keys.size();
        double[] values = new double[count];
        double current = defaultValue(channel);
        boolean defined = false;
        for (int i = 0; i < count; i++) {
            Double raw = keys.get(i).channelValue(channel);
            if (raw != null && Double.isFinite(raw)) {
                current = raw;
                defined = true;
            }
            values[i] = current;
        }
        if (!defined) {
            return defaultValue(channel);
        }

        double firstFrame = keys.get(0).getF();
        double lastFrame = keys.get(count - 1).getF();
        if (local <= firstFrame) {
            return values[0];
        }
        if (local >= lastFrame) {
            return values[count - 1];
        }

        int segment = 0;
        while (segment < count - 1 && local >= keys.get(segment + 1).getF()) {
            segment++;
        }
        double from = keys.get(segment).getF();
        double to = keys.get(segment + 1).getF();
        double span = to - from;
        if (span <= 0d) {
            return values[segment + 1];
        }
        double progress = keys.get(segment).easing().apply(clamp01((local - from) / span));
        return values[segment] + (values[segment + 1] - values[segment]) * progress;
    }

    /**
     * 求值顺序：按 {@code priority} 升序（同级保持数组原序）。
     *
     * <p>加法/乘法的合成可交换，所以这个顺序只在 {@code replace} 通道上有实际意义：
     * priority 越大越晚算，越可能盖住别人 —— 也就是"优先级高的赢"。
     */
    public static List<AnimationClip> orderedClips(List<AnimationClip> clips) {
        List<AnimationClip> ordered = new ArrayList<>(clips);
        ordered.sort(Comparator.comparingInt(AnimationClip::getPriority));
        return ordered;
    }

    /** 通道的恒等值：缩放/透明度是 1，其余是 0 */
    public static double defaultValue(AnimChannel channel) {
        switch (channel) {
            case SCALE:
            case ALPHA:
                return 1d;
            default:
                return 0d;
        }
    }

    private static double clamp01(double value) {
        return Math.min(1d, Math.max(0d, value));
    }
}
