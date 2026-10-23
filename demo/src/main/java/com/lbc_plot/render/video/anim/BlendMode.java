package com.lbc_plot.render.video.anim;

/**
 * @module 立绘动画求值内核
 * 通道合成方式。
 *
 * <p>{@link #ADD} 与 {@link #MUL} 都满足交换律与结合律，所以"弹跳 + 抖动 + 呼吸"这类组合
 * 的结果与 clip 顺序无关；只有 {@link #REPLACE} 会互相覆盖（按 priority 升序求值，
 * 后求值的覆盖先求值的）。
 *
 * <p>与前端 {@code features/record/animation/channels.ts} 的 BlendMode 一一对应。
 */
public enum BlendMode {

    /** 相加：{@code T + c·w} */
    ADD("add"),

    /** 相乘（围绕 1 插值）：{@code T · (1 + (c − 1)·w)} */
    MUL("mul"),

    /** 覆盖（围绕当前值插值）：{@code T + (c − T)·w} */
    REPLACE("replace");

    private final String code;

    BlendMode(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    /**
     * 合成一个通道。
     *
     * @param base 已累积的值（恒等值起步：位移/旋转 0、缩放/透明度 1）
     * @param value clip 在本帧贡献的值
     * @param weight 权重包络（0~1，见 {@link SpriteAnimator#envelope}）
     * @return 合成后的值
     */
    public double compose(double base, double value, double weight) {
        switch (this) {
            case MUL:
                return base * (1d + (value - 1d) * weight);
            case REPLACE:
                return base + (value - base) * weight;
            case ADD:
            default:
                return base + value * weight;
        }
    }

    /** 解析 JSON 里的合成方式；不认识的一律回落到通道默认值（调用方传 null 即可） */
    public static BlendMode of(String code) {
        if (code == null) {
            return null;
        }
        for (BlendMode mode : values()) {
            if (mode.code.equalsIgnoreCase(code.trim())) {
                return mode;
            }
        }
        return null;
    }
}
