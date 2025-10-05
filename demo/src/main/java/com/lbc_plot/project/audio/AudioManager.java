package com.lbc_plot.project.audio;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.config.ProjectConfig;

import javax.sound.sampled.*;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;

/**
 * 音频管理器 - 负责音频文件的加载和元信息获取
 */
public class AudioManager {
    private static final Logger logger = LoggerFactory.getLogger(AudioManager.class);
    
    // 音频时长缓存，避免重复解析
    private static final Map<String, Double> audioDurationCache = new ConcurrentHashMap<>();
    
    // 音频文件基础路径
    private static String audioResourceBasePath = ProjectConfig.AUDIO_BASE_PATH;
    
    /**
     * 设置音频文件基础路径
     */
    public static void setAudioResourceBasePath(String path) {
        audioResourceBasePath = path.endsWith("/") ? path : path + "/";
        logger.info("设置音频资源基础路径: {}", audioResourceBasePath);
    }
    
    /**
     * 从resources目录读取音频文件流
     * @param resourcePath 相对于resources目录的路径
     * @return AudioInputStream 对象
     * @throws IOException 当读取失败时抛出
     */
    public static AudioInputStream readResourceAudio(String resourcePath) throws IOException {
        ClassLoader classLoader = AudioManager.class.getClassLoader();
        InputStream inputStream = classLoader.getResourceAsStream(resourcePath);
        
        if (inputStream == null) {
            throw new IOException("音频资源文件不存在: " + resourcePath);
        }
        
        try {
            return AudioSystem.getAudioInputStream(new BufferedInputStream(inputStream));
        } catch (UnsupportedAudioFileException e) {
            throw new IOException("不支持的音频格式: " + resourcePath, e);
        }
    }
    
