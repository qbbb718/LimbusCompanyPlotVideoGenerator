package com.lbc_plot.service.Composer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.core.ProjectConfig;
import com.lbc_plot.util.ImageReader;
import com.lbc_plot.model.repository.MyCharacter;

import java.awt.*;
import java.awt.font.FontRenderContext;
import java.awt.font.LineBreakMeasurer;
import java.awt.font.TextAttribute;
import java.awt.font.TextLayout;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.text.AttributedCharacterIterator;
import java.text.AttributedString;
import java.util.ArrayList;
import java.util.List;

/**
 * 旧版
 * 帧合成器 - 用于视频帧和UI素材的叠加合成
 * 支持多种图层添加方式：原样叠加、百分比缩放、指定像素尺寸缩放
 * 保留所有透明度信息，适合视频帧渲染
 * 
 * 使用示例：
 * FrameComposer composer = new FrameComposer();
 * composer.addLayer("/background.png", 0, 0); // 原样叠加
 * composer.addLayerScaled("/character.png", 100, 200, 0.5f); // 50%缩放
 * composer.addLayerResized("/ui/element.png", 300, 400, 64, 64); // 指定尺寸
 * BufferedImage frame = composer.compose();
 * composer.clearLayers();
 */


 
public class FrameComposer {
    private static final Logger logger = LoggerFactory.getLogger(FrameComposerService.class);
    private static final int DEFAULT_WIDTH = 1920;
    private static final int DEFAULT_HEIGHT = 1080;
    
    private final List<LayerInfo> layers = new ArrayList<>();
    private int width = DEFAULT_WIDTH;  // 默认1080p
    private int height = DEFAULT_HEIGHT;
    
    // 添加文字图层列表
    private List<TextLayerInfo> textLayers = new ArrayList<>();

    /**
     * 设置合成尺寸（可选）
     */
    public void setOutputSize(int width, int height) {
        this.width = width;
        this.height = height;
        logger.debug("设置输出尺寸: {}x{}", width, height);
    }

    /**
     * 重置为默认1080p尺寸
     */
    public void resetToDefaultSize() {
        this.width = DEFAULT_WIDTH;
        this.height = DEFAULT_HEIGHT;
        logger.debug("重置为默认尺寸: {}x{}", DEFAULT_WIDTH, DEFAULT_HEIGHT);
    }


    /**
     * 添加图层 - 原样叠加
     * @param resourcePath 素材路径
     * @param x X坐标
     * @param y Y坐标
     * @throws IOException 读取失败时抛出
     */
    public void addLayer(String resourcePath, int x, int y) throws IOException {
        addLayer(resourcePath, x, y, 1.0f, 1.0f, -1, -1);
    }

    /**
     * 添加图层 - 百分比缩放
     * @param resourcePath 素材路径
     * @param x X坐标
     * @param y Y坐标
     * @param scale 缩放比例 (0.0-1.0)
     * @throws IOException 读取失败时抛出
     */
    public void addLayerScaled(String resourcePath, int x, int y, float scale) throws IOException {
        addLayer(resourcePath, x, y, scale, scale, -1, -1);
    }

    /**
     * 添加图层 - 分别指定宽高缩放比例
     * @param resourcePath 素材路径
     * @param x X坐标
     * @param y Y坐标
     * @param scaleX 水平缩放比例
     * @param scaleY 垂直缩放比例
     * @throws IOException 读取失败时抛出
     */
    public void addLayerScaled(String resourcePath, int x, int y, float scaleX, float scaleY) throws IOException {
        addLayer(resourcePath, x, y, scaleX, scaleY, -1, -1);
    }

    /**
     * 添加图层 - 缩放到指定像素尺寸
     * @param resourcePath 素材路径
     * @param x X坐标
     * @param y Y坐标
     * @param targetWidth 目标宽度(像素)
     * @param targetHeight 目标高度(像素)
     * @throws IOException 读取失败时抛出
     */
    public void addLayerResized(String resourcePath, int x, int y, int targetWidth, int targetHeight) throws IOException {
        addLayer(resourcePath, x, y, 1.0f, 1.0f, targetWidth, targetHeight);
    }




