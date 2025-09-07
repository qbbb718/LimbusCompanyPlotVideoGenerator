package com.lbc_plot.service.Composer.manager;

import java.awt.Canvas;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.font.FontRenderContext;
import java.awt.font.LineBreakMeasurer;
import java.awt.font.TextAttribute;
import java.awt.font.TextLayout;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.text.AttributedCharacterIterator;
import java.text.AttributedString;
import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.core.ProjectConfig;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.service.Composer.contract.TextLayerOperations;
import com.lbc_plot.service.Composer.model.TextAlignment;

// TextLayerManager.java - 专门处理文字图层
public class TextLayerManager extends BaseLayerManager implements TextLayerOperations {
    private final List<TextLayerInfo> textLayers = new ArrayList<>();
    
    /**
     * 添加地点文字图层
     */
    public void addLocationText(String text) {

        addTextLayer(text, 
            ProjectConfig.LOCATION_X, 
            ProjectConfig.LOCATION_Y, 
            ProjectConfig.LOCATION_FONT_SIZE, 
            ProjectConfig.DEFAULT_TEXT_COLOR, 
            ProjectConfig.LOCATION_ROTATION,
            TextAlignment.LEFT,    
            -1
        );
    }
    
    /**
     * 添加角色名文字图层
     */
    public void addCharacterNameText(String text,  Color color) {
        addTextLayer(text, 
            ProjectConfig.CHARACTER_NAME_X, 
            ProjectConfig.CHARACTER_NAME_Y, 
            ProjectConfig.CHARACTER_NAME_FONT_SIZE, 
            color,  // 使用传入的颜色
            ProjectConfig.CHARACTER_NAME_ROTATION, 
            TextAlignment.LEFT, 
            -1
        );
    }
    
    /**
     * 添加阵营文字图层
     */
    public void addFactionText(String text) {
        addTextLayer(text, 
            ProjectConfig.FACTION_X, 
            ProjectConfig.FACTION_Y, 
            ProjectConfig.FACTION_FONT_SIZE, 
            ProjectConfig.FACTION_COLOR, 
            ProjectConfig.FACTION_ROTATION, 
            TextAlignment.LEFT, 
            -1
        );
    }
    
    /**
     * 添加对话文字图层（左对齐）
     */
    public void addDialogueTextLeft(String text) {
    addTextLayer(text, 
        ProjectConfig.DIALOGUE_X, 
        ProjectConfig.DIALOGUE_Y, 
        ProjectConfig.DIALOGUE_FONT_SIZE, 
        ProjectConfig.DEFAULT_TEXT_COLOR, 
        0, 
        TextAlignment.LEFT, 
        ProjectConfig.DIALOGUE_MAX_WIDTH
    );
}
    
    /**
     * 添加对话文字图层（居中）
     */
    public void addDialogueTextCenter(String text) {
    addTextLayer(text, 
        ProjectConfig.DIALOGUE_CENTER_X, 
        ProjectConfig.DIALOGUE_Y, 
        ProjectConfig.DIALOGUE_FONT_SIZE, 
        ProjectConfig.DEFAULT_TEXT_COLOR, 
        0, 
        TextAlignment.CENTER, 
        ProjectConfig.DIALOGUE_MAX_WIDTH
    );
}
    
    /**
     * 核心文字添加方法 - 使用中文字体进行尺寸计算
     */
    private void addTextLayer(String text, int x, int y, int fontSize, Color color, 
                            float rotation, TextAlignment alignment, int maxWidth) {
        TextLayerInfo textLayer = new TextLayerInfo(text, x, y, fontSize, color, rotation, alignment, maxWidth);
        textLayers.add(textLayer);
        
        // 使用中文字体进行尺寸计算
        Font chineseFont = FontLoader.getChineseFont(fontSize);
        
        // 创建临时Graphics获取FontMetrics
        BufferedImage tempImage = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
        Graphics2D tempG = tempImage.createGraphics();
        tempG.setFont(chineseFont);
        FontMetrics metrics = tempG.getFontMetrics();
        
        if (maxWidth > 0) {
            // 对于需要换行的文本，估算最大尺寸
            String[] lines = wrapText(text, metrics, maxWidth);
            int estimatedWidth = 0;
            
            for (String line : lines) {
                int lineWidth = metrics.stringWidth(line);
                estimatedWidth = Math.max(estimatedWidth, lineWidth);
            }
            
            // 估算高度
            int lineHeight = metrics.getHeight();
            int estimatedHeight = lineHeight * lines.length;
            
            width = Math.max(width, x + estimatedWidth);
            height = Math.max(height, y + estimatedHeight);
        } else {
            // 单行文本
            int textWidth = metrics.stringWidth(text);
            int textHeight = metrics.getHeight();
            
            width = Math.max(width, x + textWidth);
            height = Math.max(height, y + textHeight);
        }
        
        tempG.dispose();
        
        logger.debug("添加文字图层: '{}', 位置({},{}), 字号{}, 颜色{}, 旋转{}度", 
            text, x, y, fontSize, color, rotation);
    }

    /**
     * 文本换行辅助方法
     */
    private String[] wrapText(String text, FontMetrics metrics, int maxWidth) {
        List<String> lines = new ArrayList<>();
        String[] words = text.split(" ");
        StringBuilder currentLine = new StringBuilder();
        
        for (String word : words) {
            String testLine = currentLine.toString() + (currentLine.length() > 0 ? " " : "") + word;
            if (metrics.stringWidth(testLine) <= maxWidth) {
                currentLine.append(currentLine.length() > 0 ? " " : "").append(word);
            } else {
                if (currentLine.length() > 0) {
                    lines.add(currentLine.toString());
                }
                currentLine = new StringBuilder(word);
            }
        }
        
        if (currentLine.length() > 0) {
            lines.add(currentLine.toString());
        }
        
        return lines.toArray(new String[0]);
    }


