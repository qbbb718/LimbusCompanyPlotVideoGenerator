package com.lbc_plot.core;

import java.awt.Color;

/**
 * 项目全局配置类
 */
public final class ProjectConfig {
    // 私有构造函数防止实例化
    private ProjectConfig() {}
    
    // 视频尺寸配置
    public static final int VIDEO_WIDTH = 1920;
    public static final int VIDEO_HEIGHT = 1080;
    public static final String VIDEO_RESOLUTION = "1080p";
    public static final double VIDEO_ASPECT_RATIO = 16.0 / 9.0;
    
    // 文件路径配置
    public static final String IMAGE_BASE_PATH = "assets/images/";
    public static final String PORTRAIT_BASE_PATH = IMAGE_BASE_PATH + "portraits/";
    public static final String THUMBNAIL_BASE_PATH = IMAGE_BASE_PATH + "thumbnails/";
    
    // 默认颜色配置
    
    
    // 动画配置
    public static final int DEFAULT_ANIMATION_DURATION = 300; // 毫秒
    public static final float DEFAULT_ALPHA = 0.8f;
    
    // 角色配置
    public static final int DEFAULT_CHARACTER_HEIGHT = 171;
    public static final int MAX_PORTRAITS_PER_CHARACTER = 20;
    public static final double Pixels_per_centimeter = 8.5;




    // 字幕配置
    public static final String TEXT_FONT_NAME = "ChineseFont" ;//"更纱黑体 SC Bold";
    public static final java.awt.Color DEFAULT_TEXT_COLOR = new Color(249, 217, 175);
    public static final java.awt.Color DEFAULT_BG_COLOR = new Color(76, 54, 31);
    public static final java.awt.Color FACTION_COLOR = new Color(159, 106, 59);

    // 地点文字参数
    public static final int LOCATION_X = 100;
    public static final int LOCATION_Y = 50;
    public static final int LOCATION_FONT_SIZE = 28;
    public static final float LOCATION_ROTATION = -30f;
    
    // 角色名文字参数
    public static final int CHARACTER_NAME_X = 200;
    public static final int CHARACTER_NAME_Y = 150;
    public static final int CHARACTER_NAME_FONT_SIZE = 24;
    public static final float CHARACTER_NAME_ROTATION = -30f;
    
    // 阵营文字参数
    public static final int FACTION_X = 300;
    public static final int FACTION_Y = 250;
    public static final int FACTION_FONT_SIZE = 26;
    public static final float FACTION_ROTATION = -30f;
    
    // 对话文字参数（通用）
    public static final int DIALOGUE_X = 400; //左对齐的
    public static final int DIALOGUE_Y = 350;
    public static final int DIALOGUE_FONT_SIZE = 20;
    public static final int DIALOGUE_MAX_WIDTH = 500;
    
    // 特殊位置参数（如果需要）
    public static final int DIALOGUE_CENTER_X = 960;  // 假设1920x1080画布的中心
    public static final int DIALOGUE_BOTTOM_Y = 900;  // 底部位置



    // 旁白的id
    public static final String NARRATION_ID = " ";
}