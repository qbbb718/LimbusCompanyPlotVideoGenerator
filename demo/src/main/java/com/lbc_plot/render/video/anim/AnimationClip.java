package com.lbc_plot.render.video.anim;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * @module 立绘动画求值内核
 * 一条动画片段：要么是一个**预设**（bounce / shake / … + 参数），要么是一段**关键帧**。
 *
 * <h2>为什么是"扁平单类 + kind 判别"而不是 Jackson 多态</h2>
 * 多态反序列化要写 {@code @JsonTypeInfo}，一旦 subtype 的 id 写错或旧版本软件读到不认识的
 * kind，就会**抛异常导致整个工程打不开**。扁平类 + 全字段默认值 + {@code ignoreUnknown}
 * 的最坏结果是"这条 clip 不生效"，不会连带整份工程。
 *
 * <h2>时间语义</h2>
 * 所有时长单位都是**帧**（30fps），与 {@code Camera.moveFrames} 完全一致。帧号驱动的好处是
 * 导出端"第 N 帧"与预览端"第 N 帧"天然对齐，不需要在两端各自维护一条时间轴。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class AnimationClip {

    /** 稳定 id（编辑器选中 / 删除 / 撤销用）；不参与求值 */
    private String id;

    /** "preset" 或 "keyframes" */
    private String kind;

    /** 缺省 true；false 时整条 clip 不参与求值，但数据保留 */
    private Boolean enabled;

    /** 延迟启动（帧，相对记录开头）；缺省 0 */
    private int startFrame;

    /**
     * 提前结束（绝对帧号）；缺省 {@code null} = 跟记录一起结束。
     *
     * <p><b>不要</b>把"记录时长"写进这个字段值：记录时长本身要由动画时长参与计算
     * （见 RecordDurationCalculator），写死会形成循环依赖。所以"缺省"只能是 null。
     *
     * <p>显式设置 endFrame 的 clip **不参与**记录时长计算（用户主动截断，意图明确）。
     */
    private Integer endFrame;

    /** 单次播放长度（帧） */
    private int durationFrames;

    /** once / loop / pingpong / hold，缺省 once */
    private String loop;

    /** 循环次数；缺省 null = 无限（仅 loop / pingpong 有意义） */
    private Integer iterations;

    /** 速度倍率（影响成片，不只是预览）；缺省 1 */
    private Double timeScale;

    /* ==================== 预设 ==================== */

    /** 预设 id：bounce / shake / breathe / sway / blink / pulse */
    private String preset;

    /** 预设参数（只支持数字 + 字符串写入预设里的固定项，如 style） */
    private Map<String, Object> params;

    /* ==================== 关键帧 ==================== */

    /** 本 clip 影响哪些通道；缺省 = 从 keys 里推 */
    private List<String> channels;

    /** 关键帧（按 f 升序；乱序由 {@link SpriteAnimator} 自行排序） */
    private List<Keyframe> keys;

    /* ==================== 通用 ==================== */

    /** add / mul / replace；缺省按通道默认（位移旋转加法、缩放透明度乘法） */
    private String blend;

    /** 覆盖优先级：越大越晚求值，越可能覆盖前面的 replace；缺省 0 */
    private int priority;

    /** 入场权重包络帧数；缺省 0（不淡入） */
    private int fadeInFrames;

    /** 出场权重包络帧数；缺省 0。loop 模式必须为 0，否则循环接缝会一淡一显 */
    private int fadeOutFrames;

    /** 播完的收尾：reset（回恒等）/ hold（停在最后一帧）；缺省 reset */
    private String onEnd;

    /* ==================== 预设来源（套用时写入，只读展示） ==================== */

    private String sourcePresetId;

    private Integer sourcePresetVersion;

    /**
     * 是否启用（null 视为启用）。
     *
     * <p>方法名刻意不叫 {@code isEnabled}：那会和 {@link #getEnabled()} 抢同一个 JSON 属性名，
     * Jackson 会以 "Conflicting getter definitions for property enabled" 直接炸掉整份工程的读取。
     */
    @JsonIgnore
    public boolean isEffectivelyEnabled() {
        return enabled == null || enabled;
    }

    @JsonIgnore
    public boolean isPresetClip() {
        return "preset".equalsIgnoreCase(kind) || (preset != null && !preset.isBlank());
    }

    @JsonIgnore
    public boolean isKeyframeClip() {
        return !isPresetClip();
    }

    /** 解析预设 id（不认识返回 null，调用方跳过该 clip） */
    @JsonIgnore
    public PresetId presetId() {
        return PresetId.of(preset);
    }

    /** 解析循环模式；不认识按 once（最保守：不会让记录意外变长） */
    @JsonIgnore
    public LoopMode loopMode() {
        return LoopMode.of(loop);
    }

    /** 是否无限循环（loop/pingpong 且没有 iterations 或 iterations <= 0） */
    @JsonIgnore
    public boolean isInfiniteLoop() {
        LoopMode mode = loopMode();
        if (mode != LoopMode.LOOP && mode != LoopMode.PINGPONG) {
            return false;
        }
        return iterations == null || iterations <= 0;
    }

    /** 指定通道的合成方式：clip.blend 优先，否则回落到通道默认 */
    public BlendMode blendModeFor(AnimChannel channel) {
        BlendMode explicit = BlendMode.of(blend);
        return explicit != null ? explicit : channel.defaultBlend();
    }

    /** 本 clip 影响哪些通道（预设走注册表，关键帧走 channels 或 keys 里出现过的通道） */
    public List<AnimChannel> resolvedChannels() {
        List<AnimChannel> result = new ArrayList<>();
        if (isPresetClip()) {
            PresetId id = presetId();
            if (id != null) {
                result.addAll(id.channels());
            }
            return result;
        }

        if (channels != null) {
            for (String code : channels) {
                AnimChannel channel = AnimChannel.of(code);
                if (channel != null && !result.contains(channel)) {
                    result.add(channel);
                }
            }
        }
        // channels 没写（或全是非法值）时，从关键帧里推
        if (result.isEmpty() && keys != null) {
            for (Keyframe key : keys) {
                if (key == null || key.getV() == null) {
                    continue;
                }
                for (AnimChannel channel : AnimChannel.values()) {
                    if (key.getV().get(channel) != null && !result.contains(channel)) {
                        result.add(channel);
                    }
                }
            }
        }
        return result;
    }

    /* ==================== 参数读取（预设用） ==================== */

    /** 读一个数字参数；缺失/非法回落到默认值 */
    public double paramDouble(String key, double fallback) {
        Object raw = params == null ? null : params.get(key);
        if (raw instanceof Number) {
            double value = ((Number) raw).doubleValue();
            return Double.isFinite(value) ? value : fallback;
        }
        if (raw instanceof String) {
            try {
                double value = Double.parseDouble(((String) raw).trim());
                return Double.isFinite(value) ? value : fallback;
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    /** 读一个整数参数 */
    public int paramInt(String key, int fallback) {
        return (int) Math.round(paramDouble(key, fallback));
    }

    /** 读一个字符串参数（如 shake 的 style） */
    public String paramString(String key, String fallback) {
        Object raw = params == null ? null : params.get(key);
        if (raw == null) {
            return fallback;
        }
        String text = String.valueOf(raw).trim();
        return text.isEmpty() ? fallback : text;
    }

    /* ==================== getter / setter ==================== */

    @JsonProperty
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    @JsonProperty
    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    @JsonProperty
    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    @JsonProperty
    public int getStartFrame() {
        return startFrame;
    }

    public void setStartFrame(int startFrame) {
        this.startFrame = startFrame;
    }

    @JsonProperty
    public Integer getEndFrame() {
        return endFrame;
    }

    public void setEndFrame(Integer endFrame) {
        this.endFrame = endFrame;
    }

    @JsonProperty
    public int getDurationFrames() {
        return durationFrames;
    }

    public void setDurationFrames(int durationFrames) {
        this.durationFrames = durationFrames;
    }

    @JsonProperty
    public String getLoop() {
        return loop;
    }

    public void setLoop(String loop) {
        this.loop = loop;
    }

    @JsonProperty
    public Integer getIterations() {
        return iterations;
    }

    public void setIterations(Integer iterations) {
        this.iterations = iterations;
    }

    @JsonProperty
    public Double getTimeScale() {
        return timeScale;
    }

    public void setTimeScale(Double timeScale) {
        this.timeScale = timeScale;
    }

    @JsonIgnore
    public double timeScaleOrDefault() {
        return timeScale == null || !Double.isFinite(timeScale) || timeScale <= 0 ? 1d : timeScale;
    }

    @JsonProperty
    public String getPreset() {
        return preset;
    }

    public void setPreset(String preset) {
        this.preset = preset;
    }

    @JsonProperty
    public Map<String, Object> getParams() {
        return params;
    }

    public void setParams(Map<String, Object> params) {
        this.params = params;
    }

    @JsonProperty
    public List<String> getChannels() {
        return channels;
    }

    public void setChannels(List<String> channels) {
        this.channels = channels;
    }

    @JsonProperty
    public List<Keyframe> getKeys() {
        return keys;
    }

    public void setKeys(List<Keyframe> keys) {
        this.keys = keys;
    }

    @JsonProperty
    public String getBlend() {
        return blend;
    }

    public void setBlend(String blend) {
        this.blend = blend;
    }

    @JsonProperty
    public int getPriority() {
        return priority;
    }

    public void setPriority(int priority) {
        this.priority = priority;
    }

    @JsonProperty
    public int getFadeInFrames() {
        return fadeInFrames;
    }

    public void setFadeInFrames(int fadeInFrames) {
        this.fadeInFrames = fadeInFrames;
    }

    @JsonProperty
    public int getFadeOutFrames() {
        return fadeOutFrames;
    }

    public void setFadeOutFrames(int fadeOutFrames) {
        this.fadeOutFrames = fadeOutFrames;
    }

    @JsonProperty
    public String getOnEnd() {
        return onEnd;
    }

    public void setOnEnd(String onEnd) {
        this.onEnd = onEnd;
    }

    @JsonProperty
    public String getSourcePresetId() {
        return sourcePresetId;
    }

    public void setSourcePresetId(String sourcePresetId) {
        this.sourcePresetId = sourcePresetId;
    }

    @JsonProperty
    public Integer getSourcePresetVersion() {
        return sourcePresetVersion;
    }

    public void setSourcePresetVersion(Integer sourcePresetVersion) {
        this.sourcePresetVersion = sourcePresetVersion;
    }

    @Override
    public String toString() {
        return "AnimationClip{" + (isPresetClip() ? "preset=" + preset : "keyframes=" + (keys == null ? 0 : keys.size()))
                + ", start=" + startFrame + ", duration=" + durationFrames + ", loop=" + loop + '}';
    }
}
