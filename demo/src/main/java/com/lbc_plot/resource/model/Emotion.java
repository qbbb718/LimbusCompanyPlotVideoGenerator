package com.lbc_plot.resource.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * 角色立绘情绪枚举
 */
public enum Emotion {
    NORMAL("正常", "normal"),
    HAPPY("开心", "happy"),
    ANGRY("生气", "angry"),
    SAD("悲伤", "sad"),
    SURPRISED("惊讶", "surprised"),
    CONFUSED("困惑", "confused"),
    BLUSH("害羞", "blush"),
    HURT("受伤", "hurt");

    private final String displayName;
    private final String code;

    Emotion(String displayName, String code) {
        this.displayName = displayName;
        this.code = code;
    }

    @JsonValue
    public String getCode() {
        return code;
    }

    @JsonCreator
    public static Emotion fromString(String input) {
        if (input == null)
            return NORMAL;

        String lowerInput = input.toLowerCase();
        for (Emotion e : values()) {
            if (e.code.equals(lowerInput)) {
                return e;
            }
        }

        try {
            return Emotion.valueOf(input.toUpperCase());
        } catch (IllegalArgumentException e) {
            return NORMAL;
        }
    }

    // 保留基础业务方法（无JSON相关注释）
    public String getDisplayName() {
        return displayName;
    }

    public static Emotion fromCode(String code) {
        return fromString(code);
    }
}