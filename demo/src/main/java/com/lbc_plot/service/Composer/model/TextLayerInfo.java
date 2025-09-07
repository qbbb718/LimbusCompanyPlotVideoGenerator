package com.lbc_plot.service.Composer.model;


import java.awt.Color;

/**
 * 文字图层信息模型
 */
public class TextLayerInfo {
    private final String text;
    private final int x;
    private final int y;
    private final int fontSize;
    private final Color color;
    private final float rotation;
    private final TextAlignment alignment;
    private final int maxWidth;
    
    public TextLayerInfo(String text, int x, int y, int fontSize, Color color, 
                        float rotation, TextAlignment alignment, int maxWidth) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.fontSize = fontSize;
        this.color = color;
        this.rotation = rotation;
        this.alignment = alignment;
        this.maxWidth = maxWidth;
    }
    
    // Getter 方法
    public String getText() { return text; }
    public int getX() { return x; }
    public int getY() { return y; }
    public int getFontSize() { return fontSize; }
    public Color getColor() { return color; }
    public float getRotation() { return rotation; }
    public TextAlignment getAlignment() { return alignment; }
    public int getMaxWidth() { return maxWidth; }
}