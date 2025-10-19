package com.lbc_plot.core.Composer;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.font.FontRenderContext;
import java.awt.font.LineBreakMeasurer;
import java.awt.font.TextAttribute;
import java.awt.font.TextLayout;
import java.awt.image.BufferedImage;
import java.text.AttributedCharacterIterator;
import java.text.AttributedString;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.util.RecordDurationCalculator;
import com.lbc_plot.util.RenderQualityUtils;
import com.lbc_plot.util.io.VideoExporter;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.core.Composer.BatchVideoProcessor.RenderResult;
import com.lbc_plot.core.Composer.manager.FontLoader;
import com.lbc_plot.core.Composer.model.TextAlignment;
import com.lbc_plot.model.Record;
import com.lbc_plot.model.video.Dialogue;

/**
 * 视频渲染器 - 流式处理版本
 * 使用流式处理避免内存溢出，支持高质量视频导出
 */
public class RenderOfVideo {
    private static final Logger logger = LoggerFactory.getLogger(RenderOfVideo.class);
    
    /**
     * 高质量流式视频导出 - 避免内存溢出且保证质量
     */
    public static RenderResult exportRecordVideoStreaming(
        Record record,
        boolean plot,
        int width, 
        int height,
        String outputPath, 
        int frameRate
    ) throws Exception {
        
        logger.info("开始高质量流式视频导出: {}", outputPath);
        long startTime = System.currentTimeMillis();
        
        // 在开始时记录内存使用情况
        Runtime runtime = Runtime.getRuntime();
        long initialMemory = runtime.totalMemory() - runtime.freeMemory();
        
        try (VideoExporter exporter = new VideoExporter(outputPath, width, height, frameRate)) {
            
            logger.info("使用编码方式: {}", exporter.getEncodingMethod());
            
            // 1. 计算总帧数
            int requiredFrames = RecordDurationCalculator.calculateDurationFrames(record, frameRate);
            logger.info("需要渲染 {} 帧 (约 {} 秒)", 
                requiredFrames, String.format("%.2f", requiredFrames / (double)frameRate));
            
            // 2. 渲染静态背景（只渲染一次）
            logger.debug("渲染静态背景");
            BufferedImage staticBackground = RenderOfImage.renderPreExceptDialogue(record, plot, width, height);
            
            // 3. 预计算文本动画状态（传入总帧数）
            List<TextAnimationState> textStates = generateTextAnimationStates(
                record.getDialogue(), frameRate, requiredFrames); // 🔥 新增参数
            
            int framesRendered = 0;
            
            // 4. 流式渲染所有帧
            for (int frameIndex = 0; frameIndex < requiredFrames; frameIndex++) {
                // 根据当前帧索引确定文本状态
                String currentText = getTextForFrame(textStates, frameIndex);
                
                // 动态渲染当前帧
                BufferedImage frame = renderSingleFrame(staticBackground, currentText, 
                    record.getDialogue().isNarrator(), width, height);
                
                // 立即写入视频文件
                exporter.writeFrame(frame);
                
                // 立即释放当前帧内存
                frame = null;
                
                framesRendered++;
                
                // 进度和内存监控
                if (framesRendered % 100 == 0) {
                    long currentMemory = runtime.totalMemory() - runtime.freeMemory();
                    long memoryUsed = currentMemory - initialMemory;
                    logger.debug("进度: {}/{} 帧, 内存使用: {} MB", 
                        framesRendered, requiredFrames, 
                        String.format("%.1f", memoryUsed / (1024.0 * 1024.0)));
                }
            }
            
            long duration = System.currentTimeMillis() - startTime;
            long finalMemory = runtime.totalMemory() - runtime.freeMemory();
            long totalMemoryUsed = finalMemory - initialMemory;
            
            logger.info("高质量流式视频导出完成: 共渲染 {} 帧, 耗时: {}ms, 总内存使用: {} MB", 
                framesRendered, duration, 
                String.format("%.1f", totalMemoryUsed / (1024.0 * 1024.0)));
                
            return new RenderResult(framesRendered, startTime, duration);
            
        } catch (Exception e) {
            logger.error("高质量流式视频导出失败", e);
            throw e;
        }
    }