    /**
     * 从resources目录读取音频文件为临时文件（用于需要文件路径的API）
     * @param resourcePath 相对于resources目录的路径
     * @return 临时文件
     * @throws IOException 当读取失败时抛出
     */
    public static File readResourceAudioAsTempFile(String resourcePath) throws IOException {
        ClassLoader classLoader = AudioManager.class.getClassLoader();
        InputStream inputStream = classLoader.getResourceAsStream(resourcePath);
        
        if (inputStream == null) {
            throw new IOException("音频资源文件不存在: " + resourcePath);
        }
        
        // 创建临时文件
        String fileName = new File(resourcePath).getName();
        File tempFile = File.createTempFile("audio_", "_" + fileName);
        tempFile.deleteOnExit(); // JVM退出时删除
        
        try (FileOutputStream outputStream = new FileOutputStream(tempFile)) {
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, bytesRead);
            }
        } finally {
            inputStream.close();
        }
        
        logger.debug("音频资源已复制到临时文件: {}", tempFile.getAbsolutePath());
        return tempFile;
    }

    /**
     * 获取音频文件时长（秒）- 支持resources目录
     */
    public static double getAudioDuration(String audioId) throws IOException {
        // 先从缓存获取
        if (audioDurationCache.containsKey(audioId)) {
            return audioDurationCache.get(audioId);
        }
        
        // 先尝试从resources目录查找
        File audioFile = findAudioFileInResources(audioId);
        if (audioFile == null) {
            // 如果resources中找不到，尝试从文件系统查找
            audioFile = findAudioFileInFileSystem(audioId);
        }
        
        if (audioFile == null || !audioFile.exists()) {
            throw new IOException("音频文件不存在: " + audioId);
        }
        
        double duration = parseAudioDuration(audioFile);
        audioDurationCache.put(audioId, duration);
        
        logger.debug("音频时长解析: {} -> {}秒", audioId, duration);
        return duration;
    }

    /**
     * 从resources目录查找音频文件
     */
    private static File findAudioFileInResources(String audioId) {
        // 支持的音频格式
        String[] extensions = {".wav", ".mp3", ".ogg", ".aac", ".m4a"};
        
        for (String ext : extensions) {
            String resourcePath = audioResourceBasePath + audioId + ext;
            try {
                URL resourceUrl = AudioManager.class.getClassLoader().getResource(resourcePath);
                if (resourceUrl != null) {
                    // 对于jar包内的资源，需要复制到临时文件
                    if ("jar".equals(resourceUrl.getProtocol())) {
                        return readResourceAudioAsTempFile(resourcePath);
                    } else {
                        return new File(resourceUrl.getFile());
                    }
                }
            } catch (Exception e) {
                logger.debug("在resources中查找音频文件失败: {}", resourcePath, e);
            }
        }
        
        return null;
    }
    
    /**
     * 从文件系统查找音频文件（原有逻辑）
     */
    public static File findAudioFileInFileSystem(String audioId) {
        // 支持的音频格式
        String[] extensions = {".wav", ".mp3", ".ogg", ".aac", ".m4a"};
        
        // 先尝试当前目录下的audio文件夹
        String[] basePaths = {"audio/", "src/main/resources/audio/", "./"};
        
        for (String basePath : basePaths) {
            for (String ext : extensions) {
                File file = new File(basePath + audioId + ext);
                if (file.exists()) {
                    return file;
                }
                
                // 也检查不带扩展名的文件名
                file = new File(basePath + audioId);
                if (file.exists()) {
                    return file;
                }
            }
        }
        
        logger.warn("在文件系统中找不到音频文件: {}", audioId);
        return null;
    }
    
    /**
     * 解析音频文件时长
     */
    private static double parseAudioDuration(File audioFile) throws IOException {
        try (AudioInputStream audioInputStream = AudioSystem.getAudioInputStream(audioFile)) {
            AudioFormat format = audioInputStream.getFormat();
            long frames = audioInputStream.getFrameLength();
            
            if (frames == AudioSystem.NOT_SPECIFIED) {
                // 如果无法获取帧数，使用备用方法
                return estimateDuration(audioFile);
            }
            
            double duration = frames / format.getFrameRate();
            return duration;
            
        } catch (UnsupportedAudioFileException e) {
            throw new IOException("不支持的音频格式: " + audioFile.getName(), e);
        }
    }
    
    /**
     * 直接从resources获取音频时长（不依赖文件系统）
     */
    public static double getResourceAudioDuration(String resourcePath) throws IOException {
        // 先从缓存获取（使用完整路径作为key）
        String cacheKey = "resource:" + resourcePath;
        if (audioDurationCache.containsKey(cacheKey)) {
            return audioDurationCache.get(cacheKey);
        }
        
        try (AudioInputStream audioStream = readResourceAudio(resourcePath)) {
            AudioFormat format = audioStream.getFormat();
            long frames = audioStream.getFrameLength();
            
            if (frames == AudioSystem.NOT_SPECIFIED) {
                throw new IOException("无法获取音频时长，帧数未指定: " + resourcePath);
            }
            
            double duration = frames / format.getFrameRate();
            audioDurationCache.put(cacheKey, duration);
            
            logger.debug("资源音频时长解析: {} -> {}秒", resourcePath, duration);
            return duration;
        }
    }

    /**
     * 估算音频时长（当无法精确获取时使用）
     */
    private static double estimateDuration(File audioFile) {
        // 根据文件大小估算（这是一个粗略的估算）
        long fileSize = audioFile.length();
        
        // 假设是16位立体声44.1kHz的WAV文件
        // 每秒数据量 = 44100 * 2 * 2 = 176400 字节/秒
        double estimatedDuration = fileSize / 176400.0;
        
        logger.warn("无法精确获取音频时长 {}，使用估算值: {}秒", 
            audioFile.getName(), estimatedDuration);
        
        return estimatedDuration;
    }
    
    /**
     * 查找音频文件
     */
    private static File findAudioFile(String audioId) {
        // 支持的音频格式
        String[] extensions = {".wav", ".mp3", ".ogg", ".aac", ".m4a"};
        
        for (String ext : extensions) {
            File file = new File(audioResourceBasePath + audioId + ext);
            if (file.exists()) {
                return file;
            }
            
            // 也检查不带扩展名的文件名（可能audioId已经包含扩展名）
            file = new File(audioResourceBasePath + audioId);
            if (file.exists()) {
                return file;
            }
        }
        
        logger.warn("找不到音频文件: {}", audioId);
        return null;
    }
    
    /**
     * 清除缓存（当音频文件更新时调用）
     */
    public static void clearCache() {
        audioDurationCache.clear();
        logger.info("音频缓存已清除");
    }
    
    /**
     * 清除指定音频的缓存
     */
    public static void clearCache(String audioId) {
        audioDurationCache.remove(audioId);
        logger.debug("清除音频缓存: {}", audioId);
    }

    /**
     * 获取所有缓存的音频ID（用于调试）
     */
    public static java.util.Set<String> getCachedAudioIds() {
        return java.util.Collections.unmodifiableSet(audioDurationCache.keySet());
    }
}