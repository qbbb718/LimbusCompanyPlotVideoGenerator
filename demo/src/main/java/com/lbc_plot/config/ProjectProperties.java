package com.lbc_plot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "project")
public class ProjectProperties {
    private int videoWidth = 1920;
    private int videoHeight = 1080;
    private int frameRate = 30;
    private String imageBasePath = "assets/images/";
    private String defaultTextColor;
    private String defaultBgColor;
    private String factionColor;

    public ProjectProperties() {
    }

    public int getVideoWidth() {
        return videoWidth;
    }

    public void setVideoWidth(int videoWidth) {
        this.videoWidth = videoWidth;
    }

    public int getVideoHeight() {
        return videoHeight;
    }

    public void setVideoHeight(int videoHeight) {
        this.videoHeight = videoHeight;
    }

    public int getFrameRate() {
        return frameRate;
    }

    public void setFrameRate(int frameRate) {
        this.frameRate = frameRate;
    }

    public String getImageBasePath() {
        return imageBasePath;
    }

    public void setImageBasePath(String imageBasePath) {
        this.imageBasePath = imageBasePath;
    }

    public String getDefaultTextColor() {
        return defaultTextColor;
    }

    public void setDefaultTextColor(String defaultTextColor) {
        this.defaultTextColor = defaultTextColor;
    }

    public String getDefaultBgColor() {
        return defaultBgColor;
    }

    public void setDefaultBgColor(String defaultBgColor) {
        this.defaultBgColor = defaultBgColor;
    }

    public String getFactionColor() {
        return factionColor;
    }

    public void setFactionColor(String factionColor) {
        this.factionColor = factionColor;
    }
}
