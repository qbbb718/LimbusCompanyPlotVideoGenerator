package com.lbc_plot.config;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.awt.Color;

/**
 * 项目全局配置（可由 application.yml/properties 覆盖）
 *
 * 保留旧有静态常量以保证向后兼容，Spring 启动时会用注入的值覆盖这些静态字段。
 */
@Component
@ConfigurationProperties(prefix = "project")
public class ProjectConfig {
    // 静态字段（向后兼容）
    public static int VIDEO_WIDTH = 1920;
    public static int VIDEO_HEIGHT = 1080;
    public static String VIDEO_RESOLUTION = "1080p";
    public static double VIDEO_ASPECT_RATIO = 16.0 / 9.0;
    public static int FRAME_RATE = 30;

    public static String IMAGE_BASE_PATH = "assets/images/";
    public static String PORTRAIT_BASE_PATH = IMAGE_BASE_PATH + "portraits/";
    public static String THUMBNAIL_BASE_PATH = IMAGE_BASE_PATH + "thumbnails/";

    public static int DEFAULT_ANIMATION_DURATION = 300; // ms
    public static float DEFAULT_ALPHA = 0.8f;
    public static int DEFAULT_STAY_FRAMES = 75;

    public static int DEFAULT_CHARACTER_HEIGHT = 171;
    public static int DEFAULT_CHARACTER_HEIGHT_Pixels = 221;
    public static double Pixels_per_centimeter = 12;
    public static int MAX_PORTRAITS_PER_CHARACTER = 20;
    public static int DEFAULT_CHARACTER_HEAD_LENGTH = 183;

    public static String TEXT_FONT_NAME = "ChineseFont";
    public static Color DEFAULT_TEXT_COLOR = new Color(251, 219, 179);
    public static Color DEFAULT_BG_COLOR = new Color(76, 54, 31);
    public static Color FACTION_COLOR = new Color(159, 106, 59);
    public static int DEFAULT_DIALOGUE_SPEED = 3;
    public static int SHADOW_OFFSET_DEFAULT_X = 1;
    public static int SHADOW_OFFSET_DEFAULT_Y = 1;
    public static int SHADOW_OFFSET_NAME_X = 5;
    public static int SHADOW_OFFSET_NAME_Y = 5;

    public static int LOCATION_X = 197;
    public static int LOCATION_Y = 78;
    public static int LOCATION_FONT_SIZE = 32;
    public static float LOCATION_ROTATION = -5.2f;
    public static int LOCATION_MAX_WIDTH = 500;

    public static int CHARACTER_NAME_X = 900;
    public static int CHARACTER_NAME_Y = 345;
    public static int CHARACTER_NAME_FONT_SIZE = 110;
    public static float CHARACTER_NAME_ROTATION = -6.5f;
    public static int CHARACTER_MAX_WIDTH = 800;

    public static int FACTION_X = 740;
    public static int FACTION_Y = 135;
    public static int FACTION_FONT_SIZE = 75;
    public static float FACTION_ROTATION = -6.5f;
    public static int FACTION_MAX_WIDTH = 667;

    public static int DIALOGUE_LEFT_X = 376;
    public static int DIALOGUE_LEFT_Y = 912;
    public static int DIALOGUE_CENTER_X = 960;
    public static int DIALOGUE_CENTER_Y = 960;
    public static int DIALOGUE_FONT_SIZE = 28;
    public static int DIALOGUE_MAX_WIDTH = 1120;

    public static String NARRATION_ID = "NARRATION";

    // 实例字段（支持配置绑定）
    private int videoWidth = VIDEO_WIDTH;
    private int videoHeight = VIDEO_HEIGHT;
    private String videoResolution = VIDEO_RESOLUTION;
    private double videoAspectRatio = VIDEO_ASPECT_RATIO;
    private int frameRate = FRAME_RATE;

    private String imageBasePath = IMAGE_BASE_PATH;
    private String portraitBasePath = PORTRAIT_BASE_PATH;
    private String thumbnailBasePath = THUMBNAIL_BASE_PATH;

    private int defaultAnimationDuration = DEFAULT_ANIMATION_DURATION;
    private float defaultAlpha = DEFAULT_ALPHA;
    private int defaultStayFrames = DEFAULT_STAY_FRAMES;

