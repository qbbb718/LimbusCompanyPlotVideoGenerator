package com.lbc_plot.render.video.anim;

/**
 * @module 立绘动画求值内核
 * 缓动曲线：与摄像机（{@code Camera.ease} / 前端 {@code cameraView.easeProgress}）**同一组**曲线。
 *
 * <p>刻意不提供 cubic-bezier：两端各写一遍 Newton 迭代会在浮点末位分叉，最后一位不同就足以让
 * "预览与成片一致"的验收失败。真要做自定义曲线，走"共享采样表 + 线性插值"，不要各写算法。
 */
public enum Easing {

    LINEAR("linear") {
        @Override
        public double apply(double t) {
            return t;
        }
    },
    EASE_IN("easeIn") {
        @Override
        public double apply(double t) {
            return t * t * t;
        }
    },
    EASE_OUT("easeOut") {
        @Override
        public double apply(double t) {
            double inv = 1d - t;
            return 1d - inv * inv * inv;
        }
    },
    EASE_IN_OUT("easeInOut") {
        @Override
        public double apply(double t) {
            if (t < 0.5d) {
                return 4d * t * t * t;
            }
            double inv = 1d - t;
            return 1d - 4d * inv * inv * inv;
        }
    },
    /**
     * 阶跃：一直保持前一个关键帧的值，直到下一个关键帧才跳过去。
     *
     * <p>{@code t >= 1} 时返回 1，这样 {@code lerp(prev, next, p)} 在段末正好落到 next。
     */
    STEP("step") {
        @Override
        public double apply(double t) {
            return t >= 1d ? 1d : 0d;
        }
    };

    private final String code;

    Easing(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    /**
     * 缓动进度：入参出参都是 0~1。
     *
     * @param t 线性进度（调用方负责先 clamp）
     */
    public abstract double apply(double t);

    /** 解析 JSON 里的缓动名；不认识 / 为空一律 linear（缺省值，与摄像机一致） */
    public static Easing of(String code) {
        if (code == null || code.isBlank()) {
            return LINEAR;
        }
        for (Easing easing : values()) {
            if (easing.code.equalsIgnoreCase(code.trim())) {
                return easing;
            }
        }
        return LINEAR;
    }
}
