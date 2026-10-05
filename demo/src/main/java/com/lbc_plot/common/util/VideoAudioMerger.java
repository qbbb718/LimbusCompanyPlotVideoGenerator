package com.lbc_plot.common.util;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 视频音频合并工具类
 *
 * <p>阶段3 生成的是 WAV(PCM s16le) 音频，视频时间线是各 Record 帧数之和。
 * 合并时必须遵守下面两条约束，否则会出现“导出失败(退出码 1)”或“成片丢掉末尾片段”：
 *
 * <ol>
 *   <li><b>音频不能直接 copy</b> —— MP4 容器不支持 PCM，{@code -acodec copy} 会让 FFmpeg 报
 *       {@code Could not find tag for codec pcm_s16le in stream #1, codec not currently
 *       supported in container} 并以退出码 1 结束，只留下一个 0 字节的输出文件。
 *       因此音频统一转码为 AAC；视频轨仍然 {@code -c:v copy}，导出速度不受影响。</li>
 *   <li><b>不能用裸 {@code -shortest} 收尾</b> —— 音频（BGM/音效）通常比视频短
 *       （例如视频 19.73s、音频 8.20s），直接 {@code -shortest} 会把成片截断到音频长度，
 *       末尾几个 Record 全部丢失。所以先用 {@code apad} 给音频补静音，再 {@code -shortest}，
 *       成片长度恰好等于视频长度，末尾是静音而不是丢帧。</li>
 * </ol>
 */
public class VideoAudioMerger {
    private static final Logger logger = LoggerFactory.getLogger(VideoAudioMerger.class);

    /** 失败时随异常一起抛出的 FFmpeg stderr 末尾行数 */
    private static final int ERROR_TAIL_LINES = 12;

    /** 看起来像错误原因的行（用于把真正的原因抛给前端，而不是 FFmpeg 的版本横幅） */
    private static final Pattern ERROR_HINT = Pattern.compile(
            "(?i)(error|invalid|could not|cannot|can not|no such file|not found|unsupported|not supported"
                    + "|failed|failure|unknown encoder|denied|unable)");

    /** FFmpeg 每次启动都会打印的版本/编译信息，不属于错误详情 */
    private static final Pattern FFMPEG_BANNER = Pattern.compile(
            "^(ffmpeg version| {2}built with| {2}configuration:| {2}libav| {2}libsw)");

    /** 音频转码参数（MP4/MOV 都支持 AAC） */
    private static final String AUDIO_CODEC = "aac";
    private static final String AUDIO_BITRATE = "192k";

    /**
     * 直接映射合并（快速）
     *
     * <p>以视频时间线为准：音频不足部分补静音，成片长度 = 视频长度。
     */
    public static File mergeVideoAudioDirect(String videoFile, String audioFile, String outputFile) throws IOException {
        return mergeVideoAudio(videoFile, audioFile, outputFile, "direct");
    }

    /**
     * 以最长文件为准合并
     *
     * <p>成片长度 = max(视频长度, 音频长度)，较短的轨道不做截断。
     * 注意：视频轨是 {@code copy} 的，无法补黑帧，所以当音频更长时画面会在视频轨结束时停住。
     */
    public static File mergeVideoAudioLongest(String videoFile, String audioFile, String outputFile)
            throws IOException {
        return mergeVideoAudio(videoFile, audioFile, outputFile, "longest");
    }

    private static File mergeVideoAudio(String videoFile, String audioFile, String outputFile, String mode)
            throws IOException {
        List<String> command = buildCommand(videoFile, audioFile, outputFile, mode);

        logger.info("执行视频音频合并({}模式): {}", mode, toLogString(command));
        executeFFmpegCommand(command, outputFile);

        File result = new File(outputFile);
        if (!result.exists() || result.length() == 0) {
            throw new IOException("视频音频合并失败，输出文件不存在或为空: " + outputFile);
        }

        logger.info("视频音频合并成功: {} ({} bytes)", outputFile, result.length());
        return result;
    }

