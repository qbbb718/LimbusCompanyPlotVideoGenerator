package com.lbc_plot.render.audio;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.common.util.ResourceChecker;

import java.util.regex.Pattern;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;

/**
 * 完整的音频响度测量工具
 */
public class AudioLoudnessMeasurer {
    private static final Logger logger = LoggerFactory.getLogger(AudioLoudnessMeasurer.class);

    // 响度缓存，避免重复测量
    private static final Map<String, Float> loudnessCache = new ConcurrentHashMap<>();

    /**
     * 测量音频文件响度（使用FFmpeg loudnorm）
     */
    public static float measureAudioLoudness(String audioId) throws IOException {
        // 先从缓存获取
        if (loudnessCache.containsKey(audioId)) {
            return loudnessCache.get(audioId);
        }

        String audioPath = ResourceChecker.findAudioFilePath(audioId);
        logger.debug("开始测量音频响度: {}", audioPath);

        try {
            float loudness = measureWithFFmpeg(audioPath);
            loudnessCache.put(audioId, loudness);

            logger.info("音频响度测量完成 - 文件: {}, 响度: {} LUFS", audioId, loudness);
            return loudness;

        } catch (Exception e) {
            logger.warn("音频响度测量失败: {}, 使用估计值", audioId, e);
            float estimated = estimateLoudness(audioPath);
            loudnessCache.put(audioId, estimated);
            return estimated;
        }
    }

    /**
     * 使用FFmpeg loudnorm过滤器测量响度
     */
    private static float measureWithFFmpeg(String audioPath) throws IOException {
        // FFmpeg命令：使用loudnorm过滤器测量响度
        String command = String.format(
                "ffmpeg -i \"%s\" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -",
                audioPath);

        logger.debug("执行响度测量命令: {}", command);

        try {
            Process process = Runtime.getRuntime().exec(command);

            // 读取错误流（FFmpeg输出到stderr）
            StringBuilder output = new StringBuilder();
            Thread errorThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getErrorStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        output.append(line).append("\n");
                    }
                } catch (IOException e) {
                    logger.debug("读取FFmpeg输出失败", e);
                }
            });

            errorThread.start();
            int exitCode = process.waitFor();
            errorThread.join(30000); // 等待30秒

            if (exitCode != 0) {
                throw new IOException("FFmpeg执行失败，退出码: " + exitCode);
            }

            // 解析输出，提取响度信息
            return parseLoudnessFromOutput(output.toString());

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("响度测量被中断", e);
        }
    }

    /**
     * 从FFmpeg输出中解析响度值
     */
    private static float parseLoudnessFromOutput(String output) throws IOException {
        // 方法1: 尝试解析JSON输出
        try {
            return parseJsonLoudness(output);
        } catch (Exception e) {
            logger.debug("JSON解析失败，尝试正则匹配");
        }

        // 方法2: 使用正则表达式匹配
        try {
            return parseRegexLoudness(output);
        } catch (Exception e) {
            logger.debug("正则匹配失败，尝试文本搜索");
        }

        // 方法3: 简单的文本搜索
        return parseTextLoudness(output);
    }

    /**
     * 解析JSON格式的响度输出
     */
    private static float parseJsonLoudness(String output) throws Exception {
        // 找到JSON数据开始位置
        int jsonStart = output.indexOf("{");
        int jsonEnd = output.lastIndexOf("}") + 1;

        if (jsonStart == -1 || jsonEnd == -1) {
            throw new IOException("未找到JSON数据");
        }

        String jsonStr = output.substring(jsonStart, jsonEnd);
        JSONObject json = new JSONObject(jsonStr);

        JSONObject input = json.getJSONObject("input");
        float integrated = input.getFloat("input_i");

        logger.debug("JSON解析成功 - 集成响度: {} LUFS", integrated);
        return integrated;
    }

    /**
     * 使用正则表达式解析响度
     */
    private static float parseRegexLoudness(String output) throws IOException {
        // 匹配类似: "Input Integrated: -15.3 LUFS" 的模式
        Pattern pattern = Pattern.compile("Input Integrated:\\s*([-+]?[0-9]*\\.?[0-9]+)\\s*LUFS");
        Matcher matcher = pattern.matcher(output);

        if (matcher.find()) {
            float loudness = Float.parseFloat(matcher.group(1));
            logger.debug("正则解析成功 - 集成响度: {} LUFS", loudness);
            return loudness;
        }

        throw new IOException("未找到响度信息");
    }

    /**
     * 简单的文本搜索解析响度
     */
    private static float parseTextLoudness(String output) throws IOException {
        String[] lines = output.split("\n");

        for (String line : lines) {
            if (line.contains("Integrated") && line.contains("LUFS")) {
                // 提取数字部分
                String[] parts = line.split("\\s+");
                for (String part : parts) {
                    try {
                        if (part.matches("[-+]?[0-9]*\\.?[0-9]+")) {
                            float loudness = Float.parseFloat(part);
                            logger.debug("文本解析成功 - 集成响度: {} LUFS", loudness);
                            return loudness;
                        }
                    } catch (NumberFormatException e) {
                        // 继续尝试下一个部分
                    }
                }
            }
        }

        throw new IOException("无法从输出中解析响度值");
    }

    /**
     * 基于文件属性的响度估计
     */
    private static float estimateLoudness(String audioPath) {
        File audioFile = new File(audioPath);

        // 基于文件大小的简单估计（这是一个启发式方法）
        if (audioFile.exists()) {
            long fileSize = audioFile.length();
            long duration = getEstimatedDuration(audioPath);

            if (duration > 0) {
                // 估计平均比特率
                double bitrate = (fileSize * 8.0) / duration; // bits per second

                // 基于比特率的粗略估计（这只是一个经验公式）
                if (bitrate > 256000) { // 高比特率文件通常更响亮
                    return -18.0f;
                } else if (bitrate > 128000) { // 中等比特率
                    return -20.0f;
                } else { // 低比特率
                    return -23.0f;
                }
            }
        }

        // 默认估计值
        return -20.0f;
    }

    /**
     * 估计音频时长（秒）
     */
    private static long getEstimatedDuration(String audioPath) {
        try {
            return (long) AudioDurationHelper.getAudioDuration(audioPath);
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * 清除响度缓存
     */
    public static void clearCache() {
        loudnessCache.clear();
        logger.debug("响度缓存已清除");
    }

    /**
     * 清除指定音频的缓存
     */
    public static void clearCache(String audioId) {
        loudnessCache.remove(audioId);
        logger.debug("清除响度缓存: {}", audioId);
    }
}