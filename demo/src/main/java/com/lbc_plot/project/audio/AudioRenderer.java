package com.lbc_plot.project.audio;


import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sound.sampled.*;
import java.io.*;
import java.util.List;

/**
 * 音频渲染器 - 完全基于Java标准库
 */
public class AudioRenderer {
    private static final Logger logger = LoggerFactory.getLogger(AudioRenderer.class);
    
    // 输出音频格式
    private static final AudioFormat OUTPUT_FORMAT = new AudioFormat(
        44100,      // 44.1kHz 采样率
        16,         // 16-bit 采样位数
        2,          // 立体声
        true,       // 有符号
        false       // 小端序
    );
    
    /**
     * 渲染音频时间线
     */
    public File renderAudio(AudioTimeline timeline, String outputPath, double frameRate) throws IOException {
        logger.info("开始渲染音频: 输出路径={}, 总帧数={}, 帧率={}fps", 
            outputPath, timeline.getTotalFrames(), frameRate);
        
        long startTime = System.currentTimeMillis();
        
        try {
            // 计算总时长（秒）
            double totalDuration = timeline.getTotalFrames() / frameRate;
            
            // 创建混合器
            AudioMixer mixer = new AudioMixer(totalDuration, OUTPUT_FORMAT);
            
            // 处理所有音频片段
            processAudioSegments(timeline.getSegments(), frameRate, mixer);
            
            // 导出混合后的音频文件
            File outputFile = new File(outputPath);
            mixer.exportToFile(outputFile);
            
            long duration = System.currentTimeMillis() - startTime;
            logger.info("音频渲染完成: {}, 耗时: {}ms", outputPath, duration);
            
            return outputFile;
            
        } catch (Exception e) {
            logger.error("音频渲染失败", e);
            throw new IOException("音频渲染失败: " + e.getMessage(), e);
        }
    }
    
    /**
     * 处理音频片段
     */
    private void processAudioSegments(List<AudioSegment> segments, double frameRate, AudioMixer mixer) 
            throws IOException {
        logger.debug("开始处理 {} 个音频片段", segments.size());
        
        int successCount = 0;
        int failCount = 0;
        
        for (AudioSegment segment : segments) {
            try {
                // 计算时间信息
                double startTime = segment.getStartFrame() / frameRate;
                double endTime = segment.getEndFrame() / frameRate;
                double duration = endTime - startTime;
                
                if (duration <= 0) {
                    logger.warn("音频片段时长无效: {}秒, 跳过", duration);
                    failCount++;
                    continue;
                }
                
                // 加载音频流
                AudioInputStream audioStream = loadAudioStream(segment.getAudioId());
                
                // 添加到混合器
                mixer.addAudioSegment(audioStream, startTime, duration, segment.getVolume());
                successCount++;
                
                logger.debug("成功添加音频片段: {} @ {}-{}秒, 音量: {}", 
                    segment.getAudioId(), startTime, endTime, segment.getVolume());
                
            } catch (Exception e) {
                logger.warn("处理音频片段失败 {}: {}", segment.getAudioId(), e.getMessage());
                failCount++;
            }
        }
        
        logger.info("音频片段处理完成: 成功 {} 个, 失败 {} 个", successCount, failCount);
    }
    
    /**
     * 加载音频流 - 替换原来的loadAudioClip方法
     * @throws UnsupportedAudioFileException 
     */
    private AudioInputStream loadAudioStream(String audioId) throws IOException, UnsupportedAudioFileException {
        logger.debug("加载音频流: {}", audioId);
        
        // 使用智能加载器（支持自动格式转换）
        return SmartAudioLoader.loadAudioSmart(audioId);
    }
}