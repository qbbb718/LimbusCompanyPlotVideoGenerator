package com.lbc_plot.project.audio;

public class AudioCommand {
    private String audioFile;      // 音频文件路径
    private AudioCommandType type; // 操作类型（START/LOOP/STOP）
    private int startFrame;

    // 构造方法
    public AudioCommand(String audioFile, AudioCommandType type) {
        this.audioFile = audioFile;
        this.type = type;
    }

    // Getter 方法
    public AudioCommandType getType() {
        return type;
    }

    public String getAudioFile() {
        return audioFile;
    }

    public int getStartFrame() {
        return startFrame;
    }

    // Setter 方法
    public void setStartFrame(int startFrame) {
        this.startFrame = startFrame;
    }
}