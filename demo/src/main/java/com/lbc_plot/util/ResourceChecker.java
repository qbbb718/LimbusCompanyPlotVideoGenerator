package com.lbc_plot.util;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 资源文件检查工具
 */
public class ResourceChecker {
    private static final Logger logger = LoggerFactory.getLogger(ResourceChecker.class);
    
    /**
     * 检查文件是否存在（支持文件系统和resources目录）
     */
    public static boolean checkFileExists(String filePath) {
        // 1. 先检查文件系统
        File file = new File(filePath);
        if (file.exists()) {
            logger.debug("文件存在于文件系统: {}", file.getAbsolutePath());
            return true;
        }
        
        // 2. 检查resources目录
        try {
            InputStream inputStream = ResourceChecker.class.getClassLoader().getResourceAsStream(filePath);
            if (inputStream != null) {
                inputStream.close();
                logger.debug("文件存在于resources: {}", filePath);
                return true;
            }
        } catch (IOException e) {
            logger.debug("检查resources文件失败: {}", filePath, e);
        }
        
        logger.debug("文件不存在: {}", filePath);
        return false;
    }
    
    /**
     * 查找音频文件路径（支持多种格式）
     */
    public static String findAudioFilePath(String audioId) {
        // 支持的音频格式
        String[] extensions = {".wav", ".mp3", ".ogg", ".aac"};
        
        // 查找的路径
        String[] searchPaths = {
            "audio/",           // audio/目录
            "src/main/resources/audio/", // resources目录
            ""                  // 当前目录
        };
        
        for (String basePath : searchPaths) {
            for (String ext : extensions) {
                String fullPath = basePath + audioId + ext;
                
                // 1. 先检查文件系统
                File file = new File(fullPath);
                if (file.exists()) {
                    logger.debug("文件存在于文件系统: {}", file.getAbsolutePath());
                    return file.getAbsolutePath();
                }
                
                // 2. 检查resources，如果是resources文件，复制到临时文件
                if (isResourceExists(fullPath)) {
                    logger.debug("文件存在于resources: {}", fullPath);
                    return copyResourceToTempFile(fullPath);
                }
            }
            
            // 检查audioId本身可能包含扩展名
            File fileWithExt = new File(basePath + audioId);
            if (fileWithExt.exists()) {
                logger.debug("文件存在于文件系统(含扩展名): {}", fileWithExt.getAbsolutePath());
                return fileWithExt.getAbsolutePath();
            }
        }
        
        logger.warn("未找到音频文件: {}", audioId);
        return audioId; // 返回原值，让FFmpeg处理错误
    }


    /**
     * 检查资源文件是否存在
     */
    private static boolean isResourceExists(String resourcePath) {
        try {
            InputStream inputStream = ResourceChecker.class.getClassLoader().getResourceAsStream(resourcePath);
            if (inputStream != null) {
                inputStream.close();
                return true;
            }
        } catch (IOException e) {
            logger.debug("检查resources文件失败: {}", resourcePath, e);
        }
        return false;
    }
    
    /**
     * 将resources中的文件复制到临时文件
     */
    private static String copyResourceToTempFile(String resourcePath) throws RuntimeException {
        try {
            InputStream inputStream = ResourceChecker.class.getClassLoader().getResourceAsStream(resourcePath);
            if (inputStream == null) {
                throw new IOException("资源文件不存在: " + resourcePath);
            }
            
            // 创建临时文件
            String fileName = new File(resourcePath).getName();
            File tempFile = File.createTempFile("audio_", "_" + fileName);
            tempFile.deleteOnExit();
            
            // 复制数据
            try (FileOutputStream outputStream = new FileOutputStream(tempFile)) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                }
            } finally {
                inputStream.close();
            }
            
            logger.debug("资源文件已复制到临时文件: {}", tempFile.getAbsolutePath());
            return tempFile.getAbsolutePath();
            
        } catch (IOException e) {
            throw new RuntimeException("复制资源文件失败: " + resourcePath, e);
        }
    }
}