    /**
     * 生成文本动画状态序列（修复延长问题）
     * 现在会正确计算动画帧数，并在动画结束后使用最后一帧定格延长
     */
    private static List<TextAnimationState> generateTextAnimationStates(Dialogue dialogue, int frameRate, int requiredFrames) {
        List<TextAnimationState> states = new ArrayList<>();
        
        if (dialogue == null || dialogue.getText() == null || dialogue.getText().isEmpty()) {
            // 空文本，直接使用空白文本填满所有帧
            states.add(new TextAnimationState("", 0, requiredFrames));
            return states;
        }
        
        String fullText = dialogue.getText();
        float unifiedSpeed = getUnifiedSpeed(dialogue.getSpeed());
        boolean isNarrator = dialogue.isNarrator();
        
        logger.debug("生成文本动画状态: 文本长度={}, 统一速度={}, 需要总帧数={}", 
            fullText.length(), unifiedSpeed, requiredFrames);
        
        int currentFrame = 0;
        int animationFrames = 0;
        
        if (unifiedSpeed < 1.0f) {
            // 慢速模式：每个字符持续多帧
            float framesPerChar = 1.0f / unifiedSpeed;
            int actualFramesPerChar = Math.max(1, Math.round(framesPerChar));
            
            for (int charIndex = 1; charIndex <= fullText.length(); charIndex++) {
                String currentText = fullText.substring(0, charIndex);
                int endFrame = currentFrame + actualFramesPerChar;
                
                // 如果超出总帧数，调整到总帧数
                if (endFrame > requiredFrames) {
                    endFrame = requiredFrames;
                }
                
                states.add(new TextAnimationState(currentText, currentFrame, endFrame));
                currentFrame = endFrame;
                
                // 如果已经达到总帧数，提前结束
                if (currentFrame >= requiredFrames) {
                    break;
                }
            }
            animationFrames = currentFrame;
            
        } else {
            // 快速模式：每帧显示多个字符
            int charsPerFrame = Math.max(1, Math.round(unifiedSpeed));
            int totalAnimationFrames = (int) Math.ceil((double) fullText.length() / charsPerFrame);
            
            for (int frameIndex = 0; frameIndex < totalAnimationFrames; frameIndex++) {
                int endChar = Math.min((frameIndex + 1) * charsPerFrame, fullText.length());
                String currentText = fullText.substring(0, endChar);
                int endFrame = currentFrame + 1;
                
                // 如果超出总帧数，调整到总帧数
                if (endFrame > requiredFrames) {
                    endFrame = requiredFrames;
                }
                
                states.add(new TextAnimationState(currentText, currentFrame, endFrame));
                currentFrame = endFrame;
                
                // 如果已经达到总帧数，提前结束
                if (currentFrame >= requiredFrames) {
                    break;
                }
            }
            animationFrames = currentFrame;
        }
        
        // 🔥 修复：添加定格帧，但只在动画完成后开始
        if (animationFrames < requiredFrames && !states.isEmpty()) {
            TextAnimationState lastState = states.get(states.size() - 1);
            states.add(new TextAnimationState(lastState.text, animationFrames, requiredFrames));
            logger.debug("动画{}帧 + 定格{}帧 = 总{}帧", animationFrames, requiredFrames - animationFrames, requiredFrames);
        } else if (states.isEmpty()) {
            // 如果没有状态，添加空白状态
            states.add(new TextAnimationState("", 0, requiredFrames));
        }
        
        return states;
    }

    /**
     * 根据帧索引获取对应的文本
     */
    private static String getTextForFrame(List<TextAnimationState> textStates, int frameIndex) {
        for (TextAnimationState state : textStates) {
            if (frameIndex >= state.startFrame && frameIndex < state.endFrame) {
                return state.text;
            }
        }
        
        // 如果超出范围，返回最后一个状态的文本
        if (!textStates.isEmpty()) {
            return textStates.get(textStates.size() - 1).text;
        }
        
        return "";
    }

