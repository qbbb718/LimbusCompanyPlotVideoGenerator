package com.lbc_plot.render.audio.model;

import java.util.List;
import java.util.ArrayList;
import java.util.List;

/**
 * 音频时间线
 */
public class AudioTimeline {
    private List<AudioSegment> segments; // 音频片段序列
    private int totalFrames; // 总帧数
    private double frameRate; // 帧率

    // 构造函数
    public AudioTimeline() {
        this.segments = new ArrayList<>();
    }

    public AudioTimeline(int totalFrames, double frameRate) {
        this();
        this.totalFrames = totalFrames;
        this.frameRate = frameRate;
    }

    public AudioTimeline(List<AudioSegment> segments, int totalFrames, double frameRate) {
        this.segments = segments != null ? new ArrayList<>(segments) : new ArrayList<>();
        this.totalFrames = totalFrames;
        this.frameRate = frameRate;
    }

    // Getter 和 Setter 方法
    public List<AudioSegment> getSegments() {
        return new ArrayList<>(segments);
    }

    public void setSegments(List<AudioSegment> segments) {
        this.segments = segments != null ? new ArrayList<>(segments) : new ArrayList<>();
    }

    public int getTotalFrames() {
        return totalFrames;
    }

    public void setTotalFrames(int totalFrames) {
        this.totalFrames = totalFrames;
    }

    public double getFrameRate() {
        return frameRate;
    }

    public void setFrameRate(double frameRate) {
        this.frameRate = frameRate;
    }

    // 便捷方法
    public void addSegment(AudioSegment segment) {
        if (segment != null) {
            segments.add(segment);
        }
    }

    public void removeSegment(AudioSegment segment) {
        segments.remove(segment);
    }

    public void clearSegments() {
        segments.clear();
    }

    public int getSegmentCount() {
        return segments.size();
    }

    public List<AudioSegment> getSegmentsByType(AudioCommandType type) {
        List<AudioSegment> result = new ArrayList<>();
        for (AudioSegment segment : segments) {
            if (segment.getType() == type) {
                result.add(segment);
            }
        }
        return result;
    }

    public List<AudioSegment> getSegmentsAtFrame(int frame) {
        List<AudioSegment> result = new ArrayList<>();
        for (AudioSegment segment : segments) {
            if (segment.containsFrame(frame)) {
                result.add(segment);
            }
        }
        return result;
    }

    public double getTotalDurationSeconds() {
        return totalFrames / frameRate;
    }

    @Override
    public String toString() {
        return "AudioTimeline{" +
                "segments=" + segments.size() +
                ", totalFrames=" + totalFrames +
                ", frameRate=" + frameRate +
                ", duration=" + getTotalDurationSeconds() + "s" +
                '}';
    }
}