    private int defaultCharacterHeight = DEFAULT_CHARACTER_HEIGHT;
    private int defaultCharacterHeightPixels = DEFAULT_CHARACTER_HEIGHT_Pixels;
    private double pixelsPerCentimeter = Pixels_per_centimeter;
    private int maxPortraitsPerCharacter = MAX_PORTRAITS_PER_CHARACTER;
    private int defaultCharacterHeadLength = DEFAULT_CHARACTER_HEAD_LENGTH;

    private String textFontName = TEXT_FONT_NAME;
    // 颜色以十六进制字符串配置（例如: #FBDBB3）。保留对 java.awt.Color 的兼容 getter/setter。
    private String defaultTextColor = "#" + Integer.toHexString(DEFAULT_TEXT_COLOR.getRGB()).substring(2).toUpperCase();
    private String defaultBgColor = "#" + Integer.toHexString(DEFAULT_BG_COLOR.getRGB()).substring(2).toUpperCase();
    private String factionColor = "#" + Integer.toHexString(FACTION_COLOR.getRGB()).substring(2).toUpperCase();
    private int defaultDialogueSpeed = DEFAULT_DIALOGUE_SPEED;
    private int shadowOffsetDefaultX = SHADOW_OFFSET_DEFAULT_X;
    private int shadowOffsetDefaultY = SHADOW_OFFSET_DEFAULT_Y;
    private int shadowOffsetNameX = SHADOW_OFFSET_NAME_X;
    private int shadowOffsetNameY = SHADOW_OFFSET_NAME_Y;

    private int locationX = LOCATION_X;
    private int locationY = LOCATION_Y;
    private int locationFontSize = LOCATION_FONT_SIZE;
    private float locationRotation = LOCATION_ROTATION;
    private int locationMaxWidth = LOCATION_MAX_WIDTH;

    private int characterNameX = CHARACTER_NAME_X;
    private int characterNameY = CHARACTER_NAME_Y;
    private int characterNameFontSize = CHARACTER_NAME_FONT_SIZE;
    private float characterNameRotation = CHARACTER_NAME_ROTATION;
    private int characterMaxWidth = CHARACTER_MAX_WIDTH;

    private int factionX = FACTION_X;
    private int factionY = FACTION_Y;
    private int factionFontSize = FACTION_FONT_SIZE;
    private float factionRotation = FACTION_ROTATION;
    private int factionMaxWidth = FACTION_MAX_WIDTH;

    private int dialogueLeftX = DIALOGUE_LEFT_X;
    private int dialogueLeftY = DIALOGUE_LEFT_Y;
    private int dialogueCenterX = DIALOGUE_CENTER_X;
    private int dialogueCenterY = DIALOGUE_CENTER_Y;
    private int dialogueFontSize = DIALOGUE_FONT_SIZE;
    private int dialogueMaxWidth = DIALOGUE_MAX_WIDTH;

    private String narrationId = NARRATION_ID;