    /**
     * 渲染单帧图像
     */
    private static BufferedImage renderSingleFrame(BufferedImage staticBackground, String text, 
                                                boolean isNarrator, int width, int height) {
        // 复制静态背景
        BufferedImage frame = copyImage(staticBackground);
        Graphics2D g2d = frame.createGraphics();
        
        try {
            // 设置高质量渲染
            RenderQualityUtils.setupUltraQualityRendering(g2d);
            
            // 根据模式选择配置参数
            int x, y, maxWidth, fontSize;
            TextAlignment alignment;
            Color textColor = ProjectConfig.DEFAULT_TEXT_COLOR;
            
            if (isNarrator) {
                x = ProjectConfig.DIALOGUE_CENTER_X;
                y = ProjectConfig.DIALOGUE_CENTER_Y;
                maxWidth = ProjectConfig.DIALOGUE_MAX_WIDTH;
                fontSize = ProjectConfig.DIALOGUE_FONT_SIZE;
                alignment = TextAlignment.CENTER;
            } else {
                x = ProjectConfig.DIALOGUE_LEFT_X;
                y = ProjectConfig.DIALOGUE_LEFT_Y;
                maxWidth = ProjectConfig.DIALOGUE_MAX_WIDTH;
                fontSize = ProjectConfig.DIALOGUE_FONT_SIZE;
                alignment = TextAlignment.LEFT;
            }
            
            // 绘制文字
            drawTextWithAdvancedFeatures(g2d, text, x, y, fontSize, textColor, 
                                    alignment, maxWidth, false, null, 0, 0);
            
        } finally {
            g2d.dispose();
        }
        
        return frame;
    }

    /**
     * 统一速度配置
     * 速度范围：0.1 - 10.0
     * 小于1.0：表示每个字符持续的帧数（慢速）
     * 大于1.0：表示每帧显示的字符数（快速）
     * 等于1.0：1字符/帧（标准速度）
     */
    public static float getUnifiedSpeed(int speedLevel) {
        switch (speedLevel) {
            case 1: return 0.1f;  // 极慢：1字符/10帧
            case 2: return 0.5f;  // 很慢：1字符/2帧
            case 3: return 1.0f;  // 标准：1字符/帧
            case 4: return 2.0f;  // 快速：2字符/帧
            case 5: return 4.0f;  // 很快：4字符/帧
            case 6: return 8.0f;  // 极快：8字符/帧
            default: return 1.0f;
        }
    }

    /**
     * 文本动画状态内部类
     */
    private static class TextAnimationState {
        final String text;
        final int startFrame;
        final int endFrame;
        
        TextAnimationState(String text, int startFrame, int endFrame) {
            this.text = text;
            this.startFrame = startFrame;
            this.endFrame = endFrame;
        }
    }

    // ==================== 文本渲染工具方法 ====================

    /**
     * 绘制带有高级功能的文字（换行、对齐、锚点等）
     */
    private static void drawTextWithAdvancedFeatures(Graphics2D g2d, String text, int x, int y, 
                                                int fontSize, Color color, TextAlignment alignment, 
                                                int maxWidth, boolean hasShadow, Color shadowColor,
                                                int shadowOffsetX, int shadowOffsetY) {
        if (text == null || text.isEmpty()) {
            return;
        }
        
        // 设置字体
        Font font = FontLoader.getChineseFont(fontSize);
        g2d.setFont(font);
        g2d.setColor(color);
        
        // 绘制阴影（如果需要）
        if (hasShadow && shadowColor != null) {
            drawTextWithOffset(g2d, text, x, y, alignment, maxWidth, 
                            shadowOffsetX, shadowOffsetY, shadowColor);
        }
        
        // 绘制主文字
        drawTextWithOffset(g2d, text, x, y, alignment, maxWidth, 0, 0, color);
    }

    /**
     * 绘制带偏移的文字（支持换行和对齐）
     */
    private static void drawTextWithOffset(Graphics2D g2d, String text, int x, int y, 
                                        TextAlignment alignment, int maxWidth,
                                        int offsetX, int offsetY, Color drawColor) {
        if (maxWidth > 0) {
            // 需要换行的文本
            drawWrappedTextWithOffset(g2d, text, x + offsetX, y + offsetY, 
                                    alignment, maxWidth, drawColor);
        } else {
            // 单行文本
            drawSingleLineWithOffset(g2d, text, x + offsetX, y + offsetY, 
                                alignment, drawColor);
        }
    }



