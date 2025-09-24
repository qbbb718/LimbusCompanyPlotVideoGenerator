package com.lbc_plot.application.Composer;

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
import java.io.IOException;
import java.text.AttributedCharacterIterator;
import java.text.AttributedString;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.util.RenderQualityUtils;
import com.lbc_plot.util.io.VideoExporter;
import com.lbc_plot.application.Composer.manager.FontLoader;
import com.lbc_plot.application.Composer.model.DialogueSpeed;
import com.lbc_plot.application.Composer.model.TextAlignment;
import com.lbc_plot.application.Composer.model.TextLayerInfo;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.model.Record;
import com.lbc_plot.model.video.Dialogue;

/**
 * 渲染视频
 */
public class RenderOfVideo {
    private static final Logger logger = LoggerFactory.getLogger(RenderOfVideo.class);
    


    public static void exportRecordVideo(
        Record record,
        boolean plot,
        int width, 
        int height,
        String outputPath, 
        int frameRate
    ) throws Exception {
        logger.info("开始导出视频: outputPath={}, plot={}, speed={}, frameRate={}, resolution={}x{}",
            outputPath, plot,  frameRate, width, height);
        
        long startTime = System.currentTimeMillis();
        
        try {
            // 1. 渲染除对话外的静态内容
            logger.debug("开始渲染静态内容（除对话外）");
            BufferedImage recordPre = RenderOfImage.renderPreExceptDialogue(record, plot, width, height);
            logger.info("静态内容渲染完成: 尺寸{}x{}", 
                recordPre.getWidth(), recordPre.getHeight());
            
            // 2. 获取对话信息
            Dialogue dialogue = record.getDialogue();
            if (dialogue == null) {
                logger.warn("记录中没有对话信息，使用空对话");
                dialogue = Dialogue.builder().build(); // 假设有默认构造函数
            }
            
            logger.debug("对话信息: textLength={}, isNarrator={}, textPreview='{}'",
                dialogue.getText() != null ? dialogue.getText().length() : 0,
                dialogue.isNarrator(),
                dialogue.getText() != null ? 
                    (dialogue.getText().length() > 50 ? 
                     dialogue.getText().substring(0, 47) + "..." : 
                     dialogue.getText()) : "null");
            
            // 3. 生成逐帧动画
            logger.debug("开始生成逐帧动画");
            List<BufferedImage> recordFrames = generateSmoothDialogueFrames(
                recordPre, dialogue.getText(), dialogue.getSpeed(), dialogue.isNarrator(), width, height);
            logger.info("逐帧动画生成完成: 总帧数={}", recordFrames.size());
            
            if (recordFrames.isEmpty()) {
                logger.error("生成的帧序列为空，无法导出视频");
                throw new Exception("生成的帧序列为空");
            }
            
            // 4. 导出视频
            logger.debug("开始导出视频文件");
            VideoExporter.exportFramesHighQuality(recordFrames, outputPath, frameRate);
            logger.info("视频导出完成: {}", outputPath);
            
        } catch (Exception e) {
            logger.error("视频导出失败", e);
            throw e;
        } finally {
            long duration = System.currentTimeMillis() - startTime;
            logger.info("视频导出流程完成，耗时: {}ms", duration);
        }
    }
    

