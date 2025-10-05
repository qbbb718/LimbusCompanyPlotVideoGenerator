package com.lbc_plot.project.audio;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.project.audio.model.AudioCommandType;
import com.lbc_plot.project.audio.model.AudioSegment;
import com.lbc_plot.project.audio.model.AudioTimeline;
import com.lbc_plot.util.ResourceChecker;

/**
 * FFmpeg音频处理器 - 将AudioTimeline转换为FFmpeg命令并执行
 */
public class FFmpegAudioProcessor {
    private static final Logger logger = LoggerFactory.getLogger(FFmpegAudioProcessor.class);


    /**
     * 处理音频时间线并生成音频文件
     */
    public File processAudioTimeline(AudioTimeline timeline, String outputPath) throws IOException {
        List<AudioSegment> segments = timeline.getSegments();
        logger.info("开始FFmpeg音频处理: 输出路径={}, 片段数量={}", outputPath, segments.size());
        
        // 检查是否有音频片段需要处理
        if (segments.isEmpty()) {
            logger.info("没有音频片段需要处理，创建静音音频文件");
            return createSilentAudio(timeline.getTotalDurationSeconds(), outputPath);
        }
        
        long startTime = System.currentTimeMillis();
        
        try {
            // 1. 生成FFmpeg命令
            String ffmpegCommand = generateFFmpegCommand(timeline, outputPath);
            logger.debug("FFmpeg命令: {}", ffmpegCommand);
            
            // 2. 执行命令
            executeFFmpegCommand(ffmpegCommand);
            
            long duration = System.currentTimeMillis() - startTime;
            logger.info("FFmpeg音频处理完成: {}, 耗时: {}ms", outputPath, duration);
            
            return new File(outputPath);
            
        } catch (Exception e) {
            logger.error("FFmpeg音频处理失败", e);
            throw new IOException("音频处理失败: " + e.getMessage(), e);
        }
    }
    
    /**
     * 生成FFmpeg复杂滤镜命令
     * 精确版音频混合 - 更清晰地区分不同类型音频的处理
     */
    private String generateFFmpegCommand(AudioTimeline timeline, String outputPath) {
        StringBuilder cmd = new StringBuilder("ffmpeg -y");
        
        List<AudioSegment> segments = timeline.getSegments();
        
        // 添加所有输入文件
        for (AudioSegment segment : segments) {
            String audioFile = findAudioFilePath(segment.getAudioId());
            cmd.append(" -i \"").append(audioFile).append("\"");
        }
        
        // 构建复杂滤镜（只在有片段时）
        if (!segments.isEmpty()) {
            cmd.append(" -filter_complex \"");
            
            List<String> bgmFilters = new ArrayList<>();    // BGM滤镜
            List<String> sfxFilters = new ArrayList<>();    // 音效/语音滤镜
            int bgmCount = 0;
            int sfxCount = 0;
            
            for (int i = 0; i < segments.size(); i++) {
                AudioSegment segment = segments.get(i);
                double startTime = segment.getStartFrame() / timeline.getFrameRate();
                double duration = (segment.getEndFrame() - segment.getStartFrame()) / timeline.getFrameRate();
                
                if (isBgmSegment(segment)) {
                    // BGM处理：限制播放时长
                    String filter = String.format(
                        "[%d]adelay=%.0f|%.0f,volume=%.2f,atrim=0:%.2f[bgm%d]",
                        i, startTime * 1000, startTime * 1000, segment.getVolume(), duration, bgmCount
                    );
                    bgmFilters.add(filter);
                    bgmCount++;
                    logger.debug("BGM处理: {} 开始{}秒, 限制{}秒", segment.getAudioId(), startTime, duration);
                } else {
                    // 语音/音效处理：完整文件
                    String filter = String.format(
                        "[%d]adelay=%.0f|%.0f,volume=%.2f[sfx%d]",
                        i, startTime * 1000, startTime * 1000, segment.getVolume(), sfxCount
                    );
                    sfxFilters.add(filter);
                    sfxCount++;
                    logger.debug("语音/音效处理: {} 开始{}秒, 完整文件", segment.getAudioId(), startTime);
                }
            }
            
            // 合并所有滤镜
            List<String> allFilters = new ArrayList<>();
            allFilters.addAll(bgmFilters);
            allFilters.addAll(sfxFilters);
            cmd.append(String.join(";", allFilters));
            cmd.append(";");
            
            // 混合所有轨道
            cmd.append(" ");
            for (int i = 0; i < bgmCount; i++) {
                cmd.append("[bgm").append(i).append("]");
            }
            for (int i = 0; i < sfxCount; i++) {
                cmd.append("[sfx").append(i).append("]");
            }
            cmd.append("amix=inputs=").append(segments.size()).append(":duration=longest");
            cmd.append("\"");
        }
        
        // 输出参数
        cmd.append(" -ac 2 -ar 44100 \"").append(outputPath).append("\"");
        
        return cmd.toString();
    }

    /**
     * 判断是否为BGM片段
     */
    private boolean isBgmSegment(AudioSegment segment) {
        return segment.getType() == AudioCommandType.BGM_START;
    }

    /**
     * 创建静音音频文件
     */
    private File createSilentAudio(double duration, String outputPath) throws IOException {
        if (duration <= 0) {
            duration = 1.0; // 默认1秒
        }
        
        // 使用FFmpeg生成静音
        String command = String.format(
            "ffmpeg -y -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -t %.2f \"%s\"",
            duration, outputPath
        );
        
        logger.debug("生成静音音频命令: {}", command);
        executeFFmpegCommand(command);
        
        return new File(outputPath);
    }
    
    /**
     * 查找音频文件路径 
     */
    private String findAudioFilePath(String audioId) {
        return ResourceChecker.findAudioFilePath(audioId);
    }
    
    /**
     * 执行FFmpeg命令
     */
    private static void executeFFmpegCommand(String command) throws IOException {
        logger.info("执行FFmpeg命令: {}", command);
        
        try {
            Process process = Runtime.getRuntime().exec(command);
            
            // 读取输出流
            Thread outputThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        logger.debug("FFmpeg stdout: {}", line);
                    }
                } catch (IOException e) {
                    logger.debug("读取stdout失败", e);
                }
            });
            
            // 读取错误流（FFmpeg主要输出到这里）
            Thread errorThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getErrorStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        logger.info("FFmpeg: {}", line);
                    }
                } catch (IOException e) {
                    logger.debug("读取stderr失败", e);
                }
            });
            
            outputThread.start();
            errorThread.start();
            
            int exitCode = process.waitFor();
            outputThread.join(10000);
            errorThread.join(10000);
            
            if (exitCode != 0) {
                throw new IOException("FFmpeg执行失败，退出码: " + exitCode);
            }
            
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("FFmpeg执行被中断", e);
        }
    }


}