    /**
     * 构建 FFmpeg 合并命令
     *
     * <p>使用参数列表而不是拼接字符串，避免输出目录/音频文件名包含空格时被错误拆分。
     */
    private static List<String> buildCommand(String videoFile, String audioFile, String outputFile, String mode) {
        List<String> command = new ArrayList<>();
        command.add(FFmpegPathResolver.getFFmpegPath());
        command.add("-y");
        command.add("-i");
        command.add(videoFile);
        command.add("-i");
        command.add(audioFile);

        // 只取第一条视频流和第一条音频流，避免误映射到多余流
        command.add("-map");
        command.add("0:v:0");
        command.add("-map");
        command.add("1:a:0");

        // 视频轨直接 copy：保持画质与导出速度（透明层 QTRLE 也能原样保留）
        command.add("-c:v");
        command.add("copy");

        // 音频轨必须转码：WAV(PCM) 无法 copy 进 MP4 容器
        command.add("-c:a");
        command.add(AUDIO_CODEC);
        command.add("-b:a");
        command.add(AUDIO_BITRATE);

        if ("longest".equals(mode)) {
            // 以最长者为准：不加 -shortest，输出长度自然等于 max(视频, 音频)
            // 音频更短时音轨提前结束（播放器按静音处理），视频更短时画面停在最后一帧
        } else {
            // 以视频时间线为准：先用 apad 把音频补成无限长（静音填充），
            // 再由 -shortest 在视频结束时收尾，这样末尾片段不会被音频长度截掉
            command.add("-af");
            command.add("apad");
            command.add("-shortest");
        }

        command.add(outputFile);
        return command;
    }

    /**
     * 执行FFmpeg命令
     *
     * @param outputFile 输出文件路径，命令失败时用于清理残留的 0 字节文件
     */
    private static void executeFFmpegCommand(List<String> command, String outputFile) throws IOException {
        // 保留 stderr 末尾若干行与“看起来像原因”的行，失败时作为异常信息抛出，
        // 避免前端只看到“退出码: 1”而不知道 FFmpeg 到底为什么失败
        Deque<String> errorTail = new ArrayDeque<>();
        Deque<String> errorHints = new ArrayDeque<>();
        try {
            Process process = new ProcessBuilder(command).start();

            // 读取输出流
            Thread outputThread = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
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
                        new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        logger.info("FFmpeg: {}", line);
                        synchronized (errorTail) {
                            if (!FFMPEG_BANNER.matcher(line).find()) {
                                errorTail.addLast(line);
                                while (errorTail.size() > ERROR_TAIL_LINES) {
                                    errorTail.removeFirst();
                                }
                            }
                            if (ERROR_HINT.matcher(line).find()) {
                                errorHints.addLast(line);
                                while (errorHints.size() > ERROR_TAIL_LINES) {
                                    errorHints.removeFirst();
                                }
                            }
                        }
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
                String detail;
                synchronized (errorTail) {
                    Deque<String> source = errorHints.isEmpty() ? errorTail : errorHints;
                    detail = source.isEmpty() ? "（FFmpeg 未输出错误详情）" : String.join(" | ", source);
                }
                logger.error("FFmpeg 合并失败，退出码: {}, 错误详情: {}", exitCode, detail);
                // 清理失败留下的空文件/半成品，避免输出目录里出现无法播放的 video_xxx.mp4
                deleteQuietly(outputFile);
                throw new IOException("FFmpeg执行失败，退出码: " + exitCode + "，错误详情: " + detail);
            }

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            deleteQuietly(outputFile);
            throw new IOException("FFmpeg执行被中断", e);
        } catch (IOException e) {
            deleteQuietly(outputFile);
            throw e;
        }
    }

    private static void deleteQuietly(String path) {
        if (path == null) {
            return;
        }
        File file = new File(path);
        if (file.exists() && !file.delete()) {
            logger.warn("无法删除合并失败产生的残留文件: {}", path);
        }
    }

    /** 拼出便于阅读的命令行日志（含空格的参数加引号） */
    private static String toLogString(List<String> command) {
        StringBuilder sb = new StringBuilder();
        for (String part : command) {
            if (sb.length() > 0) {
                sb.append(' ');
            }
            if (part.indexOf(' ') >= 0) {
                sb.append('"').append(part).append('"');
            } else {
                sb.append(part);
            }
        }
        return sb.toString();
    }
}
