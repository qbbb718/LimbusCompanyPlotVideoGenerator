package com.lbc_plot.render.video.anim;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * @module 立绘动画求值内核
 * 挂在**一个**立绘 / 临时图片身上的整套动画：时间基准 + 锚点 + 若干 clip。
 *
 * <p>本类随记录序列化（{@code CharacterVisual.anim} / {@code TempImageVisual.anim}）。
 * 没有这个字段的旧工程 → 反序列化为 null → 渲染走原路径 → **逐像素不变**。
 *
 * <p>与前端 {@code animationTypes.ts} 的 {@code SpriteAnimation} 一一对应。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class SpriteAnimation {

    /** 数据版本；将来加字段时用它做迁移判断 */
    private Integer version = 1;

    /** 时间基准（帧 + 帧率断言），见 {@link Timebase} */
    private Timebase timebase;

    /** 缺省 true；false 时整套动画不参与（数据保留） */
    private Boolean enabled;

    /** 锚点（0~1，元素自身的相对位置）；null = 用元素类型的默认值 */
    private Anchor anchor;

    /** 动画片段（数组顺序 = 叠加顺序，仅在 replace 模式下有意义） */
    private List<AnimationClip> clips;

    /**
     * 是否启用（null 视为启用）。
     *
     * <p>不叫 {@code isEnabled}：会与 {@link #getEnabled()} 撞同一个 JSON 属性名，
     * Jackson 会抛 "Conflicting getter definitions"。
     */
    @JsonIgnore
    public boolean isEffectivelyEnabled() {
        return enabled == null || enabled;
    }

    /**
     * 是否"真的会动"。
     *
     * <p>渲染端用它在**没有动画时完全跳过**动画路径（保住"旧工程逐像素不变"与导出耗时），
     * 所以判定必须保守：至少一条启用 + 有时长 + 预设/关键帧有效的 clip 才算。
     */
    @JsonIgnore
    public boolean isAnimated() {
        if (!isEffectivelyEnabled() || clips == null || clips.isEmpty()) {
            return false;
        }
        for (AnimationClip clip : clips) {
            if (clip == null || !clip.isEffectivelyEnabled() || clip.getDurationFrames() <= 0) {
                continue;
            }
            if (clip.isPresetClip()) {
                if (clip.presetId() != null) {
                    return true;
                }
            } else if (clip.resolvedChannels() != null && !clip.resolvedChannels().isEmpty()) {
                return true;
            }
        }
        return false;
    }

    /**
     * 取锚点；没配时用调用方给的类型默认值。
     *
     * @param defaultX 立绘传 0.5、临时图片传 0.5
     * @param defaultY 立绘传 1.0（脚底，弹跳/摇摆的中心）、临时图片传 0.5（中心）
     */
    @JsonIgnore
    public Anchor anchorOrDefault(double defaultX, double defaultY) {
        if (anchor == null) {
            return new Anchor(defaultX, defaultY);
        }
        double x = Double.isFinite(anchor.getX()) ? clamp01(anchor.getX()) : defaultX;
        double y = Double.isFinite(anchor.getY()) ? clamp01(anchor.getY()) : defaultY;
        return new Anchor(x, y);
    }

    private static double clamp01(double value) {
        return Math.min(1d, Math.max(0d, value));
    }

    @JsonProperty
    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer version) {
        this.version = version;
    }

    @JsonProperty
    public Timebase getTimebase() {
        return timebase;
    }

    public void setTimebase(Timebase timebase) {
        this.timebase = timebase;
    }

    @JsonProperty
    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    @JsonProperty
    public Anchor getAnchor() {
        return anchor;
    }

    public void setAnchor(Anchor anchor) {
        this.anchor = anchor;
    }

    @JsonProperty
    public List<AnimationClip> getClips() {
        return clips;
    }

    public void setClips(List<AnimationClip> clips) {
        this.clips = clips;
    }

    @Override
    public String toString() {
        return "SpriteAnimation{version=" + version + ", clips=" + (clips == null ? 0 : clips.size())
                + ", enabled=" + isEffectivelyEnabled() + '}';
    }

    /**
     * 时间基准。
     *
     * <p>{@code fps} 不是配置项而是**契约断言**：全项目帧率恒为 30，动画数据里的时长也一律按帧存。
     * 哪天要支持 60fps，读到 {@code fps != 30} 必须走迁移（按比例换算或重新录制），
     * 而不是当成"另一个配置"静默按帧数执行——那会让所有动画时长凭空翻倍。
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Timebase {

        private String unit = "frame";

        private int fps = 30;

        public Timebase() {
        }

        public Timebase(String unit, int fps) {
            this.unit = unit;
            this.fps = fps;
        }

        @JsonProperty
        public String getUnit() {
            return unit;
        }

        public void setUnit(String unit) {
            this.unit = unit;
        }

        @JsonProperty
        public int getFps() {
            return fps;
        }

        public void setFps(int fps) {
            this.fps = fps;
        }

        /** 帧率与项目约定（30）不一致（用于告警，不阻断渲染） */
        @JsonIgnore
        public boolean isForeignFrameRate() {
            return fps > 0 && fps != 30;
        }
    }

    /** 锚点：元素自身盒子里的相对位置（0 = 左/上，1 = 右/下） */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Anchor {

        private double x = 0.5d;

        private double y = 0.5d;

        public Anchor() {
        }

        public Anchor(double x, double y) {
            this.x = x;
            this.y = y;
        }

        @JsonProperty
        public double getX() {
            return x;
        }

        public void setX(double x) {
            this.x = x;
        }

        @JsonProperty
        public double getY() {
            return y;
        }

        public void setY(double y) {
            this.y = y;
        }
    }
}