    @PostConstruct
    public void init() {
        // 在 Spring 启动后用配置的值覆盖静态字段，保证向后兼容旧代码中的静态引用
        VIDEO_WIDTH = this.videoWidth;
        VIDEO_HEIGHT = this.videoHeight;
        VIDEO_RESOLUTION = this.videoResolution;
        VIDEO_ASPECT_RATIO = this.videoAspectRatio;
        FRAME_RATE = this.frameRate;

        IMAGE_BASE_PATH = this.imageBasePath;
        PORTRAIT_BASE_PATH = this.portraitBasePath;
        THUMBNAIL_BASE_PATH = this.thumbnailBasePath;

        DEFAULT_ANIMATION_DURATION = this.defaultAnimationDuration;
        DEFAULT_ALPHA = this.defaultAlpha;
        DEFAULT_STAY_FRAMES = this.defaultStayFrames;

        DEFAULT_CHARACTER_HEIGHT = this.defaultCharacterHeight;
        DEFAULT_CHARACTER_HEIGHT_Pixels = this.defaultCharacterHeightPixels;
        Pixels_per_centimeter = this.pixelsPerCentimeter;
        MAX_PORTRAITS_PER_CHARACTER = this.maxPortraitsPerCharacter;
        DEFAULT_CHARACTER_HEAD_LENGTH = this.defaultCharacterHeadLength;

        TEXT_FONT_NAME = this.textFontName;
        DEFAULT_TEXT_COLOR = parseColor(this.defaultTextColor, DEFAULT_TEXT_COLOR);
        DEFAULT_BG_COLOR = parseColor(this.defaultBgColor, DEFAULT_BG_COLOR);
        FACTION_COLOR = parseColor(this.factionColor, FACTION_COLOR);
        DEFAULT_DIALOGUE_SPEED = this.defaultDialogueSpeed;
        SHADOW_OFFSET_DEFAULT_X = this.shadowOffsetDefaultX;
        SHADOW_OFFSET_DEFAULT_Y = this.shadowOffsetDefaultY;
        SHADOW_OFFSET_NAME_X = this.shadowOffsetNameX;
        SHADOW_OFFSET_NAME_Y = this.shadowOffsetNameY;

        LOCATION_X = this.locationX;
        LOCATION_Y = this.locationY;
        LOCATION_FONT_SIZE = this.locationFontSize;
        LOCATION_ROTATION = this.locationRotation;
        LOCATION_MAX_WIDTH = this.locationMaxWidth;

        CHARACTER_NAME_X = this.characterNameX;
        CHARACTER_NAME_Y = this.characterNameY;
        CHARACTER_NAME_FONT_SIZE = this.characterNameFontSize;
        CHARACTER_NAME_ROTATION = this.characterNameRotation;
        CHARACTER_MAX_WIDTH = this.characterMaxWidth;

        FACTION_X = this.factionX;
        FACTION_Y = this.factionY;
        FACTION_FONT_SIZE = this.factionFontSize;
        FACTION_ROTATION = this.factionRotation;
        FACTION_MAX_WIDTH = this.factionMaxWidth;

        DIALOGUE_LEFT_X = this.dialogueLeftX;
        DIALOGUE_LEFT_Y = this.dialogueLeftY;
        DIALOGUE_CENTER_X = this.dialogueCenterX;
        DIALOGUE_CENTER_Y = this.dialogueCenterY;
        DIALOGUE_FONT_SIZE = this.dialogueFontSize;
        DIALOGUE_MAX_WIDTH = this.dialogueMaxWidth;

        NARRATION_ID = this.narrationId;
    }

    // Getters and setters
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

    public String getVideoResolution() {
        return videoResolution;
    }

    public void setVideoResolution(String videoResolution) {
        this.videoResolution = videoResolution;
    }

    public double getVideoAspectRatio() {
        return videoAspectRatio;
    }

