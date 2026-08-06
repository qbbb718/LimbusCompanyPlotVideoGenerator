package com.lbc_plot.render.audio;

public class FrameInfo {
    private final String recordId;
    private final int startFrame;
    private final int frameCount;

    public FrameInfo(String recordId, int startFrame, int frameCount) {
        this.recordId = recordId;
        this.startFrame = startFrame;
        this.frameCount = frameCount;
    }

    // getter方法
    public String getRecordId() {
        return recordId;
    }

    public int getStartFrame() {
        return startFrame;
    }

    public int getFrameCount() {
        return frameCount;
    }

    public int getEndFrame() {
        return startFrame + frameCount;
    }
}