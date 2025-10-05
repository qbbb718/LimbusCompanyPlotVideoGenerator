package com.lbc_plot.project.audio;

/**
 * 帧记录信息
 */
public class FrameRecord {
    private String recordId;
    private int startFrame;          // 在最终视频中的起始帧
    private int frameCount;          // 该Record的实际帧数
    private long startTimeMs;        // 起始时间（毫秒）
    private long durationMs;         // 持续时间（毫秒）

    // 构造函数
    public FrameRecord() {}
    
    public FrameRecord(String recordId, int startFrame, int frameCount) {
        this.recordId = recordId;
        this.startFrame = startFrame;
        this.frameCount = frameCount;
    }
    
    public FrameRecord(String recordId, int startFrame, int frameCount, long startTimeMs, long durationMs) {
        this.recordId = recordId;
        this.startFrame = startFrame;
        this.frameCount = frameCount;
        this.startTimeMs = startTimeMs;
        this.durationMs = durationMs;
    }

    // Getter 和 Setter 方法
    public String getRecordId() {
        return recordId;
    }

    public void setRecordId(String recordId) {
        this.recordId = recordId;
    }

    public int getStartFrame() {
        return startFrame;
    }

    public void setStartFrame(int startFrame) {
        this.startFrame = startFrame;
    }

    public int getFrameCount() {
        return frameCount;
    }

    public void setFrameCount(int frameCount) {
        this.frameCount = frameCount;
    }

    public long getStartTimeMs() {
        return startTimeMs;
    }

    public void setStartTimeMs(long startTimeMs) {
        this.startTimeMs = startTimeMs;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    // 便捷方法
    public int getEndFrame() {
        return startFrame + frameCount;
    }
    
    public boolean containsFrame(int frame) {
        return frame >= startFrame && frame < getEndFrame();
    }
    
    public double getDurationSeconds() {
        return durationMs / 1000.0;
    }
    
    @Override
    public String toString() {
        return "FrameRecord{" +
                "recordId='" + recordId + '\'' +
                ", frames=" + startFrame + "-" + getEndFrame() +
                ", frameCount=" + frameCount +
                ", duration=" + durationMs + "ms" +
                '}';
    }
}