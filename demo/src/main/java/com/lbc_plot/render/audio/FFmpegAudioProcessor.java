package com.lbc_plot.render.audio;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.common.util.ResourceChecker;
import com.lbc_plot.render.audio.model.AudioCommandType;
import com.lbc_plot.render.audio.model.AudioSegment;
import com.lbc_plot.render.audio.model.AudioTimeline;

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

            // 2. 如果所有 segment 均无效，创建静音音频
            if (ffmpegCommand.isEmpty()) {
                return createSilentAudio(timeline.getTotalDurationSeconds(), outputPath);
            }

            // 3. 执行命令
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
     * 生成FFmpeg复杂滤镜命令 - 修复音量叠加问题
     */
    private String generateFFmpegCommand(AudioTimeline timeline, String outputPath) {
        StringBuilder cmd = new StringBuilder("ffmpeg -y");

        List<AudioSegment> segments = timeline.getSegments();
        double totalDuration = timeline.getTotalDurationSeconds();

        // 先解析所有音频文件路径，并记录哪些 segment 有效
        List<AudioSegment> validSegments = new ArrayList<>();
        for (AudioSegment segment : segments) {
            String audioFile = findAudioFilePath(segment.getAudioId());
            File f = new File(audioFile);
            if (f.exists()) {
                validSegments.add(segment);
                cmd.append(" -i \"").append(audioFile).append("\"");
            } else {
                logger.warn("跳过不存在的音频文件: {} (解析路径: {})", segment.getAudioId(), audioFile);
            }
        }

        // 如果所有 segment 都被跳过，直接创建静音音频
        if (validSegments.isEmpty()) {
            logger.info("所有音频段均无效，创建静音音频");
            return ""; // 返回空字符串，由调用方处理
        }

        // 构建复杂滤镜
        cmd.append(" -filter_complex \"");

        // 分别处理BGM和音效/语音
        List<String> bgmStreams = new ArrayList<>();
        List<String> sfxStreams = new ArrayList<>();
        Map<String, Integer> bgmInstanceCount = new HashMap<>(); // 跟踪每个BGM的实例数

        for (int vi = 0; vi < validSegments.size(); vi++) {
            AudioSegment segment = validSegments.get(vi);
            double startTime = segment.getStartFrame() / timeline.getFrameRate();
            double endTime = segment.getEndFrame() / timeline.getFrameRate();
            double segmentDuration = endTime - startTime;

            if (isBgmSegment(segment)) {
                // **修复：确保每个BGM文件只创建一个流**
                String bgmKey = segment.getAudioId();
                int instanceNum = bgmInstanceCount.getOrDefault(bgmKey, 0);
                bgmInstanceCount.put(bgmKey, instanceNum + 1);

                String streamName = "bgm_" + bgmKey + "_" + instanceNum;

                // BGM处理：循环播放指定时长
                String filter = String.format(
                        "[%d]aloop=loop=-1:size=2e+9,atrim=0:%.2f,volume=%.2f,adelay=%.0f|%.0f[%s]",
                        vi, segmentDuration, segment.getVolume(), startTime * 1000, startTime * 1000, streamName);

                cmd.append(filter).append(";");
                bgmStreams.add("[" + streamName + "]");

                logger.debug("BGM处理: {} 实例{} 开始{}秒, 持续{}秒, 音量: {}",
                        segment.getAudioId(), instanceNum, startTime, segmentDuration, segment.getVolume());
            } else {
                // 音效/语音处理
                String streamName = "sfx" + vi;
                String filter = String.format(
                        "[%d]adelay=%.0f|%.0f,volume=%.2f[%s]",
                        vi, startTime * 1000, startTime * 1000, segment.getVolume(), streamName);

                cmd.append(filter).append(";");
                sfxStreams.add("[" + streamName + "]");

                logger.debug("音效处理: {} 开始{}秒, 音量: {}",
                        segment.getAudioId(), startTime, segment.getVolume());
            }
        }

        // **修复：分别混合BGM和音效，然后合并**（在 for 循环外面）
        if (!bgmStreams.isEmpty()) {
            cmd.append(String.join("", bgmStreams));
            cmd.append("amix=inputs=").append(bgmStreams.size()).append(":duration=longest[bgm_mix];");
        }

        if (!sfxStreams.isEmpty()) {
            cmd.append(String.join("", sfxStreams));
            cmd.append("amix=inputs=").append(sfxStreams.size()).append(":duration=longest[sfx_mix];");
        }

        // 最终合并
        if (!bgmStreams.isEmpty() && !sfxStreams.isEmpty()) {
            cmd.append("[bgm_mix][sfx_mix]amix=inputs=2:duration=longest");
        } else if (!bgmStreams.isEmpty()) {
            cmd.append("[bgm_mix]anull");
        } else if (!sfxStreams.isEmpty()) {
            cmd.append("[sfx_mix]anull");
        }

        cmd.append("\"");

        // 输出参数
        cmd.append(" -ac 2 -ar 44100 \"").append(outputPath).append("\"");

        return cmd.toString();
    }

    /**
     * 判断是否为BGM片段
     */
    private boolean isBgmSegment(AudioSegment segment) {
        return segment.getType() == AudioCommandType.BGM_ACTIVE;
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
                duration, outputPath);

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