    public void setVideoAspectRatio(double videoAspectRatio) {
        this.videoAspectRatio = videoAspectRatio;
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

    public String getPortraitBasePath() {
        return portraitBasePath;
    }

    public void setPortraitBasePath(String portraitBasePath) {
        this.portraitBasePath = portraitBasePath;
    }

    public String getThumbnailBasePath() {
        return thumbnailBasePath;
    }

    public void setThumbnailBasePath(String thumbnailBasePath) {
        this.thumbnailBasePath = thumbnailBasePath;
    }

    public int getDefaultAnimationDuration() {
        return defaultAnimationDuration;
    }

    public void setDefaultAnimationDuration(int defaultAnimationDuration) {
        this.defaultAnimationDuration = defaultAnimationDuration;
    }

    public float getDefaultAlpha() {
        return defaultAlpha;
    }

    public void setDefaultAlpha(float defaultAlpha) {
        this.defaultAlpha = defaultAlpha;
    }

    public int getDefaultStayFrames() {
        return defaultStayFrames;
    }

    public void setDefaultStayFrames(int defaultStayFrames) {
        this.defaultStayFrames = defaultStayFrames;
    }

    public int getDefaultCharacterHeight() {
        return defaultCharacterHeight;
    }

    public void setDefaultCharacterHeight(int defaultCharacterHeight) {
        this.defaultCharacterHeight = defaultCharacterHeight;
    }

    public int getDefaultCharacterHeightPixels() {
        return defaultCharacterHeightPixels;
    }

    public void setDefaultCharacterHeightPixels(int defaultCharacterHeightPixels) {
        this.defaultCharacterHeightPixels = defaultCharacterHeightPixels;
    }

    public double getPixelsPerCentimeter() {
        return pixelsPerCentimeter;
    }

    public void setPixelsPerCentimeter(double pixelsPerCentimeter) {
        this.pixelsPerCentimeter = pixelsPerCentimeter;
    }

    public int getMaxPortraitsPerCharacter() {
        return maxPortraitsPerCharacter;
    }

    public void setMaxPortraitsPerCharacter(int maxPortraitsPerCharacter) {
        this.maxPortraitsPerCharacter = maxPortraitsPerCharacter;
    }

    public int getDefaultCharacterHeadLength() {
        return defaultCharacterHeadLength;
    }

    public void setDefaultCharacterHeadLength(int defaultCharacterHeadLength) {
        this.defaultCharacterHeadLength = defaultCharacterHeadLength;
    }

    public String getTextFontName() {
        return textFontName;
    }

    public void setTextFontName(String textFontName) {
        this.textFontName = textFontName;
    }

    public Color getDefaultTextColor() {
        return parseColor(defaultTextColor, DEFAULT_TEXT_COLOR);
    }

    // 新的配置绑定：接受十六进制字符串
    public void setDefaultTextColor(String hex) {
        this.defaultTextColor = hex;
    }

    // 兼容旧调用：接受 Color
    public void setDefaultTextColor(Color defaultTextColor) {
        this.defaultTextColor = colorToHex(defaultTextColor);
    }

    public Color getDefaultBgColor() {
        return parseColor(defaultBgColor, DEFAULT_BG_COLOR);
    }

    public void setDefaultBgColor(String hex) {
        this.defaultBgColor = hex;
    }

    public void setDefaultBgColor(Color defaultBgColor) {
        this.defaultBgColor = colorToHex(defaultBgColor);
    }

    public Color getFactionColor() {
        return parseColor(factionColor, FACTION_COLOR);
    }

    public void setFactionColor(String hex) {
        this.factionColor = hex;
    }

    public void setFactionColor(Color factionColor) {
        this.factionColor = colorToHex(factionColor);
    }

    public int getDefaultDialogueSpeed() {
        return defaultDialogueSpeed;
    }

    public void setDefaultDialogueSpeed(int defaultDialogueSpeed) {
        this.defaultDialogueSpeed = defaultDialogueSpeed;
    }

    public int getShadowOffsetDefaultX() {
        return shadowOffsetDefaultX;
    }

    public void setShadowOffsetDefaultX(int shadowOffsetDefaultX) {
        this.shadowOffsetDefaultX = shadowOffsetDefaultX;
    }

    public int getShadowOffsetDefaultY() {
        return shadowOffsetDefaultY;
    }

    public void setShadowOffsetDefaultY(int shadowOffsetDefaultY) {
        this.shadowOffsetDefaultY = shadowOffsetDefaultY;
    }

    public int getShadowOffsetNameX() {
        return shadowOffsetNameX;
    }

    public void setShadowOffsetNameX(int shadowOffsetNameX) {
        this.shadowOffsetNameX = shadowOffsetNameX;
    }

    public int getShadowOffsetNameY() {
        return shadowOffsetNameY;
    }

    public void setShadowOffsetNameY(int shadowOffsetNameY) {
        this.shadowOffsetNameY = shadowOffsetNameY;
    }

    public int getLocationX() {
        return locationX;
    }

    public void setLocationX(int locationX) {
        this.locationX = locationX;
    }

    public int getLocationY() {
        return locationY;
    }

    public void setLocationY(int locationY) {
        this.locationY = locationY;
    }

    public int getLocationFontSize() {
        return locationFontSize;
    }

    public void setLocationFontSize(int locationFontSize) {
        this.locationFontSize = locationFontSize;
    }

    public float getLocationRotation() {
        return locationRotation;
    }

    public void setLocationRotation(float locationRotation) {
        this.locationRotation = locationRotation;
    }

    public int getLocationMaxWidth() {
        return locationMaxWidth;
    }

    public void setLocationMaxWidth(int locationMaxWidth) {
        this.locationMaxWidth = locationMaxWidth;
    }

    public int getCharacterNameX() {
        return characterNameX;
    }

    public void setCharacterNameX(int characterNameX) {
        this.characterNameX = characterNameX;
    }

    public int getCharacterNameY() {
        return characterNameY;
    }

    public void setCharacterNameY(int characterNameY) {
        this.characterNameY = characterNameY;
    }

    public int getCharacterNameFontSize() {
        return characterNameFontSize;
    }

    public void setCharacterNameFontSize(int characterNameFontSize) {
        this.characterNameFontSize = characterNameFontSize;
    }

    public float getCharacterNameRotation() {
        return characterNameRotation;
    }

    public void setCharacterNameRotation(float characterNameRotation) {
        this.characterNameRotation = characterNameRotation;
    }

    public int getCharacterMaxWidth() {
        return characterMaxWidth;
    }

    public void setCharacterMaxWidth(int characterMaxWidth) {
        this.characterMaxWidth = characterMaxWidth;
    }

    public int getFactionX() {
        return factionX;
    }

    public void setFactionX(int factionX) {
        this.factionX = factionX;
    }

    public int getFactionY() {
        return factionY;
    }

    public void setFactionY(int factionY) {
        this.factionY = factionY;
    }

    public int getFactionFontSize() {
        return factionFontSize;
    }

    public void setFactionFontSize(int factionFontSize) {
        this.factionFontSize = factionFontSize;
    }

    public float getFactionRotation() {
        return factionRotation;
    }

    public void setFactionRotation(float factionRotation) {
        this.factionRotation = factionRotation;
    }

    public int getFactionMaxWidth() {
        return factionMaxWidth;
    }

    public void setFactionMaxWidth(int factionMaxWidth) {
        this.factionMaxWidth = factionMaxWidth;
    }

    public int getDialogueLeftX() {
        return dialogueLeftX;
    }

    public void setDialogueLeftX(int dialogueLeftX) {
        this.dialogueLeftX = dialogueLeftX;
    }

    public int getDialogueLeftY() {
        return dialogueLeftY;
    }

    public void setDialogueLeftY(int dialogueLeftY) {
        this.dialogueLeftY = dialogueLeftY;
    }

    public int getDialogueCenterX() {
        return dialogueCenterX;
    }

    public void setDialogueCenterX(int dialogueCenterX) {
        this.dialogueCenterX = dialogueCenterX;
    }

    public int getDialogueCenterY() {
        return dialogueCenterY;
    }

    public void setDialogueCenterY(int dialogueCenterY) {
        this.dialogueCenterY = dialogueCenterY;
    }

    public int getDialogueFontSize() {
        return dialogueFontSize;
    }

    public void setDialogueFontSize(int dialogueFontSize) {
        this.dialogueFontSize = dialogueFontSize;
    }

    public int getDialogueMaxWidth() {
        return dialogueMaxWidth;
    }

    public void setDialogueMaxWidth(int dialogueMaxWidth) {
        this.dialogueMaxWidth = dialogueMaxWidth;
    }

    public String getNarrationId() {
        return narrationId;
    }

    public void setNarrationId(String narrationId) {
        this.narrationId = narrationId;
    }

    // ----- Color helpers -----
    private static Color parseColor(String hex, Color fallback) {
        if (hex == null) return fallback;
        String s = hex.trim();
        if (s.startsWith("#")) s = s.substring(1);
        try {
            if (s.length() == 3) {
                // short form e.g. FDB -> F F D D B B
                char r = s.charAt(0);
                char g = s.charAt(1);
                char b = s.charAt(2);
                s = "" + r + r + g + g + b + b;
            }
            if (s.length() == 6) {
                int rgb = Integer.parseInt(s, 16);
                int r = (rgb >> 16) & 0xFF;
                int g = (rgb >> 8) & 0xFF;
                int b = (rgb) & 0xFF;
                return new Color(r, g, b);
            }
            if (s.length() == 8) {
                long val = Long.parseLong(s, 16);
                int a = (int) ((val >> 24) & 0xFF);
                int r = (int) ((val >> 16) & 0xFF);
                int g = (int) ((val >> 8) & 0xFF);
                int b = (int) (val & 0xFF);
                return new Color(r, g, b, a);
            }
        } catch (Exception ex) {
            // ignore and fallback
        }
        return fallback;
    }

    private static String colorToHex(Color c) {
        if (c == null) return "#000000";
        String hex = String.format("#%02X%02X%02X", c.getRed(), c.getGreen(), c.getBlue());
        return hex;
    }
}