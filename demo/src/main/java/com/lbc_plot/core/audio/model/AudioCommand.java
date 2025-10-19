package com.lbc_plot.core.audio.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;


/**
 * 音频操作指令-Record中
 */
public class AudioCommand {
    private AudioCommandType type;    // BGM_START, BGM_STOP, SFX_PLAY, VOICE_PLAY
    private String audioId;           // 音频文件标识
    private Float volume;             // 音量
    private Integer fadeDuration;     // 淡入淡出帧数

    // 构造函数
    public AudioCommand() {}
    
    public AudioCommand(AudioCommandType type, String audioId) {
        this.type = type;
        this.audioId = audioId;
    }
    
    public AudioCommand(AudioCommandType type, String audioId, Float volume) {
        this.type = type;
        this.audioId = audioId;
        this.volume = volume;
    }
    
    public AudioCommand(AudioCommandType type, String audioId, Float volume, Integer fadeDuration) {
        this.type = type;
        this.audioId = audioId;
        this.volume = volume;
        this.fadeDuration = fadeDuration;
    }

    // Getter 和 Setter 方法
    public AudioCommandType getType() {
        return type;
    }

    public void setType(AudioCommandType type) {
        this.type = type;
    }

    public String getAudioId() {
        return audioId;
    }

    public void setAudioId(String audioId) {
        this.audioId = audioId;
    }

    public Float getVolume() {
        return volume;
    }

    public void setVolume(Float volume) {
        this.volume = volume;
    }

    public Integer getFadeDuration() {
        return fadeDuration;
    }

    public void setFadeDuration(Integer fadeDuration) {
        this.fadeDuration = fadeDuration;
    }

    // 便捷方法
    public boolean isBgmCommand() {
        return type == AudioCommandType.BGM_START || type == AudioCommandType.BGM_STOP;
    }
    
    public boolean isPlayCommand() {
        return type == AudioCommandType.SFX_PLAY || type == AudioCommandType.VOICE_PLAY;
    }
    
    @Override
    public String toString() {
        return "AudioCommand{" +
                "type=" + type +
                ", audioId='" + audioId + '\'' +
                ", volume=" + volume +
                ", fadeDuration=" + fadeDuration +
                '}';
    }
}