    public void drawTextLayers(Graphics2D g2d) {
        for (int i = 0; i < textLayers.size(); i++) {
            TextLayerInfo textLayer = textLayers.get(i);
            drawSingleTextLayer(g2d, textLayer, i);
        }
    }

    /**
     * 绘制文字图层 - 使用中文字体
     */
    private void drawSingleTextLayer(Graphics2D g2d, TextLayerInfo textLayer, int layerIndex) {
        // 保存原始变换
        AffineTransform originalTransform = g2d.getTransform();
        
        // 应用旋转（如果需要）
        if (textLayer.rotation != 0) {
            AffineTransform transform = new AffineTransform();
            transform.rotate(Math.toRadians(textLayer.rotation), textLayer.x, textLayer.y);
            g2d.setTransform(transform);
        }
        
        // 设置中文字体和颜色
        Font chineseFont = FontLoader.getChineseFont(textLayer.fontSize);
        g2d.setFont(chineseFont);
        g2d.setColor(textLayer.color);
        
        // 设置抗锯齿
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, 
                        RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        
        if (textLayer.maxWidth > 0) {
            // 需要换行的文本
            drawWrappedText(g2d, textLayer, chineseFont);
        } else {
            // 单行文本
            g2d.drawString(textLayer.text, textLayer.x, textLayer.y + getTextBaseline(g2d));
        }
        
        // 恢复原始变换
        g2d.setTransform(originalTransform);
        
        if (logger.isTraceEnabled()) {
            logger.trace("绘制文字图层{}: '{}', 位置({},{}), 字号{}", 
                layerIndex, textLayer.text, textLayer.x, textLayer.y, textLayer.fontSize);
        }
    }

    /**
     * 绘制自动换行文本 - 使用指定字体
     */
    private void drawWrappedText(Graphics2D g2d, TextLayerInfo textLayer, Font font) {
        AttributedString attributedString = new AttributedString(textLayer.text);
        attributedString.addAttribute(TextAttribute.FONT, font);
        attributedString.addAttribute(TextAttribute.FOREGROUND, textLayer.color);
        
        AttributedCharacterIterator characterIterator = attributedString.getIterator();
        FontRenderContext frc = g2d.getFontRenderContext();
        LineBreakMeasurer measurer = new LineBreakMeasurer(characterIterator, frc);
        
        float wrapWidth = textLayer.maxWidth;
        float x = textLayer.x;
        float y = textLayer.y;
        
        // 获取字体度量
        FontMetrics metrics = g2d.getFontMetrics(font);
        float lineHeight = metrics.getHeight();
        
        while (measurer.getPosition() < characterIterator.getEndIndex()) {
            TextLayout layout = measurer.nextLayout(wrapWidth);
            
            // 计算行起始x坐标（用于对齐）
            float drawX = x;
            if (textLayer.alignment == TextAlignment.CENTER) {
                drawX = x + (wrapWidth - layout.getAdvance()) / 2;
            } else if (textLayer.alignment == TextAlignment.RIGHT) {
                drawX = x + wrapWidth - layout.getAdvance();
            }
            
            y += layout.getAscent();
            layout.draw(g2d, drawX, y);
            y += layout.getDescent() + layout.getLeading();
        }
    }

    /**
     * 获取文字基线位置（确保文字正确垂直对齐）
     */
    private int getTextBaseline(Graphics2D g2d) {
        FontMetrics metrics = g2d.getFontMetrics();
        return metrics.getAscent(); // 返回字体的 ascent 作为基线
    }

    /**
     * 检查文字是否超出边界（需要更新以使用正确字体）
     */
    private boolean isTextOutOfBounds(TextLayerInfo textLayer) {
        // 创建临时 Graphics 来获取正确的字体度量
        BufferedImage tempImage = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
        Graphics2D tempG = tempImage.createGraphics();
        
        // 使用中文字体
        Font font = FontLoader.getChineseFont(textLayer.fontSize);
        tempG.setFont(font);
        FontMetrics metrics = tempG.getFontMetrics();
        
        int textWidth;
        int textHeight = metrics.getHeight();
        
        if (textLayer.maxWidth > 0) {
            // 对于换行文本，估算宽度
            textWidth = textLayer.maxWidth;
            // 估算行数
            int estimatedLines = (int) Math.ceil((double) metrics.stringWidth(textLayer.text) / textLayer.maxWidth);
            textHeight = textHeight * estimatedLines;
        } else {
            // 单行文本
            textWidth = metrics.stringWidth(textLayer.text);
        }
        
        tempG.dispose();
        
        // 检查边界
        return textLayer.x < 0 || textLayer.y < 0 || 
            textLayer.x + textWidth > width || textLayer.y + textHeight > height;
    }
    
    public void clear() {
        textLayers.clear();
    }
    
    public int getTextLayerCount() {
        return textLayers.size();
    }



    /**
     * 内部类：文字图层信息
     */
    private static class TextLayerInfo {
        final String text;
        final int x;
        final int y;
        final int fontSize;
        final Color color;
        final float rotation;
        final TextAlignment alignment;
        final int maxWidth;
        
        TextLayerInfo(String text, int x, int y, int fontSize, Color color, 
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
    }
    
}