package com.lbc_plot.render.video.anim;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * @module 立绘动画求值内核
 * 程序化预设（L1）的 id 与元信息。
 *
 * <p>每个预设只声明"名字 + 影响哪些通道 + 默认参数"，真正的曲线在 {@link PresetRegistry} 里，
 * 参数表（标签/单位/范围）在前端 {@code presetRegistry.tsx} 里——因为参数表单是 UI 的事，
 * 后端只需要会算。
 *
 * <p>六条预设覆盖需求里点名的"弹跳、发抖"以及可扩展的"呼吸、摇摆、闪烁、缩放脉冲"。
 * 新增预设的完整步骤见 docs/立绘动画设计.md §6；后端这边只需要在这里加一个常量 +
 * 在 {@link PresetRegistry} 加一个分支 + 在共享夹具里加向量。
 */
public enum PresetId {

    /** 弹跳：向上弹起再落回，可带等比挤压 */
    BOUNCE("bounce", Arrays.asList(AnimChannel.Y, AnimChannel.SCALE)),

    /** 发抖：确定性抖动（jitter）或高频正弦（sine）；可带轻微旋转 */
    SHAKE("shake", Arrays.asList(AnimChannel.X, AnimChannel.Y, AnimChannel.ROTATE)),

    /** 呼吸：缓慢缩放 */
    BREATHE("breathe", Collections.singletonList(AnimChannel.SCALE)),

    /** 摇摆：绕锚点小幅旋转（立绘默认锚点在脚底，看起来像重心晃动） */
    SWAY("sway", Collections.singletonList(AnimChannel.ROTATE)),

    /** 闪烁：周期性降低不透明度 */
    BLINK("blink", Collections.singletonList(AnimChannel.ALPHA)),

    /** 缩放脉冲：一次放大回弹 */
    PULSE("pulse", Collections.singletonList(AnimChannel.SCALE));

    private final String code;
    private final List<AnimChannel> channels;

    PresetId(String code, List<AnimChannel> channels) {
        this.code = code;
        this.channels = channels;
    }

    public String getCode() {
        return code;
    }

    /** 本预设影响哪些通道（决定合成时动哪些通道） */
    public List<AnimChannel> channels() {
        return channels;
    }

    /** 解析预设 id；不认识返回 null（调用方跳过该 clip，不要抛异常） */
    public static PresetId of(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        for (PresetId id : values()) {
            if (id.code.equalsIgnoreCase(code.trim())) {
                return id;
            }
        }
        return null;
    }
}
