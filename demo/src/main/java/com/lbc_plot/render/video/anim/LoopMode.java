package com.lbc_plot.render.video.anim;

/**
 * @module 立绘动画求值内核
 * 循环模式。
 *
 * <ul>
 *   <li>{@link #ONCE}：播一次就结束（收尾方式见 {@code AnimationClip.onEnd}）；</li>
 *   <li>{@link #LOOP}：取模，首尾相接（要求 durationFrames 是周期帧数的整数倍才不跳）；</li>
 *   <li>{@link #PINGPONG}：三角波往返，天然无接缝；</li>
 *   <li>{@link #HOLD}：播完停在最后一帧（做"定格"用）。</li>
 * </ul>
 *
 * <p>与前端 {@code animationTypes.ts} 的 {@code LoopMode} 一一对应。
 */
public enum LoopMode {

    ONCE("once"),
    LOOP("loop"),
    PINGPONG("pingpong"),
    HOLD("hold");

    private final String code;

    LoopMode(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    /**
     * 解析循环模式：不认识 / 为空一律回落 {@link #ONCE}。
     *
     * <p>缺省必须是 once 而不是 loop —— 一个写错的 loop 会让"记录时长有没有被动画撑长"这件事
     * 变得不可预测（无限循环不参与时长计算，见 RecordDurationCalculator）。
     */
    public static LoopMode of(String code) {
        if (code == null || code.isBlank()) {
            return ONCE;
        }
        for (LoopMode mode : values()) {
            if (mode.code.equalsIgnoreCase(code.trim())) {
                return mode;
            }
        }
        return ONCE;
    }
}
