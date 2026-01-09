package com.lbc_plot.render.service.impl;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.lbc_plot.plot.model.Record;

public class RenderJob {
    private String id;
    private Record record;
    private boolean plot;
    private int width;
    private int height;
    private String videoPath;
    private int frameRate;
    // retry metadata
    private int attempts = 0;
    private long firstAttemptTimeMs = 0L;
    private long nextAttemptTimeMs = 0L;

    @JsonCreator
    public RenderJob(@JsonProperty("id") String id,
                     @JsonProperty("record") Record record,
                     @JsonProperty("plot") boolean plot,
                     @JsonProperty("width") int width,
                     @JsonProperty("height") int height,
                     @JsonProperty("videoPath") String videoPath,
                     @JsonProperty("frameRate") int frameRate) {
        this.id = id;
        this.record = record;
        this.plot = plot;
        this.width = width;
        this.height = height;
        this.videoPath = videoPath;
        this.frameRate = frameRate;
    }

    public String getId() {
        return id;
    }

    public Record getRecord() {
        return record;
    }

    public boolean isPlot() {
        return plot;
    }

    public int getWidth() {
        return width;
    }

    public int getHeight() {
        return height;
    }

    public String getVideoPath() {
        return videoPath;
    }

    public int getFrameRate() {
        return frameRate;
    }

    public int getAttempts() {
        return attempts;
    }

    public void setAttempts(int attempts) {
        this.attempts = attempts;
    }

    public long getFirstAttemptTimeMs() {
        return firstAttemptTimeMs;
    }

    public void setFirstAttemptTimeMs(long firstAttemptTimeMs) {
        this.firstAttemptTimeMs = firstAttemptTimeMs;
    }

    public long getNextAttemptTimeMs() {
        return nextAttemptTimeMs;
    }

    public void setNextAttemptTimeMs(long nextAttemptTimeMs) {
        this.nextAttemptTimeMs = nextAttemptTimeMs;
    }
}
