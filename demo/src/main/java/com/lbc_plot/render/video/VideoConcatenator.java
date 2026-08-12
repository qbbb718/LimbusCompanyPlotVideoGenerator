package com.lbc_plot.render.video;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.common.util.FFmpegPathResolver;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * 视频连接工具类 - 使用FFmpeg连接多个视频文件
 */
public class VideoConcatenator {
    private static final Logger logger = LoggerFactory.getLogger(VideoConcatenator.class);

    /**
     * 连接多个视频文件
     * 
     * @param inputVideoPaths 输入视频文件路径列表（按顺序）
     * @param outputPath      输出视频文件路径
     * @throws IOException          连接失败时抛出
     * @throws InterruptedException 进程中断时抛出
     */
    public static void concatenateVideos(List<String> inputVideoPaths, String outputPath)
            throws IOException, InterruptedException {

        if (inputVideoPaths == null || inputVideoPaths.isEmpty()) {
            throw new IllegalArgumentException("输入视频列表不能为空");
        }

        logger.info("开始连接 {} 个视频文件到: {}", inputVideoPaths.size(), outputPath);
        long startTime = System.currentTimeMillis();

        // 创建临时文件列表
        File listFile = createVideoListFile(inputVideoPaths);

        try {
            // 获取ffmpeg可执行文件路径
            String ffmpegPath = FFmpegPathResolver.getFFmpegPath();

            // 构建FFmpeg命令
            ProcessBuilder pb = new ProcessBuilder(
                    ffmpegPath,
                    "-f", "concat",
                    "-safe", "0",
                    "-i", listFile.getAbsolutePath(),
                    "-c", "copy", // 直接流复制，无需重新编码
                    outputPath,
                    "-y" // 覆盖输出文件
            );

            // 设置工作目录
            pb.directory(new File(System.getProperty("user.dir")));

            // 执行命令
            Process process = pb.start();
            int exitCode = process.waitFor();

            if (exitCode != 0) {
                throw new IOException("FFmpeg连接失败，退出码: " + exitCode);
            }

            long duration = System.currentTimeMillis() - startTime;
            logger.info("视频连接完成: {} <- {} 个视频, 耗时: {}ms",
                    outputPath, inputVideoPaths.size(), duration);

        } finally {
            // 清理临时文件
            if (listFile.exists() && !listFile.delete()) {
                logger.warn("无法删除临时文件: {}", listFile.getAbsolutePath());
            }
        }
    }

    /**
     * 创建FFmpeg用的视频列表文件
     */
    private static File createVideoListFile(List<String> videoPaths) throws IOException {
        File listFile = File.createTempFile("video_list_", ".txt");

        StringBuilder content = new StringBuilder();
        for (String videoPath : videoPaths) {
            // FFmpeg concat格式：file '路径'
            content.append("file '").append(new File(videoPath).getAbsolutePath()).append("'\n");
        }

        Files.write(listFile.toPath(), content.toString().getBytes());
        logger.debug("创建视频列表文件: {}，包含 {} 个视频", listFile.getAbsolutePath(), videoPaths.size());

        return listFile;
    }
}