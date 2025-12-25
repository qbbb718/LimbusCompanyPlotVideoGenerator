package com.lbc_plot.util;

/**
 * 视频质量配置类
 * 提供不同场景下的优化配置
 */
public class VideoQualityConfig {
    /**
     * 高质量配置 - 适用于最终输出
     */
    public static final VideoPreset HIGH_QUALITY = new VideoPreset(
        "high", 
        12000000,  // 比特率
        "medium",   // 预设
        10,         // 质量
        30          // 帧率
    );

    /**
     * 预览质量配置 - 适用于快速预览
     */
    public static final VideoPreset PREVIEW = new VideoPreset(
        "preview", 
        5000000,   // 比特率
        "fast",      // 预设
        7,           // 质量
        15          // 帧率
    );

    /**
     * 草稿质量配置 - 适用于快速测试
     */
    public static final VideoPreset DRAFT = new VideoPreset(
        "draft", 
        2000000,   // 比特率
        "ultrafast", // 预设
        5,           // 质量
        10          // 帧率
    );

    /**
     * 视频预设配置类
     */
    public static class VideoPreset {
        public final String name;
        public final int bitrate;
        public final String preset;
        public final int quality;
        public final int frameRate;

        public VideoPreset(String name, int bitrate, String preset, int quality, int frameRate) {
            this.name = name;
            this.bitrate = bitrate;
            this.preset = preset;
            this.quality = quality;
            this.frameRate = frameRate;
        }
    }
}