    /**
     * 绘制带偏移的单行文本（修正居中对齐）
     */
    private static void drawSingleLineWithOffset(Graphics2D g2d, String text, int x, int y,
                                            TextAlignment alignment, Color color) {
        FontMetrics metrics = g2d.getFontMetrics();
        int textWidth = metrics.stringWidth(text);
        int textHeight = metrics.getHeight(); // 总高度
        int drawX = x;
        int drawY;
        
        if (alignment == TextAlignment.CENTER) {
            // 🔥 修正：文本框中心在(x,y)
            drawX = x - textWidth / 2;        // 水平居中：中心在x
            drawY = y - textHeight / 2 + metrics.getAscent(); // 垂直居中：中心在y
        } else if (alignment == TextAlignment.RIGHT) {
            // 右对齐：文本基线在y坐标，右边界在x坐标
            drawX = x - textWidth;
            drawY = y + metrics.getAscent(); // 基线在y坐标
        } else {
            // 左对齐：文本基线在y坐标，左边界在x坐标
            drawX = x; // 左边界在x坐标
            drawY = y + metrics.getAscent(); // 基线在y坐标
        }
        
        g2d.setColor(color);
        g2d.drawString(text, drawX, drawY);
    }

    /**
     * 绘制带偏移的换行文本（修正居中对齐）
     */
    private static void drawWrappedTextWithOffset(Graphics2D g2d, String text, int x, int y,
                                                TextAlignment alignment, int maxWidth, Color color) {
        // 创建属性字符串
        AttributedString attributedString = new AttributedString(text);
        attributedString.addAttribute(TextAttribute.FONT, g2d.getFont());
        attributedString.addAttribute(TextAttribute.FOREGROUND, color);
        
        AttributedCharacterIterator characterIterator = attributedString.getIterator();
        FontRenderContext frc = g2d.getFontRenderContext();
        LineBreakMeasurer measurer = new LineBreakMeasurer(characterIterator, frc);
        
        // 🔥 修正：先测量总高度，用于垂直居中计算
        float totalHeight = 0;
        List<TextLayout> layouts = new ArrayList<>();
        
        // 第一次循环：测量总高度
        while (measurer.getPosition() < characterIterator.getEndIndex()) {
            TextLayout layout = measurer.nextLayout(maxWidth);
            layouts.add(layout);
            totalHeight += layout.getAscent() + layout.getDescent() + layout.getLeading();
        }
        
        // 重新开始测量
        measurer.setPosition(characterIterator.getBeginIndex());
        
        float currentY;
        if (alignment == TextAlignment.CENTER) {
            // 🔥 修正：文本框中心在(x,y)，计算起始Y坐标
            currentY = y - totalHeight / 2;
        } else {
            // 左对齐/右对齐：文本框顶部在y坐标
            currentY = y;
        }
        
        // 第二次循环：实际绘制
        for (TextLayout layout : layouts) {
            float lineWidth = layout.getAdvance();
            float drawX;
            
            // 根据对齐方式计算X坐标
            if (alignment == TextAlignment.CENTER) {
                drawX = x - lineWidth / 2; // 水平居中：行中心在x
            } else if (alignment == TextAlignment.RIGHT) {
                drawX = x - lineWidth;     // 右对齐：行右边界在x
            } else {
                drawX = x;                 // 左对齐：行左边界在x
            }
            
            // 绘制当前行
            currentY += layout.getAscent();
            layout.draw(g2d, drawX, currentY);
            currentY += layout.getDescent() + layout.getLeading();
        }
    }


    
    // ==================== 工具方法 ====================

    /**
     * 复制图像
     */
    private static BufferedImage copyImage(BufferedImage source) {
        logger.trace("复制图像: {}x{}, type={}", 
            source.getWidth(), source.getHeight(), source.getType());
        
        if (source == null) {
            return null;
        }

        BufferedImage copy = new BufferedImage(
            source.getWidth(), source.getHeight(), source.getType());
        Graphics2D g2d = copy.createGraphics();
        try {
            g2d.drawImage(source, 0, 0, null);
        } finally {
            g2d.dispose();
        }
        
        return copy;
    }
}