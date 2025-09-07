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
            TextAlignment.CENTER,    
            ProjectConfig.LOCATION_MAX_WIDTH,
            true,
            Color.BLACK,
            ProjectConfig.SHADOW_OFFSET_DEFAULT_X,
            ProjectConfig.SHADOW_OFFSET_DEFAULT_Y
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
            TextAlignment.CENTER,    
            ProjectConfig.CHARACTER_MAX_WIDTH,
            true,
            Color.BLACK,
            ProjectConfig.SHADOW_OFFSET_NAME_X,
            ProjectConfig.SHADOW_OFFSET_NAME_Y
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
            TextAlignment.CENTER,    
            ProjectConfig.FACTION_MAX_WIDTH,
            true,
            Color.BLACK,
            ProjectConfig.SHADOW_OFFSET_NAME_X-1,
            ProjectConfig.SHADOW_OFFSET_NAME_Y
        );
    }
    
    /**
     * 添加对话文字图层（左对齐）
     */
    public void addDialogueTextLeft(String text) {
        addTextLayer(text, 
            ProjectConfig.DIALOGUE_LEFT_X, 
            ProjectConfig.DIALOGUE_LEFT_Y, 
            ProjectConfig.DIALOGUE_FONT_SIZE, 
            ProjectConfig.DEFAULT_TEXT_COLOR, 
            0, 
            TextAlignment.LEFT,    
            ProjectConfig.DIALOGUE_MAX_WIDTH,
            false,
            null,
            0,
            0
        );
    }
    
    /**
     * 添加对话文字图层（居中）
     */
    public void addDialogueTextCenter(String text) {
        addTextLayer(text, 
            ProjectConfig.DIALOGUE_CENTER_X, 
            ProjectConfig.DIALOGUE_CENTER_Y, 
            ProjectConfig.DIALOGUE_FONT_SIZE, 
            ProjectConfig.DEFAULT_TEXT_COLOR, 
            0, 
            TextAlignment.CENTER,    
            ProjectConfig.DIALOGUE_MAX_WIDTH,
            false,
            null,
            0,
            0
        );
    }




    
    /**
     * 核心文字添加方法 - 根据对齐方式采用不同的锚点逻辑
     */
    private void addTextLayer(String text, int x, int y, int fontSize, Color color, 
                            float rotation, TextAlignment alignment, int maxWidth,
                            boolean hasShadow, Color shadowColor, int shadowOffsetX, int shadowOffsetY) {
        TextLayerInfo textLayer = new TextLayerInfo(text, x, y, fontSize, color, rotation, 
                                                alignment, maxWidth, hasShadow, 
                                                shadowColor, shadowOffsetX, shadowOffsetY);
        textLayers.add(textLayer);
        
        // 使用中文字体进行尺寸计算
        Font chineseFont = FontLoader.getChineseFont(fontSize);
        
        // 创建临时Graphics获取FontMetrics
        BufferedImage tempImage = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
        Graphics2D tempG = tempImage.createGraphics();
        tempG.setFont(chineseFont);
        FontMetrics metrics = tempG.getFontMetrics();
        FontRenderContext frc = tempG.getFontRenderContext();
        
        if (maxWidth > 0) {
            // 对于需要换行的文本，计算实际尺寸
            LineBreakMeasurer measurer = new LineBreakMeasurer(
                new AttributedString(text).getIterator(), frc);
            
            float totalHeight = 0;
            float maxLineWidth = 0;
            
            while (measurer.getPosition() < text.length()) {
                TextLayout layout = measurer.nextLayout(maxWidth);
                maxLineWidth = Math.max(maxLineWidth, layout.getAdvance());
                totalHeight += layout.getAscent() + layout.getDescent() + layout.getLeading();
            }
            
            // 根据对齐方式计算边界
            int left, top, right, bottom;
            
            if (alignment == TextAlignment.CENTER) {
                // 居中：锚点在文本中心
                left = (int) (x - maxLineWidth / 2);
                top = (int) (y - totalHeight / 2);
                right = (int) (x + maxLineWidth / 2);
                bottom = (int) (y + totalHeight / 2);
            } else if (alignment == TextAlignment.RIGHT) {
                // 右对齐：锚点在文本右上角
                left = (int) (x - maxLineWidth);
                top = y;
                right = x;
                bottom = (int) (y + totalHeight);
            } else {
                // 左对齐：锚点在文本左上角（默认）
                left = x;
                top = y;
                right = (int) (x + maxLineWidth);
                bottom = (int) (y + totalHeight);
            }
            
            width = Math.max(width, right);
            height = Math.max(height, bottom);
            
        } else {
            // 单行文本
            int textWidth = metrics.stringWidth(text);
            int textHeight = metrics.getHeight();
            
            int left, top, right, bottom;
            
            if (alignment == TextAlignment.CENTER) {
                // 居中：锚点在文本中心
                left = x - textWidth / 2;
                top = y - textHeight / 2;
                right = x + textWidth / 2;
                bottom = y + textHeight / 2;
            } else if (alignment == TextAlignment.RIGHT) {
                // 右对齐：锚点在文本右上角
                left = x - textWidth;
                top = y;
                right = x;
                bottom = y + textHeight;
            } else {
                // 左对齐：锚点在文本左上角（默认）
                left = x;
                top = y;
                right = x + textWidth;
                bottom = y + textHeight;
            }
            
            width = Math.max(width, right);
            height = Math.max(height, bottom);
        }
        
        tempG.dispose();
        
        logger.debug("添加文字图层: '{}', 位置({},{}), 对齐{}, 字号{}, 颜色{}", 
            text, x, y, alignment, fontSize, color);
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
     * 绘制单个文字图层 - 支持投影效果
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
        
        // 设置中文字体和抗锯齿
        Font chineseFont = FontLoader.getChineseFont(textLayer.fontSize);
        g2d.setFont(chineseFont);
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, 
                            RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        
        if (textLayer.hasShadow) {
            // 先绘制投影
            g2d.setColor(textLayer.shadowColor);
            drawTextContent(g2d, textLayer, textLayer.shadowOffsetX, textLayer.shadowOffsetY);
        }
        
        // 再绘制主文字
        g2d.setColor(textLayer.color);
        drawTextContent(g2d, textLayer, 0, 0);
        
        // 恢复原始变换
        g2d.setTransform(originalTransform);
        
        if (logger.isTraceEnabled()) {
            logger.trace("绘制文字图层{}: '{}', 位置({},{}), 投影{}", 
                layerIndex, textLayer.text, textLayer.x, textLayer.y, 
                textLayer.hasShadow ? "有" : "无");
        }
    }

    /**
     * 绘制文字内容（支持偏移）
     */
    private void drawTextContent(Graphics2D g2d, TextLayerInfo textLayer, int offsetX, int offsetY) {
        if (textLayer.maxWidth > 0) {
            // 需要换行的文本
            drawWrappedTextWithOffset(g2d, textLayer, offsetX, offsetY);
        } else {
            // 单行文本
            drawSingleLineWithOffset(g2d, textLayer, offsetX, offsetY);
        }
    }

    /**
     * 绘制带偏移的单行文本
     */
    private void drawSingleLineWithOffset(Graphics2D g2d, TextLayerInfo textLayer, int offsetX, int offsetY) {
        int textWidth = g2d.getFontMetrics().stringWidth(textLayer.text);
        int drawX = textLayer.x + offsetX;
        int drawY = textLayer.y + offsetY + getTextBaseline(g2d);
        
        if (textLayer.alignment == TextAlignment.CENTER) {
            drawX = textLayer.x - textWidth / 2 + offsetX;
        } else if (textLayer.alignment == TextAlignment.RIGHT) {
            drawX = textLayer.x - textWidth + offsetX;
        }
        
        g2d.drawString(textLayer.text, drawX, drawY);
    }


    /**
     * 绘制带偏移的换行文本
     */
    private void drawWrappedTextWithOffset(Graphics2D g2d, TextLayerInfo textLayer, int offsetX, int offsetY) {
        AttributedString attributedString = new AttributedString(textLayer.text);
        attributedString.addAttribute(TextAttribute.FONT, g2d.getFont());
        attributedString.addAttribute(TextAttribute.FOREGROUND, g2d.getColor());
        
        AttributedCharacterIterator characterIterator = attributedString.getIterator();
        FontRenderContext frc = g2d.getFontRenderContext();
        LineBreakMeasurer measurer = new LineBreakMeasurer(characterIterator, frc);
        
        float wrapWidth = textLayer.maxWidth;
        float anchorX = textLayer.x + offsetX;
        float anchorY = textLayer.y + offsetY;
        
        // 先测量总高度
        List<TextLayout> layouts = new ArrayList<>();
        float totalHeight = 0;
        
        while (measurer.getPosition() < characterIterator.getEndIndex()) {
            TextLayout layout = measurer.nextLayout(wrapWidth);
            layouts.add(layout);
            totalHeight += layout.getAscent() + layout.getDescent() + layout.getLeading();
        }
        
        // 重新测量
        measurer.setPosition(characterIterator.getBeginIndex());
        
        float currentY;
        if (textLayer.alignment == TextAlignment.CENTER) {
            currentY = anchorY - totalHeight / 2;
        } else {
            currentY = anchorY;
        }
        
        for (TextLayout layout : layouts) {
            float drawX;
            float lineWidth = layout.getAdvance();
            
            if (textLayer.alignment == TextAlignment.CENTER) {
                drawX = anchorX - lineWidth / 2;
            } else if (textLayer.alignment == TextAlignment.RIGHT) {
                drawX = anchorX - lineWidth;
            } else {
                drawX = anchorX;
            }
            
            currentY += layout.getAscent();
            layout.draw(g2d, drawX, currentY);
            currentY += layout.getDescent() + layout.getLeading();
        }
    }


    /**
     * 绘制自动换行文本 - 根据对齐方式处理
     */
    private void drawWrappedText(Graphics2D g2d, TextLayerInfo textLayer, Font font) {
        AttributedString attributedString = new AttributedString(textLayer.text);
        attributedString.addAttribute(TextAttribute.FONT, font);
        attributedString.addAttribute(TextAttribute.FOREGROUND, textLayer.color);
        
        AttributedCharacterIterator characterIterator = attributedString.getIterator();
        FontRenderContext frc = g2d.getFontRenderContext();
        LineBreakMeasurer measurer = new LineBreakMeasurer(characterIterator, frc);
        
        float wrapWidth = textLayer.maxWidth;
        float anchorX = textLayer.x;
        float anchorY = textLayer.y;
        
        // 先测量总高度和所有行的布局
        List<TextLayout> layouts = new ArrayList<>();
        float totalHeight = 0;
        
        while (measurer.getPosition() < characterIterator.getEndIndex()) {
            TextLayout layout = measurer.nextLayout(wrapWidth);
            layouts.add(layout);
            totalHeight += layout.getAscent() + layout.getDescent() + layout.getLeading();
        }
        
        // 重新测量（重置measurer）
        measurer.setPosition(characterIterator.getBeginIndex());
        
        float currentY;
        
        if (textLayer.alignment == TextAlignment.CENTER) {
            // 居中：锚点在文本垂直中心
            currentY = anchorY - totalHeight / 2;
        } else {
            // 左对齐或右对齐：锚点在文本顶部
            currentY = anchorY;
        }
        
        for (TextLayout layout : layouts) {
            // 计算当前行的起始X坐标
            float drawX;
            float lineWidth = layout.getAdvance();
            
            if (textLayer.alignment == TextAlignment.CENTER) {
                drawX = anchorX - lineWidth / 2; // 水平居中
            } else if (textLayer.alignment == TextAlignment.RIGHT) {
                drawX = anchorX - lineWidth; // 右对齐
            } else {
                drawX = anchorX; // 左对齐
            }
            
            // 绘制当前行
            currentY += layout.getAscent();
            layout.draw(g2d, drawX, currentY);
            currentY += layout.getDescent() + layout.getLeading();
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
     * 检查文字是否超出边界（锚点居中版本）
     */
    private boolean isTextOutOfBounds(TextLayerInfo textLayer) {
        // 创建临时 Graphics 来获取正确的字体度量
        BufferedImage tempImage = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
        Graphics2D tempG = tempImage.createGraphics();
        
        // 使用中文字体
        Font font = FontLoader.getChineseFont(textLayer.fontSize);
        tempG.setFont(font);
        FontMetrics metrics = tempG.getFontMetrics();
        FontRenderContext frc = tempG.getFontRenderContext();
        
        int textWidth;
        int textHeight;
        
        if (textLayer.maxWidth > 0) {
            // 对于换行文本，计算实际尺寸
            LineBreakMeasurer measurer = new LineBreakMeasurer(
                new AttributedString(textLayer.text).getIterator(), frc);
            
            float totalHeight = 0;
            float maxLineWidth = 0;
            
            while (measurer.getPosition() < textLayer.text.length()) {
                TextLayout layout = measurer.nextLayout(textLayer.maxWidth);
                maxLineWidth = Math.max(maxLineWidth, layout.getAdvance());
                totalHeight += layout.getAscent() + layout.getDescent() + layout.getLeading();
            }
            
            textWidth = (int) maxLineWidth;
            textHeight = (int) totalHeight;
        } else {
            // 单行文本
            textWidth = metrics.stringWidth(textLayer.text);
            textHeight = metrics.getHeight();
        }
        
        tempG.dispose();
        
        // 计算文本边界（锚点居中）
        int left = textLayer.x - textWidth / 2;
        int top = textLayer.y - textHeight / 2;
        int right = textLayer.x + textWidth / 2;
        int bottom = textLayer.y + textHeight / 2;
        
        // 检查边界
        return left < 0 || top < 0 || right > width || bottom > height;
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
        final boolean hasShadow;      // 是否有投影
        final Color shadowColor;      // 投影颜色
        final int shadowOffsetX;      // 投影X偏移
        final int shadowOffsetY;      // 投影Y偏移
        
        TextLayerInfo(String text, int x, int y, int fontSize, Color color, 
                    float rotation, TextAlignment alignment, int maxWidth,
                    boolean hasShadow, Color shadowColor, int shadowOffsetX, int shadowOffsetY) {
            this.text = text;
            this.x = x;
            this.y = y;
            this.fontSize = fontSize;
            this.color = color;
            this.rotation = rotation;
            this.alignment = alignment;
            this.maxWidth = maxWidth;
            this.hasShadow = hasShadow;
            this.shadowColor = shadowColor;
            this.shadowOffsetX = shadowOffsetX;
            this.shadowOffsetY = shadowOffsetY;
        }
        
        // 简化构造函数（向后兼容）
        TextLayerInfo(String text, int x, int y, int fontSize, Color color, 
                    float rotation, TextAlignment alignment, int maxWidth) {
            this(text, x, y, fontSize, color, rotation, alignment, maxWidth,
                false, Color.BLACK, 1, 1);
        }
    }
    
}