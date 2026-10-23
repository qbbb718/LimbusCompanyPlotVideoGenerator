package com.lbc_plot.render.video.anim;

/**
 * @module 立绘动画求值内核
 * 动画通道：动画只按「通道」做增量，不同通道的合成规则不同（见 {@link BlendMode}）。
 *
 * <p>五个通道覆盖了本需求全部能力：
 * <ul>
 *   <li>{@link #X} / {@link #Y}：世界像素位移增量（不覆盖用户拖出来的摆位）；</li>
 *   <li>{@link #SCALE}：缩放乘子（1 = 原样）；</li>
 *   <li>{@link #ROTATE}：角度（度，顺时针为正，与 CSS / Java2D 同号）；</li>
 *   <li>{@link #ALPHA}：不透明度乘子（1 = 不透明）。</li>
 * </ul>
 *
 * <p>与前端 {@code features/record/animation/channels.ts} 一一对应，改这里要同步那边。
 */
public enum AnimChannel {

    X("x"),
    Y("y"),
    SCALE("scale"),
    ROTATE("rotate"),
    ALPHA("alpha");

    private final String code;

    AnimChannel(String code) {
        this.code = code;
    }

    /** JSON 里的通道名 */
    public String getCode() {
        return code;
    }

    /**
     * 该通道的默认合成方式。
     *
     * <p>位移与旋转做成「加法」（多个抖动/弹跳可以叠加），缩放与透明度做成「乘法」
     * （呼吸 × 脉冲），于是**默认组合可交换**——用户不必关心 clip 的先后顺序。
     */
    public BlendMode defaultBlend() {
        switch (this) {
            case SCALE:
            case ALPHA:
                return BlendMode.MUL;
            case X:
            case Y:
            case ROTATE:
            default:
                return BlendMode.ADD;
        }
    }

    /** 解析 JSON 通道名；不认识的一律返回 null（调用方负责忽略，不要抛异常） */
    public static AnimChannel of(String code) {
        if (code == null) {
            return null;
        }
        for (AnimChannel channel : values()) {
            if (channel.code.equalsIgnoreCase(code.trim())) {
                return channel;
            }
        }
        return null;
    }
}
