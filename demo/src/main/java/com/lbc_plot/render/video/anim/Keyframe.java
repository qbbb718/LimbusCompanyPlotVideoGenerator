package com.lbc_plot.render.video.anim;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * @module 立绘动画求值内核
 * 一个关键帧。
 *
 * <p>{@code f} 是**相对 clip 起点的帧号**（整数），不是绝对帧：这样同一份 clip 可以被
 * startFrame 平移到任意位置，也能被 loop 反复播放。
 *
 * <p>{@code ease} 属于「以本帧为起点的那一段」（f → 下一个关键帧），不是"到达本帧"的曲线。
 * 这条约定与前端 {@code keyframeEngine.ts} 必须一致，否则曲线会反着走。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public final class Keyframe {

    /** 相对 clip 起点的帧号（整数，>= 0） */
    private int f;

    /** 本帧的值（只写变化的通道） */
    private KeyframeValue v;

    /** 本段缓动：linear / easeIn / easeOut / easeInOut / step */
    private String ease;

    /** 阶跃标记；为 true 时等价于 {@code ease = "step"} */
    private boolean hold;

    public Keyframe() {
    }

    public Keyframe(int f, KeyframeValue v) {
        this.f = f;
        this.v = v;
    }

    /** 解析后的缓动：hold 优先，其余走 {@link Easing#of(String)} */
    public Easing easing() {
        if (hold) {
            return Easing.STEP;
        }
        return Easing.of(ease);
    }

    /** 取某通道的值（没写返回 null） */
    public Double channelValue(AnimChannel channel) {
        return v == null ? null : v.get(channel);
    }

    @JsonProperty
    public int getF() {
        return f;
    }

    public void setF(int f) {
        this.f = f;
    }

    @JsonProperty
    public KeyframeValue getV() {
        return v;
    }

    public void setV(KeyframeValue v) {
        this.v = v;
    }

    @JsonProperty
    public String getEase() {
        return ease;
    }

    public void setEase(String ease) {
        this.ease = ease;
    }

    @JsonProperty
    public boolean isHold() {
        return hold;
    }

    public void setHold(boolean hold) {
        this.hold = hold;
    }
}