    /**
     * 核心添加图层方法
     */
    private void addLayer(String resourcePath, int x, int y, float scaleX, float scaleY, int targetWidth, int targetHeight) throws IOException {
        long startTime = System.currentTimeMillis();
       
        BufferedImage image = ImageReader.readResourceImage(resourcePath);
        if (image == null) {
            logger.error("无法读取图片资源: {}", resourcePath);
            throw new IOException("图片资源不存在: " + resourcePath);
        }

        // 计算最终尺寸
        int finalWidth = image.getWidth();
        int finalHeight = image.getHeight();
        
        if (targetWidth > 0 && targetHeight > 0) {
            // 指定像素尺寸
            finalWidth = targetWidth;
            finalHeight = targetHeight;
            logger.debug("图层缩放: {} -> {}x{} 像素", resourcePath, targetWidth, targetHeight);
        } else if (scaleX != 1.0f || scaleY != 1.0f) {
            // 百分比缩放
            finalWidth = (int) (image.getWidth() * scaleX);
            finalHeight = (int) (image.getHeight() * scaleY);
            logger.debug("图层缩放: {} -> {:.0f}% x {:.0f}%", 
                resourcePath, scaleX * 100, scaleY * 100);
        }

        LayerInfo layer = new LayerInfo(image, x, y, finalWidth, finalHeight, scaleX, scaleY, targetWidth, targetHeight);
        layers.add(layer);


        long duration = System.currentTimeMillis() - startTime;
        logger.debug("添加图层完成: {}, 位置({},{}), 尺寸{}x{}, 耗时{}ms", 
            resourcePath, x, y, finalWidth, finalHeight, duration);
    }

    /**
     * 添加已加载的BufferedImage图层
     * @param image BufferedImage变量
     * @param x 左上角x坐标
     * @param x 左上角y坐标
     */
    public void addImageLayer(BufferedImage image, int x, int y) {
        addImageLayer(image, x, y, 1.0f, 1.0f, -1, -1);
    }

    public void addImageLayerScaled(BufferedImage image, int x, int y, float scale) {
        addImageLayer(image, x, y, scale, scale, -1, -1);
    }

    public void addImageLayerResized(BufferedImage image, int x, int y, int targetWidth, int targetHeight) {
        addImageLayer(image, x, y, 1.0f, 1.0f, targetWidth, targetHeight);
    }

    private void addImageLayer(BufferedImage image, int x, int y, float scaleX, float scaleY, int targetWidth, int targetHeight) {
        int finalWidth = image.getWidth();
        int finalHeight = image.getHeight();
        
        if (targetWidth > 0 && targetHeight > 0) {
            finalWidth = targetWidth;
            finalHeight = targetHeight;
        } else if (scaleX != 1.0f || scaleY != 1.0f) {
            finalWidth = (int) (image.getWidth() * scaleX);
            finalHeight = (int) (image.getHeight() * scaleY);
        }

        LayerInfo layer = new LayerInfo(image, x, y, finalWidth, finalHeight, scaleX, scaleY, targetWidth, targetHeight);
        layers.add(layer);

        width = Math.max(width, x + finalWidth);
        height = Math.max(height, y + finalHeight);

        logger.debug("添加图像图层: 位置({},{}), 尺寸{}x{}", x, y, finalWidth, finalHeight);
    }






//文字

    
    /**
     * 核心文字添加方法
     */
    private void addTextLayer(String text, int x, int y, int fontSize, Color color, 
                            float rotation, TextAlignment alignment, int maxWidth) {
        TextLayerInfo textLayer = new TextLayerInfo(text, x, y, fontSize, color, rotation, alignment, maxWidth);
        textLayers.add(textLayer);
        
        // 更新画布尺寸（考虑旋转后的边界）
        if (maxWidth > 0) {
            // 对于需要换行的文本，估算最大尺寸
            Font font = new Font("Default", Font.PLAIN, fontSize);
            FontMetrics metrics = new Canvas().getFontMetrics(font);
            String[] words = text.split(" ");
            int estimatedWidth = 0;
            int lineWidth = 0;
            
            for (String word : words) {
                int wordWidth = metrics.stringWidth(word + " ");
                if (lineWidth + wordWidth > maxWidth) {
                    estimatedWidth = Math.max(estimatedWidth, lineWidth);
                    lineWidth = wordWidth;
                } else {
                    lineWidth += wordWidth;
                }
            }
            estimatedWidth = Math.max(estimatedWidth, lineWidth);
            
            // 估算高度（每行高度 * 行数）
            int lineHeight = metrics.getHeight();
            int estimatedHeight = lineHeight * (int) Math.ceil((double) metrics.stringWidth(text) / maxWidth);
            
            width = Math.max(width, x + estimatedWidth);
            height = Math.max(height, y + estimatedHeight);
        } else {
            // 单行文本
            Font font = new Font("Default", Font.PLAIN, fontSize);
            FontMetrics metrics = new Canvas().getFontMetrics(font);
            int textWidth = metrics.stringWidth(text);
            int textHeight = metrics.getHeight();
            
            width = Math.max(width, x + textWidth);
            height = Math.max(height, y + textHeight);
        }
        
        logger.debug("添加文字图层: '{}', 位置({},{}), 字号{}, 颜色{}, 旋转{}度", 
            text, x, y, fontSize, color, rotation);
    }






