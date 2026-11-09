package com.lbc_plot.render.engine.manager;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.font.FontRenderContext;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.common.util.RenderQualityUtils;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.render.engine.contract.TextLayerOperations;
import com.lbc_plot.render.engine.model.TextAlignment;

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
                ProjectConfig.SHADOW_OFFSET_DEFAULT_Y);
    }

    /**
     * 添加角色名文字图层
     */
    public void addCharacterNameText(String text, Color color) {
        addTextLayer(text,
                ProjectConfig.CHARACTER_NAME_X,
                ProjectConfig.CHARACTER_NAME_Y,
                ProjectConfig.CHARACTER_NAME_FONT_SIZE,
                color, // 使用传入的颜色
                ProjectConfig.CHARACTER_NAME_ROTATION,
                TextAlignment.CENTER,
                ProjectConfig.CHARACTER_MAX_WIDTH,
                true,
                Color.BLACK,
                ProjectConfig.SHADOW_OFFSET_NAME_X,
                ProjectConfig.SHADOW_OFFSET_NAME_Y);
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
                ProjectConfig.SHADOW_OFFSET_NAME_X - 1,
                ProjectConfig.SHADOW_OFFSET_NAME_Y);
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
                0);
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
                0);
    }

    /**
     * 添加"自由文本"对话文字图层。
     *
     * <p>与旁白一致：同一套中文字体，文字块锚定在传入的中心点（默认是画面水平与垂直中心，
     * 可由用户通过 X/Y 偏移调整）；字号、文字颜色、加粗 / 斜体均支持自定义。
     */
    public void addDialogueTextFreeText(String text, boolean bold, boolean italic, Color color,
            int fontSize, int centerX, int centerY) {
        int fontStyle = Font.PLAIN;
        if (bold) {
            fontStyle |= Font.BOLD;
        }
        if (italic) {
            fontStyle |= Font.ITALIC;
        }

        addTextLayer(text,
                centerX,
                centerY,
                (fontSize > 0) ? fontSize : ProjectConfig.DIALOGUE_FONT_SIZE,
                (color != null) ? color : ProjectConfig.DEFAULT_TEXT_COLOR,
                0,
                TextAlignment.CENTER,
                ProjectConfig.DIALOGUE_MAX_WIDTH,
                false,
                null,
                0,
                0,
                fontStyle);
    }

    /**
     * 核心文字添加方法 - 根据对齐方式采用不同的锚点逻辑
     */
    private void addTextLayer(String text, int x, int y, int fontSize, Color color,
            float rotation, TextAlignment alignment, int maxWidth,
            boolean hasShadow, Color shadowColor, int shadowOffsetX, int shadowOffsetY) {
        addTextLayer(text, x, y, fontSize, color, rotation, alignment, maxWidth,
                hasShadow, shadowColor, shadowOffsetX, shadowOffsetY, Font.PLAIN);
    }

    /**
     * 核心文字添加方法（带字体样式：加粗 / 斜体）
     *
     * @param fontStyle {@link Font#PLAIN} / {@link Font#BOLD} / {@link Font#ITALIC} 的组合
     */
    private void addTextLayer(String text, int x, int y, int fontSize, Color color,
            float rotation, TextAlignment alignment, int maxWidth,
            boolean hasShadow, Color shadowColor, int shadowOffsetX, int shadowOffsetY,
            int fontStyle) {
        TextLayerInfo textLayer = new TextLayerInfo(text, x, y, fontSize, color, rotation,
                alignment, maxWidth, hasShadow,
                shadowColor, shadowOffsetX, shadowOffsetY, fontStyle);
        textLayers.add(textLayer);

        // 使用中文字体进行尺寸计算（加粗/斜体要使用同一套样式字体，否则测量与绘制不一致）
        Font chineseFont = FontLoader.getChineseFont(fontStyle, fontSize);

        // 创建临时Graphics获取字体渲染上下文
        BufferedImage tempImage = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
        Graphics2D tempG = tempImage.createGraphics();
        RenderQualityUtils.setupUltraQualityRendering(tempG); // 设置高质量渲染
        tempG.setFont(chineseFont);
        FontRenderContext frc = tempG.getFontRenderContext();

        // 排版规则与绘制完全一致（同一个 TextLineBreaker）：对话内容里的换行是硬换行，
        // 超宽时再自动折行，空行占一行行高——测量和绘制的行数/行高必须对得上，
        // 否则居中、画布撑大都会算偏。
        List<TextLineBreaker.Line> lines = TextLineBreaker.layout(text, chineseFont, frc, maxWidth);
        float totalHeight = TextLineBreaker.totalHeight(lines);
        float maxLineWidth = TextLineBreaker.maxAdvance(lines);

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

        // 未锁定画布尺寸时才撑大画布（固定尺寸下超出的文字在合成时被裁掉）
        growCanvasTo(right, bottom);

        tempG.dispose();

        logger.debug("添加文字图层: '{}', 位置({},{}), 对齐{}, 字号{}, 颜色{}, 行数{}",
                text, x, y, alignment, fontSize, color, lines.size());
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

        // 设置中文字体和抗锯齿（加粗/斜体使用同一套样式字体）
        Font chineseFont = FontLoader.getChineseFont(textLayer.fontStyle, textLayer.fontSize);
        g2d.setFont(chineseFont);
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING,
                RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

        if (textLayer.hasShadow) {
            // 先绘制投影（颜色必须显式传：Graphics2D 上残留的颜色是上一个图层留下的，
            // 改造前这里只 setColor 不传参，正文颜色靠 AttributedString 的 FOREGROUND 属性，
            // 现在排版与颜色解耦，颜色只能由调用方给出）
            drawTextContent(g2d, textLayer, textLayer.shadowOffsetX, textLayer.shadowOffsetY,
                    textLayer.shadowColor, textLayer.bold);
        }

        // 再绘制主文字
        drawTextContent(g2d, textLayer, 0, 0, textLayer.color, textLayer.bold);

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
     *
     * <p>与 {@link #addTextLayer} 用同一套排版（{@link TextLineBreaker}）：
     * 对话内容里的换行是硬换行，超宽再自动折行；对齐方式与投影偏移的语义与改造前一致。
     *
     * @param color 文字颜色（投影传投影色，正文传图层色）
     * @param bold  是否用轮廓描边模拟加粗（当前字体没有独立 Bold 字重）
     */
    private void drawTextContent(Graphics2D g2d, TextLayerInfo textLayer, int offsetX, int offsetY,
            Color color, boolean bold) {
        List<TextLineBreaker.Line> lines = TextLineBreaker.layout(
                textLayer.text, FontLoader.getChineseFont(textLayer.fontStyle, textLayer.fontSize),
                g2d.getFontRenderContext(), textLayer.maxWidth);
        TextLineBreaker.drawLines(g2d, lines,
                textLayer.x + offsetX, textLayer.y + offsetY,
                textLayer.alignment, color, bold, textLayer.fontSize);
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
        final boolean hasShadow; // 是否有投影
        final Color shadowColor; // 投影颜色
        final int shadowOffsetX; // 投影X偏移
        final int shadowOffsetY; // 投影Y偏移
        final int fontStyle; // 字体样式（Font.PLAIN / BOLD / ITALIC 组合）
        final boolean bold; // 是否需要模拟加粗（由 fontStyle 推导）

        TextLayerInfo(String text, int x, int y, int fontSize, Color color,
                float rotation, TextAlignment alignment, int maxWidth,
                boolean hasShadow, Color shadowColor, int shadowOffsetX, int shadowOffsetY,
                int fontStyle) {
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
            this.fontStyle = fontStyle;
            this.bold = (fontStyle & Font.BOLD) != 0;
        }

        // 简化构造函数（向后兼容）
        TextLayerInfo(String text, int x, int y, int fontSize, Color color,
                float rotation, TextAlignment alignment, int maxWidth) {
            this(text, x, y, fontSize, color, rotation, alignment, maxWidth,
                    false, Color.BLACK, 1, 1, Font.PLAIN);
        }
    }

}
