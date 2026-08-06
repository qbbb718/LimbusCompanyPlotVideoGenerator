package com.lbc_plot.render.audio.model;

/**
 * 音频操作指令类型枚举
 */
public enum AudioCommandType {
    BGM_ACTIVE, // 背景音乐活跃（在记录间持续）
    SFX_PLAY, // 音效播放
    VOICE_PLAY // 语音播放
}