    /**
     * 修改合成方法，同时绘制图片和文字图层
     */
    public BufferedImage compose() {
        // 创建固定大小的画布
        BufferedImage composedImage = createTransparentImage(width, height);
        Graphics2D g2d = composedImage.createGraphics();
        
        // 设置高质量渲染
        setupHighQualityRendering(g2d);
        
        // 设置裁剪区域
        g2d.setClip(0, 0, width, height);
        
        // 绘制图片图层
        for (int i = 0; i < layers.size(); i++) {
            LayerInfo layer = layers.get(i);
            drawLayer(g2d, layer, i);
        }
        
        // 绘制文字图层
        for (int i = 0; i < textLayers.size(); i++) {
            TextLayerInfo textLayer = textLayers.get(i);
            drawTextLayer(g2d, textLayer, i);
        }
        
        g2d.dispose();
        
        // 记录统计信息
        logCompositionStats();
        
        return composedImage;
    }



    /**
     * 修改统计信息记录，包含文字图层
     */
    private void logCompositionStats() {
        long outOfBoundsLayers = layers.stream()
            .filter(layer -> 
                layer.x < 0 || 
                layer.y < 0 || 
                layer.x + layer.targetWidth > width || 
                layer.y + layer.targetHeight > height)
            .count();
            
        long outOfBoundsTextLayers = textLayers.stream()
            .filter(textLayer -> isTextOutOfBounds(textLayer))
            .count();
            
        logger.info("合成完成: {}x{}, 图片图层{}, 文字图层{}, 其中{}个图片图层和{}个文字图层部分超出边界", 
            width, height, layers.size(), textLayers.size(), outOfBoundsLayers, outOfBoundsTextLayers);
    }

    /**
     * 检查文字是否超出边界
     */
    private boolean isTextOutOfBounds(TextLayerInfo textLayer) {
        // 简化的边界检查，实际应用中可能需要更精确的计算
        return textLayer.x < 0 || textLayer.y < 0 || 
               textLayer.x > width || textLayer.y > height;
    }

    /**
     * 绘制单个图层
     */
    private void drawLayer(Graphics2D g2d, LayerInfo layer, int layerIndex) {
        if (layer.originalWidth == layer.targetWidth && layer.originalHeight == layer.targetHeight) {
            // 原样绘制
            g2d.drawImage(layer.image, layer.x, layer.y, null);
        } else {
            // 缩放绘制
            g2d.drawImage(layer.image, layer.x, layer.y, layer.targetWidth, layer.targetHeight, null);
        }

        if (logger.isTraceEnabled()) {
            logger.trace("绘制图层{}: 位置({},{}), 尺寸{}x{}", 
                layerIndex, layer.x, layer.y, layer.targetWidth, layer.targetHeight);
        }
    }

