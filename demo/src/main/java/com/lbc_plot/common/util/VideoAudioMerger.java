package com.lbc_plot.common.util;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 视频音频合并工具类
 */
public class VideoAudioMerger {
    private static final Logger logger = LoggerFactory.getLogger(VideoAudioMerger.class);

    /**
     * 直接映射合并（快速）
     */
    public static File mergeVideoAudioDirect(String videoFile, String audioFile, String outputFile) throws IOException {
        return mergeVideoAudio(videoFile, audioFile, outputFile, "direct");
    }

    /**
     * 以最长文件为准合并
     */
    public static File mergeVideoAudioLongest(String videoFile, String audioFile, String outputFile)
            throws IOException {
        return mergeVideoAudio(videoFile, audioFile, outputFile, "longest");
    }

    private static File mergeVideoAudio(String videoFile, String audioFile, String outputFile, String mode)
            throws IOException {
        String command;

        if ("longest".equals(mode)) {
            command = String.format(
                    "%s -y -i \"%s\" -i \"%s\" -c:v copy -filter_complex \"[1:a]amix=inputs=1:duration=longest[outa]\" -map 0:v -map \"[outa]\" -shortest \"%s\"",
                    FFmpegPathResolver.getFFmpegPath(), videoFile, audioFile, outputFile);
        } else {
            // 默认直接映射
            command = String.format(
                    "%s -y -i \"%s\" -i \"%s\" -vcodec copy -acodec copy \"%s\"",
                    FFmpegPathResolver.getFFmpegPath(), videoFile, audioFile, outputFile);
        }

        logger.info("执行视频音频合并({}模式): {}", mode, command);
        executeFFmpegCommand(command);

        File result = new File(outputFile);
        if (!result.exists()) {
            throw new IOException("视频音频合并失败，输出文件不存在: " + outputFile);
        }

        logger.info("视频音频合并成功: {}", outputFile);
        return result;
    }

    /**
     * 执行FFmpeg命令
     */
    private static void executeFFmpegCommand(String command) throws IOException {
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

            // 读取错误流
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