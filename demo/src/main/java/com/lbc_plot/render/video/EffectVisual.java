package com.lbc_plot.render.video;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * @model 记录级特效
 *
 *        <p>特效不是素材贴图，而是"这条记录在渲染视频时要额外做的一件事"。目前这一族特效都是
 *        <b>起始转场</b>——视频开头把一层图像盖在本条记录上方再让它淡出（具体帧数、不透明度与
 *        三种转场的叠加内容见 {@link StartTransition}）：
 *        <ul>
 *        <li>{@link #TYPE_CROSS_DISSOLVE 交叉溶解}：叠上一条记录的最后一帧；</li>
 *        <li>{@link #TYPE_FADE_FROM_BLACK 黑屏转场}：叠纯黑，从黑屏淡入；</li>
 *        <li>{@link #TYPE_FADE_FROM_WHITE 白屏转场}：叠纯白，从白屏淡入。</li>
 *        </ul>
 *
 *        <p>特效列表会跟记录一起序列化（工程文件、导出视频请求都带着它），
 *        所以一张记录在别人的机器上打开时特效仍然有效；渲染时只认
 *        {@link StartTransition#kindOf(com.lbc_plot.plot.model.Record)}，未知类型会被安全忽略，
 *        方便以后继续加特效而不影响旧工程。
 *
 * @relatesTo com.lbc_plot.plot.model.Record#getEffects()
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class EffectVisual extends VisualElement {

    /** 交叉溶解：视频开头叠加前一条记录的最后一帧（不透明度 100% → 0%，共 {@link StartTransition#FRAMES} 帧） */
    public static final String TYPE_CROSS_DISSOLVE = "CROSS_DISSOLVE";

    /** 黑屏转场：视频开头叠一层纯黑再淡出，即从黑屏淡入（共 {@link StartTransition#FRAMES} 帧） */
    public static final String TYPE_FADE_FROM_BLACK = "FADE_FROM_BLACK";

    /** 白屏转场：视频开头叠一层纯白再淡出，即从白屏淡入（共 {@link StartTransition#FRAMES} 帧） */
    public static final String TYPE_FADE_FROM_WHITE = "FADE_FROM_WHITE";

    /** 特效类型，取值见 {@code TYPE_*} 常量 */
    private String type;

    /**
     * 是否勾选/启用；缺省（JSON 里没写这个字段）按启用处理，
     * 这样手写的/旧版本的工程里只写了 {@code "type"} 的特效也能生效。
     */
    private boolean enabled = true;

    /** Jackson 反序列化需要无参构造器 */
    public EffectVisual() {
    }

    public EffectVisual(String type) {
        this.type = type;
    }

    /**
     * @function 创建"交叉溶解"特效条目
     * @return 已启用的交叉溶解特效
     */
    public static EffectVisual crossDissolve() {
        return new EffectVisual(TYPE_CROSS_DISSOLVE);
    }

    /**
     * @function 创建"黑屏转场"特效条目
     * @return 已启用的黑屏转场特效
     */
    public static EffectVisual fadeFromBlack() {
        return new EffectVisual(TYPE_FADE_FROM_BLACK);
    }

    /**
     * @function 创建"白屏转场"特效条目
     * @return 已启用的白屏转场特效
     */
    public static EffectVisual fadeFromWhite() {
        return new EffectVisual(TYPE_FADE_FROM_WHITE);
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    /**
     * @function 判断这条特效是不是"已启用的交叉溶解"
     * @return 类型匹配且勾选时返回 true
     */
    @JsonIgnore
    public boolean isCrossDissolve() {
        return isEnabledType(TYPE_CROSS_DISSOLVE);
    }

    /**
     * @function 判断这条特效是不是"已启用的黑屏转场"
     * @return 类型匹配且勾选时返回 true
     */
    @JsonIgnore
    public boolean isFadeFromBlack() {
        return isEnabledType(TYPE_FADE_FROM_BLACK);
    }

    /**
     * @function 判断这条特效是不是"已启用的白屏转场"
     * @return 类型匹配且勾选时返回 true
     */
    @JsonIgnore
    public boolean isFadeFromWhite() {
        return isEnabledType(TYPE_FADE_FROM_WHITE);
    }

    /**
     * @function 判断这条特效是不是任意一种"已启用的起始转场"
     * @return 交叉溶解 / 黑屏 / 白屏之一且已勾选时返回 true
     */
    @JsonIgnore
    public boolean isStartTransition() {
        return isCrossDissolve() || isFadeFromBlack() || isFadeFromWhite();
    }

    /**
     * 类型 + 勾选状态的统一判断（三种转场共用，避免每加一种就抄一遍 equalsIgnoreCase）。
     *
     * @param expectedType {@code TYPE_*} 常量
     * @return 已勾选且类型匹配时返回 true
     */
    private boolean isEnabledType(String expectedType) {
        return enabled && type != null && expectedType.equalsIgnoreCase(type);
    }

    @Override
    public String toString() {
        return "EffectVisual{type='" + type + "', enabled=" + enabled + '}';
    }
}