    /**
     * 生成平滑的逐字显示帧序列
     * @param staticContent 静态背景内容
     * @param fullText 完整文本
     * @param framesPerChar 每个字符显示的帧数（建议2-4帧）
     * @param isNarrator 是否是旁白
     * @return 平滑的帧序列
     */
    public static List<BufferedImage> generateSmoothDialogueFrames(
        BufferedImage staticContent,
        String fullText,
        int framesPerChar,
        boolean isNarrator,
        int width, int height
    ) {
        logger.debug("生成平滑帧序列: framesPerChar={}, isNarrator={}, textLength={}",
            framesPerChar, isNarrator, fullText != null ? fullText.length() : 0);
        
        List<BufferedImage> frames = new ArrayList<>();
        long startTime = System.currentTimeMillis();
        
        try {
            if (fullText == null) {
                logger.warn("fullText为null，设置为空字符串");
                fullText = "";
            }
            
            // 复制静态内容作为基础
            BufferedImage baseFrame = copyImage(staticContent);
            logger.debug("静态内容复制完成");
            
            // 处理空文本情况
            if (fullText.isEmpty()) {
                logger.info("文本为空，生成单帧空文本画面");
                BufferedImage emptyFrame = addTextToFrameAdvanced(baseFrame, "", isNarrator, width, height);
                frames.add(emptyFrame);
                return frames;
            }
            
            // 生成逐字动画帧
            logger.debug("开始逐字生成帧，文本长度: {}", fullText.length());
            int totalFramesExpected = fullText.length() * framesPerChar;
            
            for (int charIndex = 1; charIndex <= fullText.length(); charIndex++) {

                String currentText = fullText.substring(0, charIndex);
                
                if (logger.isTraceEnabled()) {
                    logger.trace("处理字符索引: {}, 当前文本: '{}'", charIndex, 
                        currentText.length() > 20 ? currentText.substring(0, 17) + "..." : currentText);
                }
                
                BufferedImage frame = addTextToFrameAdvanced(baseFrame, currentText, isNarrator, width, height);
                
                // 为每个字符状态生成指定数量的帧
                for (int frameCount = 0; frameCount < framesPerChar; frameCount++) {
                    frames.add(frame);
                    
                    // 每生成100帧记录一次进度
                    if (frames.size() % 100 == 0) {
                        logger.debug("已生成 {} 帧", frames.size());
                    }
                }
            }
            
            logger.info("逐字帧生成完成: 实际生成 {} 帧 (预期: {} 帧)", 
                frames.size(), totalFramesExpected);
            
            // 只在有实际文本时添加停留帧
            if (!frames.isEmpty()) {
                logger.debug("添加停留帧: {} 帧", ProjectConfig.DEFAULT_STAY_FRAMES);
                BufferedImage lastFrame = frames.get(frames.size() - 1);
                for (int i = 0; i < ProjectConfig.DEFAULT_STAY_FRAMES; i++) {
                    frames.add(lastFrame);
                }
                logger.info("添加停留帧后总帧数: {}", frames.size());
            }
            
            return frames;
            
        } catch (Exception e) {
            logger.error("生成平滑帧序列时发生异常", e);
            throw new RuntimeException("生成帧序列失败", e);
        } finally {
            long duration = System.currentTimeMillis() - startTime;
            logger.debug("平滑帧序列生成完成，耗时: {}ms", duration);
        }
    }
    
    /**
     * 基于速度值获取推荐的帧数配置
     * @param speed 速度值（1-6，1最慢，6最快）
     * @return 推荐的每个字符帧数
     */
    public static int getRecommendedFramesPerChar(int speed) {
        // 速度值映射：值越大，每个字符显示的帧数越少（速度越快）
        switch (speed) {
            case 1: return 4; // 很慢
            case 2: return 3; // 慢
            case 3: return 2; // 中等
            case 4: return 2; // 快
            case 5: return 1; // 很快
            case 6: return 1; // 极快
            default: return 2; // 默认中等
        }
    }


    /**
     * 高效版本：直接渲染文字到帧上（包含换行、对齐、锚点等高级功能）
     * 
     * @param baseFrame 基础背景帧
     * @param text 要渲染的文本
     * @param isNarrator 是否为旁白模式
     * @param width 画布宽度
     * @param height 画布高度
     * @return 包含文字的图像帧
     */
    private static BufferedImage addTextToFrameAdvanced(BufferedImage baseFrame, String text, 
                                                    boolean isNarrator, int width, int height) {
        try {
            // 复制基础帧
            BufferedImage frame = copyImage(baseFrame);
            Graphics2D g2d = frame.createGraphics();
            
            // 设置超高质量渲染
            RenderQualityUtils.setupUltraQualityRendering(g2d);
            
            // 根据模式选择配置参数
            int x, y, maxWidth, fontSize;
            TextAlignment alignment;
            Color textColor = ProjectConfig.DEFAULT_TEXT_COLOR;
            
            if (isNarrator) {
                // 旁白模式：居中显示
                x = ProjectConfig.DIALOGUE_CENTER_X;
                y = ProjectConfig.DIALOGUE_CENTER_Y;
                maxWidth = ProjectConfig.DIALOGUE_MAX_WIDTH;
                fontSize = ProjectConfig.DIALOGUE_FONT_SIZE;
                alignment = TextAlignment.CENTER;
            } else {
                // 对话模式：左对齐
                x = ProjectConfig.DIALOGUE_LEFT_X;
                y = ProjectConfig.DIALOGUE_LEFT_Y;
                maxWidth = ProjectConfig.DIALOGUE_MAX_WIDTH;
                fontSize = ProjectConfig.DIALOGUE_FONT_SIZE;
                alignment = TextAlignment.LEFT;
            }
            
            // 绘制文字（包含所有高级功能）
            drawTextWithAdvancedFeatures(g2d, text, x, y, fontSize, textColor, 
                                    alignment, maxWidth, false, null, 0, 0);
            
            g2d.dispose();
            return frame;
            
        } catch (Exception e) {
            logger.error("添加文本到帧失败", e);
            throw new RuntimeException("添加文本失败", e);
        }
    }

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
     * 绘制带偏移的单行文本
     */
    private static void drawSingleLineWithOffset(Graphics2D g2d, String text, int x, int y,
                                            TextAlignment alignment, Color color) {
        FontMetrics metrics = g2d.getFontMetrics();
        int textWidth = metrics.stringWidth(text);
        int drawX = x;
        int drawY = y + metrics.getAscent(); // 基线位置
        
        // 根据对齐方式调整X坐标
        if (alignment == TextAlignment.CENTER) {
            drawX = x - textWidth / 2;
        } else if (alignment == TextAlignment.RIGHT) {
            drawX = x - textWidth;
        }
        
        g2d.setColor(color);
        g2d.drawString(text, drawX, drawY);
    }

