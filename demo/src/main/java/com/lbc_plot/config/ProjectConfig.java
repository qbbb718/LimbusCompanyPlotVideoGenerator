package com.lbc_plot.config;

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
    public static final int FRAME_RATE = 30;
    public static final int DEFAULT_DIALOGUE_SPEED = 1;
    
    // 文件路径配置 好像没用上啊
    public static final String IMAGE_BASE_PATH = "assets/images/";
    public static final String PORTRAIT_BASE_PATH = IMAGE_BASE_PATH + "portraits/";
    public static final String THUMBNAIL_BASE_PATH = IMAGE_BASE_PATH + "thumbnails/";
    public static final String AUDIO_BASE_PATH = "audio/";
    
    // 默认颜色配置
    
    
    // 动画配置
    public static final int DEFAULT_ANIMATION_DURATION = 300; // 毫秒
    public static final float DEFAULT_ALPHA = 0.8f;
    public static final int DEFAULT_STAY_FRAMES = 75; // 对话末尾延迟帧数
    
    
    // 角色配置
    public static final int DEFAULT_CHARACTER_HEIGHT = 171;
    public static final int DEFAULT_CHARACTER_HEIGHT_Pixels = 221;
    public static final double Pixels_per_centimeter = 12;
    public static final int MAX_PORTRAITS_PER_CHARACTER = 20;
    public static final int DEFAULT_CHARACTER_HEAD_LENGTH = 183;




    // 字幕配置
    public static final String TEXT_FONT_NAME = "ChineseFont" ;//"更纱黑体 SC Bold";
    public static final java.awt.Color DEFAULT_TEXT_COLOR = new Color(251, 219, 179);
    public static final java.awt.Color DEFAULT_BG_COLOR = new Color(76, 54, 31);
    public static final java.awt.Color FACTION_COLOR = new Color(159, 106, 59);
    public static final int SHADOW_OFFSET_DEFAULT_X = 1;
    public static final int SHADOW_OFFSET_DEFAULT_Y = 1;
    public static final int SHADOW_OFFSET_NAME_X = 5;
    public static final int SHADOW_OFFSET_NAME_Y = 5;

    // 地点文字参数
    public static final int LOCATION_X = 197;
    public static final int LOCATION_Y = 78;
    public static final int LOCATION_FONT_SIZE = 32;
    public static final float LOCATION_ROTATION = -5.2f;
    public static final int LOCATION_MAX_WIDTH = 500;
    
    // 角色名文字参数
    public static final int CHARACTER_NAME_X = 900;
    public static final int CHARACTER_NAME_Y = 345;
    public static final int CHARACTER_NAME_FONT_SIZE = 110;
    public static final float CHARACTER_NAME_ROTATION = -6.5f;
    public static final int CHARACTER_MAX_WIDTH = 800;
    
    // 阵营文字参数
    public static final int FACTION_X = 740;
    public static final int FACTION_Y = 135;
    public static final int FACTION_FONT_SIZE = 75;
    public static final float FACTION_ROTATION = -6.5f;
    public static final int FACTION_MAX_WIDTH = 667;
    
    // 对话文字参数（通用）
    public static final int DIALOGUE_LEFT_X = 376; //左对齐的
    public static final int DIALOGUE_LEFT_Y = 912;
    public static final int DIALOGUE_CENTER_X = 960;  // 居中的
    public static final int DIALOGUE_CENTER_Y = 960; 
    public static final int DIALOGUE_FONT_SIZE = 28;
    public static final int DIALOGUE_MAX_WIDTH = 1120;


    
    // 旁白的id
    public static final String NARRATION_ID = "NARRATION";
}