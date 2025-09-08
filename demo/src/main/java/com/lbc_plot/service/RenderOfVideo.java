package com.lbc_plot.service;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.service.Composer.FrameComposerService;
import com.lbc_plot.service.Composer.model.DialogueSpeed;
import com.lbc_plot.util.VideoExporter;
import com.lbc_plot.core.ProjectConfig;
import com.lbc_plot.model.Record;
import com.lbc_plot.model.video.Dialogue;

public class RenderOfVideo {
    private static final Logger logger = LoggerFactory.getLogger(RenderOfVideo.class);
    


    public static void exportRecordVideo(
        Record record,
        int speed,
        boolean plot,
        int width, 
        int height,
        String outputPath, 
        int frameRate
    ) throws Exception {
        logger.info("开始导出视频: outputPath={}, plot={}, speed={}, frameRate={}, resolution={}x{}",
            outputPath, plot, speed, frameRate, width, height);
        
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
            // List<BufferedImage> recordFrames = generateDialogueFrames(
            //     recordPre, dialogue.getText(), speed, dialogue.isNarrator(), width, height);
            List<BufferedImage> recordFrames = generateSmoothDialogueFrames(
                recordPre, dialogue.getText(), speed, dialogue.isNarrator(), width, height);
            logger.info("逐帧动画生成完成: 总帧数={}", recordFrames.size());
            
            if (recordFrames.isEmpty()) {
                logger.error("生成的帧序列为空，无法导出视频");
                throw new Exception("生成的帧序列为空");
            }
            
            // 4. 导出视频
            logger.debug("开始导出视频文件");
            VideoExporter.exportFrames(recordFrames, outputPath, frameRate);
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
                BufferedImage emptyFrame = addTextToFrame(baseFrame, "", isNarrator, width, height);
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
                
                BufferedImage frame = addTextToFrame(baseFrame, currentText, isNarrator, width, height);
                
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
     * 生成逐字显示的帧序列
     */
    public static List<BufferedImage> generateDialogueFrames(
        BufferedImage staticContent,  // 预渲染的静态内容
        String fullText,              // 完整文本
        int speed,                    // 速度值（1-6）
        boolean isNarrator,           // 是否是旁白
        int width, int height         // 画面尺寸
    ) throws IOException {
        
        List<BufferedImage> frames = new ArrayList<>();
        double charsPerFrame = DialogueSpeed.getCharactersPerFrame(speed);
        double currentChars = 0;
        
        // 复制静态内容作为基础
        BufferedImage baseFrame = copyImage(staticContent);
        
        while (currentChars < fullText.length()) {
            currentChars += charsPerFrame;
            int endIndex = Math.min((int) Math.ceil(currentChars), fullText.length());
            String currentText = fullText.substring(0, endIndex);
            
            // 在当前帧上添加文字
            BufferedImage frameWithText = addTextToFrame(baseFrame, currentText, isNarrator, width, height);
            frames.add(frameWithText);
            
            // 如果是最后几个字符，可以多停留几帧
            if (endIndex == fullText.length()) {
                addStayFrames(frames, frameWithText, 10); // 最后停留10帧
            }
        }
        
        return frames;
    }

    /**
     * 在静态内容上添加当前文本
     */
    private static BufferedImage addTextToFrame(BufferedImage baseFrame, String text, 
                                            boolean isNarrator, int width, int height) {
        if (logger.isTraceEnabled()) {
            logger.trace("添加文本到帧: text='{}', isNarrator={}", 
                text.length() > 30 ? text.substring(0, 27) + "..." : text, isNarrator);
        }


        try {
        // 创建新的帧（复制静态内容）
            BufferedImage frame = copyImage(baseFrame);
        

            // 创建临时的FrameComposerService只用于文字渲染
            FrameComposerService textComposer = new FrameComposerService();
            textComposer.addImageLayer(frame, 0, 0);
            if (isNarrator) {
                textComposer.addDialogueTextCenter(text);
            } else {
                textComposer.addDialogueTextLeft(text);
            }
            
            // 只渲染文字层
            BufferedImage textLayer = textComposer.compose();

            return textLayer;
        } catch (Exception e) {
            logger.error("添加文本到帧失败", e);
            throw new RuntimeException("添加文本失败", e);
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