    /**
     * 绘制文字图层
     */
    private void drawTextLayer(Graphics2D g2d, TextLayerInfo textLayer, int layerIndex) {
        // 保存原始变换
        AffineTransform originalTransform = g2d.getTransform();
        
        // 应用旋转（如果需要）
        if (textLayer.rotation != 0) {
            AffineTransform transform = new AffineTransform();
            transform.rotate(Math.toRadians(textLayer.rotation), textLayer.x, textLayer.y);
            g2d.setTransform(transform);
        }
        
        // 设置字体和颜色
        Font font = new Font("SimHei", Font.PLAIN, textLayer.fontSize); // 使用支持中文的字体
        g2d.setFont(font);
        g2d.setColor(textLayer.color);
        
        if (textLayer.maxWidth > 0) {
            // 需要换行的文本
            drawWrappedText(g2d, textLayer);
        } else {
            // 单行文本
            g2d.drawString(textLayer.text, textLayer.x, textLayer.y + textLayer.fontSize);
        }
        
        // 恢复原始变换
        g2d.setTransform(originalTransform);
        
        if (logger.isTraceEnabled()) {
            logger.trace("绘制文字图层{}: '{}', 位置({},{}), 字号{}", 
                layerIndex, textLayer.text, textLayer.x, textLayer.y, textLayer.fontSize);
        }
    }
    
    /**
     * 绘制自动换行文本
     */
    private void drawWrappedText(Graphics2D g2d, TextLayerInfo textLayer) {
        AttributedString attributedString = new AttributedString(textLayer.text);
        attributedString.addAttribute(TextAttribute.FONT, g2d.getFont());
        attributedString.addAttribute(TextAttribute.FOREGROUND, textLayer.color);
        
        AttributedCharacterIterator characterIterator = attributedString.getIterator();
        FontRenderContext frc = g2d.getFontRenderContext();
        LineBreakMeasurer measurer = new LineBreakMeasurer(characterIterator, frc);
        
        float wrapWidth = textLayer.maxWidth;
        float x = textLayer.x;
        float y = textLayer.y;
        float lineHeight = g2d.getFontMetrics().getHeight();
        
        while (measurer.getPosition() < characterIterator.getEndIndex()) {
            TextLayout layout = measurer.nextLayout(wrapWidth);
            
            // 计算行起始x坐标（用于对齐）
            float drawX = x;
            if (textLayer.alignment == TextAlignment.CENTER) {
                drawX = x + (wrapWidth - layout.getAdvance()) / 2;
            }
            
            y += layout.getAscent();
            layout.draw(g2d, drawX, y);
            y += layout.getDescent() + layout.getLeading();
        }
    }

    /**
     * 设置高质量渲染参数
     */
    private void setupHighQualityRendering(Graphics2D g2d) {
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g2d.setRenderingHint(RenderingHints.KEY_ALPHA_INTERPOLATION, RenderingHints.VALUE_ALPHA_INTERPOLATION_QUALITY);
        g2d.setComposite(AlphaComposite.SrcOver);
    }

    /**
     * 创建透明图像
     */
    private BufferedImage createTransparentImage(int width, int height) {
        return new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
    }

    /**
     * 清空所有图层（包括文字）
     */
    public void clearLayers() {
        layers.clear();
        textLayers.clear();
        width = 0;
        height = 0;
        logger.debug("已清空所有图层和文字");
    }

    /**
     * 获取当前合成尺寸
     */
    public Dimension getCompositionSize() {
        return new Dimension(width, height);
    }

    /**
     * 获取图层数量
     */
    public int getLayerCount() {
        return layers.size();
    }

    /**
     * 文字对齐方式枚举
     */
    private enum TextAlignment {
        LEFT, CENTER
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

    /**
     * 内部类：图层信息
     */
    private static class LayerInfo {
        final BufferedImage image;
        final int x;
        final int y;
        final int originalWidth;
        final int originalHeight;
        final int targetWidth;
        final int targetHeight;
        final float scaleX;
        final float scaleY;

        LayerInfo(BufferedImage image, int x, int y, int targetWidth, int targetHeight, 
                 float scaleX, float scaleY, int explicitWidth, int explicitHeight) {
            this.image = image;
            this.x = x;
            this.y = y;
            this.originalWidth = image.getWidth();
            this.originalHeight = image.getHeight();
            this.targetWidth = targetWidth;
            this.targetHeight = targetHeight;
            this.scaleX = scaleX;
            this.scaleY = scaleY;
        }
    }
}