    /**
     * 绘制带偏移的换行文本（支持自动换行和对齐）
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
        
        // 先测量总高度
        List<TextLayout> layouts = new ArrayList<>();
        float totalHeight = 0;
        
        while (measurer.getPosition() < characterIterator.getEndIndex()) {
            TextLayout layout = measurer.nextLayout(maxWidth);
            layouts.add(layout);
            totalHeight += layout.getAscent() + layout.getDescent() + layout.getLeading();
        }
        
        // 重新开始测量
        measurer.setPosition(characterIterator.getBeginIndex());
        
        // 计算起始Y坐标（考虑对齐方式）
        float currentY;
        if (alignment == TextAlignment.CENTER) {
            // 居中：锚点Y在文本垂直中心
            currentY = y - totalHeight / 2;
        } else {
            // 左对齐/右对齐：锚点Y在文本顶部
            currentY = y;
        }
        
        // 绘制每一行
        for (TextLayout layout : layouts) {
            float lineWidth = layout.getAdvance();
            float drawX;
            
            // 根据对齐方式计算X坐标
            if (alignment == TextAlignment.CENTER) {
                drawX = x - lineWidth / 2; // 水平居中
            } else if (alignment == TextAlignment.RIGHT) {
                drawX = x - lineWidth;     // 右对齐
            } else {
                drawX = x;                 // 左对齐
            }
            
            // 绘制当前行
            currentY += layout.getAscent();
            layout.draw(g2d, drawX, currentY);
            currentY += layout.getDescent() + layout.getLeading();
        }
    }

    /**
     * 计算文字边界（用于画布尺寸调整）
     */
    private static Rectangle calculateTextBounds(String text, int x, int y, int fontSize, 
                                            TextAlignment alignment, int maxWidth) {
        // 创建临时Graphics进行测量
        BufferedImage tempImage = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
        Graphics2D tempG = tempImage.createGraphics();
        RenderQualityUtils.setupUltraQualityRendering(tempG);
        
        Font font = FontLoader.getChineseFont(fontSize);
        tempG.setFont(font);
        FontMetrics metrics = tempG.getFontMetrics();
        FontRenderContext frc = tempG.getFontRenderContext();
        
        try {
            if (maxWidth > 0) {
                // 换行文本的边界计算
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
                    left = (int) (x - maxLineWidth / 2);
                    top = (int) (y - totalHeight / 2);
                    right = (int) (x + maxLineWidth / 2);
                    bottom = (int) (y + totalHeight / 2);
                } else if (alignment == TextAlignment.RIGHT) {
                    left = (int) (x - maxLineWidth);
                    top = y;
                    right = x;
                    bottom = (int) (y + totalHeight);
                } else {
                    left = x;
                    top = y;
                    right = (int) (x + maxLineWidth);
                    bottom = (int) (y + totalHeight);
                }
                
                return new Rectangle(left, top, right - left, bottom - top);
                
            } else {
                // 单行文本的边界计算
                int textWidth = metrics.stringWidth(text);
                int textHeight = metrics.getHeight();
                
                int left, top, right, bottom;
                
                if (alignment == TextAlignment.CENTER) {
                    left = x - textWidth / 2;
                    top = y - textHeight / 2;
                    right = x + textWidth / 2;
                    bottom = y + textHeight / 2;
                } else if (alignment == TextAlignment.RIGHT) {
                    left = x - textWidth;
                    top = y;
                    right = x;
                    bottom = y + textHeight;
                } else {
                    left = x;
                    top = y;
                    right = x + textWidth;
                    bottom = y + textHeight;
                }
                
                return new Rectangle(left, top, right - left, bottom - top);
            }
        } finally {
            tempG.dispose();
        }
    }

    




    /**
     * 添加停留帧（让最后一帧多显示一会儿）
     */
    private static void addStayFrames(List<BufferedImage> frames, BufferedImage lastFrame, int stayFrames) {
        for (int i = 0; i < stayFrames; i++) {
            frames.add(lastFrame);
        }
        // 这样最后一帧会重复10次，延长显示时间
    }

    /**
     * 复制图像（带日志）
     */
    private static BufferedImage copyImage(BufferedImage source) {
        logger.trace("复制图像: {}x{}, type={}", 
            source.getWidth(), source.getHeight(), source.getType());
        
        BufferedImage copy = new BufferedImage(
            source.getWidth(), source.getHeight(), source.getType());
        Graphics2D g2d = copy.createGraphics();
        g2d.drawImage(source, 0, 0, null);
        g2d.dispose();
        
        return copy;
    }

}
