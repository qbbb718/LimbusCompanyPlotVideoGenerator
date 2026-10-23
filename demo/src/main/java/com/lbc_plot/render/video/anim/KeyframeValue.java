package com.lbc_plot.render.video.anim;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * @module 立绘动画求值内核
 * 关键帧的「值」：只写需要变化的通道，其余通道为 {@code null}（表示"沿用上一关键帧"）。
 *
 * <p>用可空的 {@code Double} 而不是 {@code double}，是为了区分"没写这个通道"与"写成了 0"——
 * 前者要继承上一帧，后者是明确要回到 0。这是关键帧表格允许用户只填一列的前提。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public final class KeyframeValue {

    private Double x;
    private Double y;
    private Double scale;
    private Double rotate;
    private Double alpha;

    /** 取某个通道的值；没写返回 null（调用方负责继承） */
    public Double get(AnimChannel channel) {
        switch (channel) {
            case X:
                return x;
            case Y:
                return y;
            case SCALE:
                return scale;
            case ROTATE:
                return rotate;
            case ALPHA:
                return alpha;
            default:
                return null;
        }
    }

    /** 是否完全没有写任何通道（这种关键帧等价于"重复上一帧"，插值时会退化为常值） */
    public boolean isEmpty() {
        return x == null && y == null && scale == null && rotate == null && alpha == null;
    }

    @JsonProperty
    public Double getX() {
        return x;
    }

    public void setX(Double x) {
        this.x = x;
    }

    @JsonProperty
    public Double getY() {
        return y;
    }

    public void setY(Double y) {
        this.y = y;
    }

    @JsonProperty
    public Double getScale() {
        return scale;
    }

    public void setScale(Double scale) {
        this.scale = scale;
    }

    @JsonProperty
    public Double getRotate() {
        return rotate;
    }

    public void setRotate(Double rotate) {
        this.rotate = rotate;
    }

    @JsonProperty
    public Double getAlpha() {
        return alpha;
    }

    public void setAlpha(Double alpha) {
        this.alpha = alpha;
    }
}
