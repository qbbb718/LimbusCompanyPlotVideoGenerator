package com.lbc_plot.project.audio;
import java.io.*;
import java.util.Arrays;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


/**
 * 音频批量转换工具 - 将其他格式转换为WAV
 */
public class AudioBatchConverter {
    private static final Logger logger = LoggerFactory.getLogger(AudioBatchConverter.class);
    
    // 支持的输入格式
    private static final List<String> SUPPORTED_INPUT_FORMATS = Arrays.asList(
        ".mp3", ".ogg", ".aac", ".m4a", ".flac"
    );
    
    // FFmpeg路径（如果不在系统PATH中，需要指定完整路径）
    private static String ffmpegPath = "ffmpeg";
    
    /**
     * 设置FFmpeg路径
     */
    public static void setFfmpegPath(String path) {
        ffmpegPath = path;
        logger.info("设置FFmpeg路径: {}", path);
    }
    
    /**
     * 检查FFmpeg是否可用
     */
    public static boolean checkFfmpeg() {
        try {
            Process process = Runtime.getRuntime().exec(ffmpegPath + " -version");
            int exitCode = process.waitFor();
            return exitCode == 0;
        } catch (Exception e) {
            logger.error("FFmpeg检查失败", e);
            return false;
        }
    }
    
    /**
     * 批量转换目录中的所有音频文件
     */
    public static void convertDirectory(String inputDir, String outputDir) throws IOException {
        File inputDirectory = new File(inputDir);
        File outputDirectory = new File(outputDir);
        
        if (!inputDirectory.exists()) {
            throw new IOException("输入目录不存在: " + inputDir);
        }
        
        if (!outputDirectory.exists() && !outputDirectory.mkdirs()) {
            throw new IOException("无法创建输出目录: " + outputDir);
        }
        
        logger.info("开始批量转换: {} -> {}", inputDir, outputDir);
        
        int successCount = 0;
        int failCount = 0;
        
        // 查找所有支持的音频文件
        File[] audioFiles = inputDirectory.listFiles((dir, name) -> {
            String lowerName = name.toLowerCase();
            return SUPPORTED_INPUT_FORMATS.stream().anyMatch(lowerName::endsWith);
        });
        
        if (audioFiles == null || audioFiles.length == 0) {
            logger.warn("在目录中未找到支持的音频文件: {}", inputDir);
            return;
        }
        
        logger.info("找到 {} 个音频文件需要转换", audioFiles.length);
        
        for (File inputFile : audioFiles) {
            try {
                String outputFileName = inputFile.getName()
                    .substring(0, inputFile.getName().lastIndexOf('.')) + ".wav";
                File outputFile = new File(outputDirectory, outputFileName);
                
                convertSingleFile(inputFile, outputFile);
                successCount++;
                
                logger.info("转换成功: {} -> {}", inputFile.getName(), outputFileName);
                
            } catch (Exception e) {
                failCount++;
                logger.error("转换失败: {}", inputFile.getName(), e);
            }
        }
        
        logger.info("批量转换完成: 成功 {} 个, 失败 {} 个", successCount, failCount);
    }
    
    /**
     * 转换单个音频文件
     */
    public static void convertSingleFile(File inputFile, File outputFile) throws IOException {
        if (!inputFile.exists()) {
            throw new IOException("输入文件不存在: " + inputFile.getAbsolutePath());
        }
        
        // 检查输入格式是否支持
        String fileName = inputFile.getName().toLowerCase();
        boolean formatSupported = SUPPORTED_INPUT_FORMATS.stream()
            .anyMatch(fileName::endsWith);
        
        if (!formatSupported) {
            throw new IOException("不支持的音频格式: " + inputFile.getName());
        }
        
        // FFmpeg命令：转换为44.1kHz, 16-bit, 立体声的WAV文件
        String[] command = {
            ffmpegPath,
            "-i", inputFile.getAbsolutePath(),  // 输入文件
            "-acodec", "pcm_s16le",             // PCM 16-bit 编码
            "-ac", "2",                         // 立体声
            "-ar", "44100",                     // 44.1kHz 采样率
            "-y",                               // 覆盖输出文件
            outputFile.getAbsolutePath()        // 输出文件
        };
        
        logger.debug("执行命令: {}", String.join(" ", command));
        
        try {
            Process process = Runtime.getRuntime().exec(command);
            
            // 读取错误流（避免进程阻塞）
            Thread errorReader = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getErrorStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        logger.trace("FFmpeg: {}", line);
                    }
                } catch (IOException e) {
                    logger.debug("读取FFmpeg输出失败", e);
                }
            });
            errorReader.start();
            
            int exitCode = process.waitFor();
            errorReader.join(30000); // 等待错误流读取完成
            
            if (exitCode != 0) {
                throw new IOException("FFmpeg转换失败，退出码: " + exitCode);
            }
            
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("转换过程被中断", e);
        }
    }
    
    /**
     * 转换单个文件（简化版）
     */
    public static void convertFile(String inputPath, String outputPath) throws IOException {
        convertSingleFile(new File(inputPath), new File(outputPath));
    }
    
    /**
     * 获取支持的输入格式列表
     */
    public static List<String> getSupportedFormats() {
        return SUPPORTED_INPUT_FORMATS;
    }
}