package com.lbc_plot.model.storage;

/**
 * 情绪枚举，用于立绘自动匹配
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

    public String getDisplayName() {
        return displayName;
    }

    public String getCode() {
        return code;
    }

    public static Emotion fromString(String value) {
        return value == null ? null : Emotion.valueOf(value);
    }

    

    /**
     * 根据代码获取情绪枚举
     */
    public static Emotion fromCode(String code) {
        for (Emotion emotion : values()) {
            if (emotion.code.equals(code)) {
                return emotion;
            }
        }
        return NORMAL;
    }
}
