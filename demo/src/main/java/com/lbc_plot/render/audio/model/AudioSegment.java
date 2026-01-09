package com.lbc_plot.render.audio.model;

/**
 * 音频片段
 */
public class AudioSegment {
    private String audioId;
    private int startFrame; // 开始帧
    private int endFrame; // 结束帧
    private AudioCommandType type; // 音频类型
    private float volume; // 音量

    // 构造函数
    public AudioSegment() {
    }

    public AudioSegment(String audioId, int startFrame, int endFrame, AudioCommandType type) {
        this.audioId = audioId;
        this.startFrame = startFrame;
        this.endFrame = endFrame;
        this.type = type;
        this.volume = 1.0f; // 默认音量
    }

    public AudioSegment(String audioId, int startFrame, int endFrame, AudioCommandType type, float volume) {
        this.audioId = audioId;
        this.startFrame = startFrame;
        this.endFrame = endFrame;
        this.type = type;
        this.volume = volume;
    }

    // Getter 和 Setter 方法
    public String getAudioId() {
        return audioId;
    }

    public void setAudioId(String audioId) {
        this.audioId = audioId;
    }

    public int getStartFrame() {
        return startFrame;
    }

    public void setStartFrame(int startFrame) {
        this.startFrame = startFrame;
    }

    public int getEndFrame() {
        return endFrame;
    }

    public void setEndFrame(int endFrame) {
        this.endFrame = endFrame;
    }

    public AudioCommandType getType() {
        return type;
    }

    public void setType(AudioCommandType type) {
        this.type = type;
    }

    public float getVolume() {
        return volume;
    }

    public void setVolume(float volume) {
        this.volume = volume;
    }

    // 便捷方法
    public int getDurationFrames() {
        return endFrame - startFrame;
    }

    public boolean isBgmSegment() {
        return type == AudioCommandType.BGM_ACTIVE;
    }

    public boolean overlapsWith(AudioSegment other) {
        return this.startFrame < other.endFrame && other.startFrame < this.endFrame;
    }

    public boolean containsFrame(int frame) {
        return frame >= startFrame && frame < endFrame;
    }

    @Override
    public String toString() {
        return "AudioSegment{" +
                "audioId='" + audioId + '\'' +
                ", frames=" + startFrame + "-" + endFrame +
                ", type=" + type +
                ", volume=" + volume +
                ", duration=" + getDurationFrames() + " frames" +
                '}';
    }
}