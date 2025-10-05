package com.lbc_plot.project.audio;

import java.io.*;
import java.util.Arrays;
import java.util.List;

import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.UnsupportedAudioFileException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 智能音频加载器 - 自动检测格式并转换
 */
public class SmartAudioLoader {
    private static final Logger logger = LoggerFactory.getLogger(SmartAudioLoader.class);
    
    // 原生支持的格式（不需要转换）
    private static final List<String> NATIVE_FORMATS = Arrays.asList(".wav", ".aiff");
    
    // 需要转换的格式
    private static final List<String> CONVERTIBLE_FORMATS = Arrays.asList(
        ".mp3", ".ogg", ".aac", ".m4a", ".flac", ".wma"
    );
    
    // 临时文件目录
    private static final String TEMP_DIR = System.getProperty("java.io.tmpdir") + "/audio_cache/";
    
    static {
        // 创建临时目录
        new File(TEMP_DIR).mkdirs();
    }
    
    /**
     * 智能加载音频文件 - 自动处理格式转换
     * @throws UnsupportedAudioFileException 
     */
    public static AudioInputStream loadAudioSmart(String audioId) throws IOException, UnsupportedAudioFileException {
        logger.debug("智能加载音频: {}", audioId);
        
        // 1. 先尝试直接加载（可能是WAV格式）
        try {
            return loadAudioDirect(audioId);
        } catch (IOException e) {
            logger.debug("直接加载失败，尝试查找并转换: {}", audioId);
        }
        
        // 2. 查找音频文件
        File sourceFile = findAudioFile(audioId);
        if (sourceFile == null) {
            throw new IOException("音频文件不存在: " + audioId);
        }
        
        // 3. 检查格式并处理
        String fileExt = getFileExtension(sourceFile.getName()).toLowerCase();
        
        if (NATIVE_FORMATS.contains(fileExt)) {
            // 原生支持格式，直接加载
            return AudioSystem.getAudioInputStream(sourceFile);
        } else if (CONVERTIBLE_FORMATS.contains(fileExt)) {
            // 需要转换的格式
            return loadWithConversion(sourceFile, audioId);
        } else {
            throw new IOException("不支持的音频格式: " + fileExt);
        }
    }
    
    /**
     * 直接加载音频（假设是WAV格式）
     * @throws UnsupportedAudioFileException 
     */
    private static AudioInputStream loadAudioDirect(String audioId) throws IOException, UnsupportedAudioFileException {
        // 先尝试resources
        try {
            String resourcePath = "audio/" + audioId + ".wav";
            return AudioManager.readResourceAudio(resourcePath);
        } catch (IOException e) {
            // 尝试文件系统
            File audioFile = new File("audio/" + audioId + ".wav");
            if (audioFile.exists()) {
                return AudioSystem.getAudioInputStream(audioFile);
            }
            throw new IOException("WAV文件不存在: " + audioId);
        }
    }
    
    /**
     * 查找音频文件（支持多种格式）
     */
    private static File findAudioFile(String audioId) {
        // 查找的目录
        String[] searchPaths = {"audio/", "src/main/resources/audio/", "./"};
        
        // 先尝试所有支持的格式
        for (String path : searchPaths) {
            for (String format : getAllSupportedFormats()) {
                File file = new File(path + audioId + format);
                if (file.exists()) {
                    logger.debug("找到音频文件: {}", file.getAbsolutePath());
                    return file;
                }
            }
            
            // 也检查audioId本身可能包含扩展名
            File fileWithExt = new File(path + audioId);
            if (fileWithExt.exists()) {
                String ext = getFileExtension(fileWithExt.getName()).toLowerCase();
                if (getAllSupportedFormats().contains(ext)) {
                    logger.debug("找到音频文件(含扩展名): {}", fileWithExt.getAbsolutePath());
                    return fileWithExt;
                }
            }
        }
        
        return null;
    }
    
    /**
     * 通过转换加载音频
     * @throws UnsupportedAudioFileException 
     */
    private static AudioInputStream loadWithConversion(File sourceFile, String audioId) throws IOException, UnsupportedAudioFileException {
        // 检查缓存中是否已有转换后的文件
        File cachedFile = getCachedWavFile(audioId, sourceFile.lastModified());
        
        if (cachedFile.exists()) {
            logger.debug("使用缓存的WAV文件: {}", cachedFile.getName());
            return AudioSystem.getAudioInputStream(cachedFile);
        }
        
        // 需要转换
        logger.info("转换音频格式: {} -> WAV", sourceFile.getName());
        
        try {
            AudioBatchConverter.convertSingleFile(sourceFile, cachedFile);
            return AudioSystem.getAudioInputStream(cachedFile);
        } catch (Exception e) {
            // 转换失败，删除可能生成的不完整文件
            if (cachedFile.exists()) {
                cachedFile.delete();
            }
            throw new IOException("音频格式转换失败: " + sourceFile.getName(), e);
        }
    }
    
    /**
     * 获取缓存文件路径
     */
    private static File getCachedWavFile(String audioId, long sourceModified) {
        // 使用音频ID和源文件修改时间生成缓存文件名
        String cacheName = audioId.hashCode() + "_" + sourceModified + ".wav";
        return new File(TEMP_DIR + cacheName);
    }
    
    /**
     * 获取文件扩展名
     */
    private static String getFileExtension(String fileName) {
        int lastDot = fileName.lastIndexOf('.');
        return lastDot > 0 ? fileName.substring(lastDot) : "";
    }
    
    /**
     * 获取所有支持的格式（原生+可转换）
     */
    private static List<String> getAllSupportedFormats() {
        // 合并两个列表
        return Arrays.asList(".wav", ".aiff", ".mp3", ".ogg", ".aac", ".m4a", ".flac", ".wma");
    }
    
    /**
     * 清理缓存文件
     */
    public static void clearCache() {
        File tempDir = new File(TEMP_DIR);
        if (tempDir.exists()) {
            File[] cacheFiles = tempDir.listFiles((dir, name) -> name.endsWith(".wav"));
            if (cacheFiles != null) {
                int deleted = 0;
                for (File file : cacheFiles) {
                    if (file.delete()) {
                        deleted++;
                    }
                }
                logger.info("清理音频缓存: 删除 {} 个文件", deleted);
            }
        }
    }
}