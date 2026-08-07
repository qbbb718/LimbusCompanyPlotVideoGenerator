package com.lbc_plot.render.audio.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 音频操作指令类型枚举
 */
public enum AudioCommandType {
    BGM_ACTIVE, // 背景音乐活跃（在记录间持续）
    SFX_PLAY, // 音效播放
    VOICE_PLAY; // 语音播放

    /** 序列化为大写名称（如 "BGM_ACTIVE"） */
    @JsonValue
    public String toValue() {
        return name();
    }

    /** 大小写不敏感 + 前端别名兼容 ("bgm"→BGM_ACTIVE, "voice"→VOICE_PLAY, "sfx"→SFX_PLAY) */
    @JsonCreator
    public static AudioCommandType fromString(String value) {
        if (value == null) return BGM_ACTIVE;
        String upper = value.toUpperCase();
        switch (upper) {
            case "BGM":
            case "BGM_ACTIVE":
                return BGM_ACTIVE;
            case "VOICE":
            case "VOICE_PLAY":
                return VOICE_PLAY;
            case "SFX":
            case "SFX_PLAY":
                return SFX_PLAY;
            default:
                try {
                    return AudioCommandType.valueOf(upper);
                } catch (IllegalArgumentException e) {
                    return BGM_ACTIVE;
                }
        }
    }
}