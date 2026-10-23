package com.lbc_plot.render.video.anim;

/**
 * @module 立绘动画求值内核
 * 一帧的变换结果（五个通道，全部是「相对静态姿态的增量」）。
 *
 * <p>恒等值 = {@code x=0, y=0, scale=1, rotate=0, alpha=1}。没有动画时必须返回恒等，
 * 这样渲染端可以走"完全不变"的旧路径，保证旧工程逐像素不变。
 *
 * <p>本类只用于运行时求值，不进入工程 JSON（JSON 里的关键帧值用 {@link KeyframeValue}，
 * 因为它是「部分通道」）。
 *
 * <p>与前端 {@code features/record/animation/animationTypes.ts} 的 {@code TransformState} 一一对应。
 */
public final class TransformState {

    private double x;
    private double y;
    private double scale = 1d;
    private double rotate;
    private double alpha = 1d;

    /** 恒等变换：不动、不缩放、不旋转、不透明 */
    public static TransformState identity() {
        return new TransformState();
    }

    public TransformState copy() {
        TransformState copy = new TransformState();
        copy.x = x;
        copy.y = y;
        copy.scale = scale;
        copy.rotate = rotate;
        copy.alpha = alpha;
        return copy;
    }

    /** 取某一通道的值 */
    public double get(AnimChannel channel) {
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
                return 0d;
        }
    }

    /** 写某一通道的值 */
    public void set(AnimChannel channel, double value) {
        switch (channel) {
            case X:
                x = value;
                break;
            case Y:
                y = value;
                break;
            case SCALE:
                scale = value;
                break;
            case ROTATE:
                rotate = value;
                break;
            case ALPHA:
                alpha = value;
                break;
            default:
                break;
        }
    }

    /**
     * 是否等于恒等变换（容差与前端 {@code isIdentity} 一致）。
     *
     * <p>渲染端用它在"无动画"时跳过整条仿射路径——所以容差不能太小（浮点插值会带来 1e-15 级噪声），
     * 也不能太大（0.01 世界像素已经是肉眼不可见的最坏情况）。
     */
    public boolean isIdentity() {
        return Math.abs(x) < 0.01
                && Math.abs(y) < 0.01
                && Math.abs(scale - 1d) < 1e-4
                && Math.abs(rotate) < 1e-4
                && Math.abs(alpha - 1d) < 1e-4;
    }

    public double getX() {
        return x;
    }

    public void setX(double x) {
        this.x = x;
    }

    public double getY() {
        return y;
    }

    public void setY(double y) {
        this.y = y;
    }

    public double getScale() {
        return scale;
    }

    public void setScale(double scale) {
        this.scale = scale;
    }

    public double getRotate() {
        return rotate;
    }

    public void setRotate(double rotate) {
        this.rotate = rotate;
    }

    public double getAlpha() {
        return alpha;
    }

    public void setAlpha(double alpha) {
        this.alpha = alpha;
    }

    @Override
    public String toString() {
        return String.format(
                "TransformState{x=%.6f, y=%.6f, scale=%.6f, rotate=%.6f, alpha=%.6f}",
                x, y, scale, rotate, alpha);
    }
}
