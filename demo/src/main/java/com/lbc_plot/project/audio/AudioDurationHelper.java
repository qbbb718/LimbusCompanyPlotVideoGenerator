package com.lbc_plot.project.audio;

import java.io.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.UnsupportedAudioFileException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.util.ResourceChecker;

/**
 * 音频时长获取工具 - 使用FFmpeg获取音频时长
 */
public class AudioDurationHelper {
    private static final Logger logger = LoggerFactory.getLogger(AudioDurationHelper.class);
    
    // 时长缓存，避免重复查询
    private static final Map<String, Double> durationCache = new ConcurrentHashMap<>();
    
    /**
     * 获取音频文件时长（秒）
     */
    public static double getAudioDuration(String audioId) throws IOException {
        if (durationCache.containsKey(audioId)) {
            return durationCache.get(audioId);
        }
        
        // 使用修复版的路径查找
        String audioPath = ResourceChecker.findAudioFilePath(audioId);
        
        double duration = getDurationWithFFmpeg(audioPath);
        durationCache.put(audioId, duration);
        
        logger.debug("音频时长: {} -> {}秒", audioId, duration);
        return duration;
    }
    
    /**
     * 获取音频文件时长（转换为帧数）
     */
    public static int getAudioFileDurationFrames(String audioId, int frameRate) {
        logger.debug("开始获取音频文件时长 - 文件: {}, 帧率: {}fps", audioId, frameRate);
        
        try {
            double durationSeconds = getAudioDuration(audioId);
            int durationFrames = (int) Math.ceil(durationSeconds * frameRate);
            
            logger.debug("音频文件时长获取成功 - 文件: {}, 原始时长: {}秒, 转换后: {}帧", 
                audioId, String.format("%.3f", durationSeconds), durationFrames);
            
            return durationFrames;
            
        } catch (Exception e) {
            int defaultFrames = 2 * frameRate;
            logger.warn("无法获取音频文件时长 - 文件: {}, 错误: {}, 使用默认值: {}帧 ({}秒)", 
                audioId, e.getMessage(), defaultFrames, 2);
            return defaultFrames;
        }
    }
    
    /**
     * 使用FFmpeg获取音频时长
     */
    private static double getDurationWithFFmpeg(String audioPath) throws IOException {
        // 转义文件路径中的特殊字符
        String escapedPath = escapeFilePath(audioPath);
        
        String command = String.format("ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"%s\"", escapedPath);
        
        logger.debug("获取音频时长: {}", command);
        
        try {
            Process process = Runtime.getRuntime().exec(command);
            
            // 读取输出
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
                
                String output = reader.readLine();
                if (output != null && !output.trim().isEmpty()) {
                    return Double.parseDouble(output.trim());
                }
            }
            
            // 读取错误流
            StringBuilder error = new StringBuilder();
            try (BufferedReader errorReader = new BufferedReader(
                new InputStreamReader(process.getErrorStream()))) {
                
                String line;
                while ((line = errorReader.readLine()) != null) {
                    error.append(line).append("\n");
                }
            }
            
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new IOException("FFprobe执行失败: " + error.toString().trim());
            }
            
            throw new IOException("无法获取音频时长");
            
        } catch (Exception e) {
            if (e instanceof IOException) throw (IOException) e;
            throw new IOException("获取音频时长失败", e);
        }
    }
    
    /**
     * 备选方案：使用Java标准库（仅支持WAV等简单格式）
     */
    private static double getDurationWithJava(String audioPath) throws IOException {
        try {
            File audioFile = new File(audioPath);
            if (!audioFile.exists()) {
                // 尝试从resources加载
                InputStream inputStream = AudioDurationHelper.class.getClassLoader()
                    .getResourceAsStream(audioPath);
                if (inputStream == null) {
                    throw new IOException("音频文件不存在: " + audioPath);
                }
                
                try (AudioInputStream audioStream = AudioSystem.getAudioInputStream(inputStream)) {
                    return calculateDuration(audioStream);
                }
            } else {
                try (AudioInputStream audioStream = AudioSystem.getAudioInputStream(audioFile)) {
                    return calculateDuration(audioStream);
                }
            }
        } catch (UnsupportedAudioFileException e) {
            throw new IOException("不支持的音频格式: " + audioPath, e);
        }
    }
    
    /**
     * 计算音频时长
     */
    private static double calculateDuration(AudioInputStream audioStream) {
        AudioFormat format = audioStream.getFormat();
        long frames = audioStream.getFrameLength();
        
        if (frames == AudioSystem.NOT_SPECIFIED) {
            throw new UnsupportedOperationException("无法获取音频帧数");
        }
        
        return frames / format.getFrameRate();
    }
    
    /**
     * 清除缓存
     */
    public static void clearCache() {
        durationCache.clear();
        logger.debug("音频时长缓存已清除");
    }
    
    /**
     * 清除指定音频的缓存
     */
    public static void clearCache(String audioId) {
        durationCache.remove(audioId);
        logger.debug("清除音频时长缓存: {}", audioId);
    }

    /**
     * 转义文件路径中的特殊字符
     */
    private static String escapeFilePath(String filePath) {
        // 对于Windows路径，确保反斜杠被正确处理
        return filePath.replace("\\", "\\\\");
    }
}