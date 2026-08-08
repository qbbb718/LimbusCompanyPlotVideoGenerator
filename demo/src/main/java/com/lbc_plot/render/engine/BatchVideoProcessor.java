package com.lbc_plot.render.engine;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.util.concurrent.CompletableFuture;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.lbc_plot.common.util.VideoAudioMerger;
import com.lbc_plot.common.util.RecordDurationCalculator;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.render.audio.model.AudioCommand;
import com.lbc_plot.render.audio.model.AudioCommandType;
import com.lbc_plot.render.audio.model.AudioSegment;
import com.lbc_plot.render.audio.model.AudioTimeline;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.audio.AudioTimelineBuilder;
import com.lbc_plot.render.audio.FFmpegAudioProcessor;
import com.lbc_plot.render.audio.FrameInfo;
import com.lbc_plot.render.audio.TimelineToFFmpegConverter;
import com.lbc_plot.render.video.VideoConcatenator;

/**
 * 批量视频处理管理器
 *
 * 主要职责：将多个Record（剧本记录）合成为一个完整的视频文件
 * 处理流程：渲染单个Record → 连接视频 → 处理音频 → 合并音视频
 *
 * 关键概念：
 * - Record: 单个剧本记录，包含对话、背景、音频指令等
 * - FrameInfo: 记录每个Record在最终视频中的时间位置信息
 * - AudioTimeline: 音频时间线，管理所有音频片段的播放时机和音量
 */
public class BatchVideoProcessor {
    private static final Logger logger = LoggerFactory.getLogger(BatchVideoProcessor.class);

    /** 进度回调接口 — 供外部（如 Controller）监听处理进度 */
    @FunctionalInterface
    public interface ProgressListener {
        void onProgress(int stage, int current, int total, String message);
    }

    /**
     * 处理Record列表并生成最终视频
     * 
     * 完整处理流程：
     * 阶段1: 逐个渲染Record为无声视频片段
     * 阶段2: 连接所有无声视频片段为一个完整视频
     * 阶段3: 根据音频指令生成混合音频轨道
     * 阶段4: 将无声视频与混合音频合并为最终视频
     * 
     * @param records    Record列表，按剧本顺序排列
     * @param outputPath 最终输出视频路径
     * @param tempDir    临时视频文件目录，用于存储中间文件
     * @param plot       是否是剧情模式（影响渲染样式）
     * @param width      视频宽度（像素）
     * @param height     视频高度（像素）
     * @param frameRate  视频帧率（fps）
     * @throws Exception 处理失败时抛出
     */
    public static void processRecordList(
            List<Record> records,
            String outputPath,
            String tempDir,
            boolean plot,
            int width,
            int height,
            int frameRate) throws Exception {
        processRecordList(records, outputPath, tempDir, plot, width, height, frameRate, null, RenderOfVideo.LAYER_FULL);
    }

    /**
     * 带分层类型的版本
     */
    public static void processRecordList(
            List<Record> records,
            String outputPath,
            String tempDir,
            boolean plot,
            int width,
            int height,
            int frameRate,
            String layerType) throws Exception {
        processRecordList(records, outputPath, tempDir, plot, width, height, frameRate, null, layerType);
    }

    /**
     * 带进度回调的版本
     */
    public static void processRecordList(
            List<Record> records,
            String outputPath,
            String tempDir,
            boolean plot,
            int width,
            int height,
            int frameRate,
            ProgressListener progress) throws Exception {
        processRecordList(records, outputPath, tempDir, plot, width, height, frameRate, progress, RenderOfVideo.LAYER_FULL);
    }

    /**
     * 带进度回调和分层类型的版本
     */
    public static void processRecordList(
            List<Record> records,
            String outputPath,
            String tempDir,
            boolean plot,
            int width,
            int height,
            int frameRate,
            ProgressListener progress,
            String layerType) throws Exception {

        logger.info("开始处理 {} 个Record", records.size());
        long totalStartTime = System.currentTimeMillis();

        // 创建临时目录 - 用于存储中间生成的视频和音频文件
        File tempDirectory = new File(tempDir);
        if (!tempDirectory.exists() && !tempDirectory.mkdirs()) {
            throw new IOException("无法创建临时目录: " + tempDir);
        }
        logger.info("临时目录正常");

        // 音频处理相关变量
        List<FrameInfo> frameInfos = new ArrayList<>(); // 记录每条Record在最终视频中的帧数信息
        int currentFrame = 0; // 当前累计帧数，用于计算每个Record的开始位置

        List<String> videoPaths = new ArrayList<>(); // 存储所有临时视频文件的路径
        try {
            // ==================== 阶段1: 逐个导出Record视频 ====================
            // 将每个Record渲染为独立的视频文件，此时视频不包含音频
            logger.info("=== 阶段1: 渲染单个Record视频 ===");
            if (progress != null) progress.onProgress(1, 0, records.size(), "开始渲染Record视频...");
            for (int i = 0; i < records.size(); i++) {
                Record record = records.get(i);
                String videoFileName = generateVideoFileName(record);
                String videoPath = tempDir + File.separator + videoFileName;

                // 先加入路径列表以保证拼接顺序
                videoPaths.add(videoPath);

                File tempVideoFile = new File(videoPath);
                if (!record.isDirty() && tempVideoFile.exists()) {
                    // Record 未修改且临时视频已存在 → 跳过渲染
                    int frameCount = RecordDurationCalculator.calculateDurationFrames(record, frameRate);
                    logger.info("跳过未修改的Record {}/{}, uuid={}, 帧数={} (复用已有视频)",
                            i + 1, records.size(), record.getUuid(), frameCount);

                    FrameInfo frameInfo = new FrameInfo(record.getUuid(), currentFrame, frameCount);
                    frameInfos.add(frameInfo);
                    currentFrame += frameCount;

                    if (progress != null) progress.onProgress(1, i + 1, records.size(),
                            String.format("跳过Record %d/%d (未修改)", i + 1, records.size()));
                } else {
                    // Record 已修改或文件不存在 → 正常渲染
                    logger.info("处理第 {}/{} 个Record: {}", i + 1, records.size(), videoFileName);

                    long recordStartTime = System.currentTimeMillis();

                    RenderResult recordResult = RenderOfVideo.exportRecordVideoStreaming(
                            record, plot, width, height, videoPath, frameRate, layerType);

                    long recordDuration = System.currentTimeMillis() - recordStartTime;

                    logger.info("Record {} 导出完成，耗时: {}ms", videoFileName, recordDuration);

                    FrameInfo frameInfo = new FrameInfo(
                            record.getUuid(), currentFrame, recordResult.getFrameCount());
                    frameInfos.add(frameInfo);
                    currentFrame += recordResult.getFrameCount();
                    logger.debug("Record {} 帧数信息: 开始帧={}, 帧数={}",
                            record.getUuid(), frameInfo.getStartFrame(), frameInfo.getFrameCount());

                    if (progress != null) progress.onProgress(1, i + 1, records.size(),
                            String.format("渲染Record %d/%d", i + 1, records.size()));
                }
            }

            // ==================== 阶段2: 连接所有视频（无声） ====================
            logger.info("=== 阶段2: 连接无声视频 ===");
            if (progress != null) progress.onProgress(2, 0, 1, "连接无声视频...");
            String silentVideoPath = tempDir + File.separator + "silent_video.mp4";
            VideoConcatenator.concatenateVideos(videoPaths, silentVideoPath);
            if (progress != null) progress.onProgress(2, 1, 1, "无声视频连接完成");
            logger.info("无声视频生成完成: {}", silentVideoPath);

            // ==================== 阶段3: FFmpeg音频处理 ====================
            logger.info("=== 阶段3: 音频处理 ===");
            if (progress != null) progress.onProgress(3, 0, 1, "处理音频...");
            String audioPath = tempDir + File.separator + "mixed_audio.wav";

            // 构建音频时间线 - 将离散的音频指令转换为连续的播放计划
            AudioTimelineBuilder timelineBuilder = new AudioTimelineBuilder();

            // ========== 调试信息：分析音频时间线 ==========
            // 这部分代码用于诊断音频相关问题，如音量逐渐变大等
            logger.info("=== 音频时间线调试信息 ===");
            AudioTimeline audioTimeline = timelineBuilder.buildTimeline(records, frameInfos, frameRate);

            // 分析BGM片段：检查是否有重叠或重复播放的问题
            Map<String, List<AudioSegment>> bgmSegmentsByFile = new HashMap<>();
            for (AudioSegment segment : audioTimeline.getSegments()) {
                if (segment.getType() == AudioCommandType.BGM_ACTIVE) {
                    bgmSegmentsByFile.computeIfAbsent(segment.getAudioId(), k -> new ArrayList<>()).add(segment);
                }
            }

            // 输出BGM分析结果 - 帮助识别音频叠加问题
            logger.info("BGM片段分析:");
            for (Map.Entry<String, List<AudioSegment>> entry : bgmSegmentsByFile.entrySet()) {
                List<AudioSegment> segments = entry.getValue();
                logger.info("BGM文件 {} 有 {} 个片段:", entry.getKey(), segments.size());
                for (int i = 0; i < segments.size(); i++) {
                    AudioSegment seg = segments.get(i);
                    double startTime = seg.getStartFrame() / frameRate;
                    double endTime = seg.getEndFrame() / frameRate;
                    logger.info("  片段{}: 时间 {}-{}秒 ({}秒), 音量: {}",
                            i, String.format("%.2f", startTime), String.format("%.2f", endTime),
                            String.format("%.2f", endTime - startTime), seg.getVolume());

                    // 检查片段重叠：如果当前片段在前一个片段结束前开始，说明有重叠
                    if (i > 0) {
                        AudioSegment prevSeg = segments.get(i - 1);
                        if (seg.getStartFrame() < prevSeg.getEndFrame()) {
                            logger.warn("  警告: 与上一个片段重叠! 可能导致音量叠加");
                        }
                    }
                }
            }

            // 检查总音量：如果总音量异常高，可能有多重播放问题
            double totalBgmVolume = 0;
            double totalSfxVolume = 0;
            for (AudioSegment segment : audioTimeline.getSegments()) {
                if (isBgmSegment(segment)) {
                    totalBgmVolume += segment.getVolume();
                } else {
                    totalSfxVolume += segment.getVolume();
                }
            }
            logger.info("音量统计 - 总BGM音量: {}, 总音效音量: {}", totalBgmVolume, totalSfxVolume);
            // ========== 调试信息结束 ==========

            // 使用FFmpeg处理音频时间线，生成混合音频文件
            FFmpegAudioProcessor audioProcessor = new FFmpegAudioProcessor();
            audioProcessor.processAudioTimeline(audioTimeline, audioPath);

            logger.info("音频生成完成: {}", audioPath);
            if (progress != null) progress.onProgress(3, 1, 1, "音频处理完成");

            // ==================== 阶段4: 合并音视频 ====================
            logger.info("=== 阶段4: 合并音视频 ===");
            if (progress != null) progress.onProgress(4, 0, 1, "合并音视频...");

            // 方法1: 直接映射合并（推荐，速度更快）
            // 假设视频和音频时长完全匹配，直接合并
            VideoAudioMerger.mergeVideoAudioDirect(silentVideoPath, audioPath, outputPath);

            // 方法2: 以最长文件为准的合并（备选方案）
            // 如果视频和音频时长不一致，以较长的为准，较短的用静音/黑帧填充
            // VideoAudioMerger.mergeVideoAudioLongest(silentVideoPath, audioPath,
            // outputPath);

            logger.info("音视频合并完成: {}", outputPath);
            if (progress != null) progress.onProgress(4, 1, 1, "音视频合并完成");

        } finally {
            // 可选：清理临时文件以释放磁盘空间
            // 在调试阶段可以注释掉，便于检查中间文件
            // cleanupTempFiles(videoPaths);
        }

        long totalDuration = System.currentTimeMillis() - totalStartTime;
        logger.info("批量视频处理完成，总耗时: {}ms", totalDuration);
    }

    /**
     * 判断是否为BGM片段
     * 用于音频分析和调试
     */
    private static boolean isBgmSegment(AudioSegment segment) {
        return segment.getType() == AudioCommandType.BGM_ACTIVE;
    }

    /**
     * 生成有意义的视频文件名（包含顺序信息和Record标识）
     * 
     * 文件名格式: record{顺序号}{RecordID}.mp4
     * 例如: record0001abc123.mp4, record0002def456.mp4
     * 
     * 这样命名便于：
     * 1. 按顺序识别视频片段
     * 2. 通过RecordID关联到原始数据
     * 3. 调试时快速定位问题Record
     * 
     * @param record 当前Record对象
     * @param index  在列表中的索引位置
     * @return 生成的文件名
     */
    private static String generateVideoFileName(Record record) {
        return String.format("record_%s.mp4", record.getUuid());
    }

    /**
     * 清理临时视频文件（可选）
     * 
     * 注意：在调试阶段建议保留临时文件，便于排查问题
     * 在生产环境可以启用以节省磁盘空间
     * 
     * @param videoPaths 要清理的临时视频文件路径列表
     */
    private static void cleanupTempFiles(List<String> videoPaths) {
        logger.info("开始清理临时文件");
        int deletedCount = 0;

        for (String videoPath : videoPaths) {
            File file = new File(videoPath);
            if (file.exists() && file.delete()) {
                deletedCount++;
            } else {
                logger.warn("无法删除临时文件: {}", videoPath);
            }
        }

        logger.info("清理完成，删除了 {}/{} 个临时文件", deletedCount, videoPaths.size());
    }

    /**
     * 只处理特定的Record（用于增量更新）
     * 
     * 使用场景：
     * - 修改了某个Record的内容，只需重新渲染该Record
     * - 避免重新渲染所有Record，提高效率
     * 
     * 限制：目前会重新连接所有视频，未来可优化为只替换特定片段
     * 
     * @param recordIndex     需要更新的Record索引（0-based）
     * @param records         完整的Record列表
     * @param finalOutputPath 最终输出视频路径
     * @param tempDir         临时文件目录
     */
    public static void updateSingleRecord(
            int recordIndex,
            List<Record> records,
            String finalOutputPath,
            String tempDir) throws Exception {

        if (recordIndex < 0 || recordIndex >= records.size()) {
            throw new IllegalArgumentException("Record索引越界: " + recordIndex + ", 有效范围: 0-" + (records.size() - 1));
        }

        Record record = records.get(recordIndex);
        String videoFileName = generateVideoFileName(record);
        String videoPath = tempDir + File.separator + videoFileName;

        logger.info("更新第 {} 个Record: {}", recordIndex + 1, videoFileName);

        // 重新导出单个Record视频
        RenderOfVideo.exportRecordVideoStreaming(record,
                true, // 通常使用剧情模式
                ProjectConfig.VIDEO_WIDTH,
                ProjectConfig.VIDEO_HEIGHT,
                videoPath,
                ProjectConfig.FRAME_RATE,
                RenderOfVideo.LAYER_FULL);

        // 获取所有视频文件路径（按顺序）
        // 注意：这里会使用之前生成的所有视频文件，只更新其中一个
        List<String> allVideoPaths = new ArrayList<>();
        for (int i = 0; i < records.size(); i++) {
            String fileName = generateVideoFileName(records.get(i));
            allVideoPaths.add(tempDir + File.separator + fileName);
        }

        // 重新连接所有视频（包含更新后的Record）
        // TODO: 未来优化：可以只更新变化的部分，避免全量重新连接
        VideoConcatenator.concatenateVideos(allVideoPaths, finalOutputPath);

        logger.info("单个Record更新完成");
    }

    /**
     * 渲染单个Record的结果封装
     * 
     * 用于传递渲染过程的元数据：
     * - 实际生成的帧数（可能与计算值有差异）
     * - 渲染耗时（用于性能监控）
     * - 开始时间（用于时间线对齐）
     */
    public static class RenderResult {
        private final int frameCount; // 实际渲染的帧数
        private final long startTimeMs; // 渲染开始时间（时间戳）
        private final long durationMs; // 渲染耗时（毫秒）

        public RenderResult(int frameCount, long startTimeMs, long durationMs) {
            this.frameCount = frameCount;
            this.startTimeMs = startTimeMs;
            this.durationMs = durationMs;
        }

        // getter方法
        public int getFrameCount() {
            return frameCount;
        }

        public long getStartTimeMs() {
            return startTimeMs;
        }

        public long getDurationMs() {
            return durationMs;
        }

        @Override
        public String toString() {
            return String.format("RenderResult{frameCount=%d, durationMs=%d}", frameCount, durationMs);
        }
    }

    /**
     * 异步版本的批量处理入口：将每个Record的渲染提交到 {@code AsyncRenderService}
     * 并等待所有渲染完成后继续后续的合并流程。
     */
    public static void processRecordListAsync(
            List<Record> records,
            String outputPath,
            String tempDir,
            boolean plot,
            int width,
            int height,
            int frameRate,
            com.lbc_plot.render.service.AsyncRenderService asyncService) throws Exception {

        if (asyncService == null) {
            // 回退到同步方式
            processRecordList(records, outputPath, tempDir, plot, width, height, frameRate);
            return;
        }

        logger.info("开始异步处理 {} 个Record", records.size());

        File tempDirectory = new File(tempDir);
        if (!tempDirectory.exists() && !tempDirectory.mkdirs()) {
            throw new IOException("无法创建临时目录: " + tempDir);
        }

        List<java.util.concurrent.CompletableFuture<RenderResult>> futures = new ArrayList<>();
        List<String> videoPaths = new ArrayList<>();
        List<FrameInfo> frameInfos = new ArrayList<>();

        int currentFrame = 0;

        // 提交所有渲染任务（跳过未修改且有缓存视频的Record）
        for (int i = 0; i < records.size(); i++) {
            Record record = records.get(i);
            String videoFileName = generateVideoFileName(record);
            String videoPath = tempDir + File.separator + videoFileName;
            videoPaths.add(videoPath);

            File tempVideoFile = new File(videoPath);
            if (!record.isDirty() && tempVideoFile.exists()) {
                int frameCount = RecordDurationCalculator.calculateDurationFrames(record, frameRate);
                logger.info("跳过未修改的Record(异步) {}/{}, uuid={}, 帧数={}",
                        i + 1, records.size(), record.getUuid(), frameCount);
                futures.add(CompletableFuture.completedFuture(
                        new RenderResult(frameCount, System.currentTimeMillis(), 0)));
            } else {
                CompletableFuture<RenderResult> future = asyncService.submitRenderTask(record, plot, width, height,
                        videoPath, frameRate);
                futures.add(future);
            }
        }

        // 等待并收集渲染结果（按提交顺序）
        for (int i = 0; i < futures.size(); i++) {
            RenderResult result = futures.get(i).get();
            Record record = records.get(i);
            FrameInfo frameInfo = new FrameInfo(record.getUuid(), currentFrame, result.getFrameCount());
            frameInfos.add(frameInfo);
            currentFrame += result.getFrameCount();
            logger.info("异步渲染完成: {} 帧数={}", generateVideoFileName(record), result.getFrameCount());
        }

        // 之后流程与同步方法相同：连接视频、处理音频、合并
        logger.info("所有渲染任务完成，开始连接视频");
        String silentVideoPath = tempDir + File.separator + "silent_video.mp4";
        VideoConcatenator.concatenateVideos(videoPaths, silentVideoPath);

        String audioPath = tempDir + File.separator + "mixed_audio.wav";
        AudioTimelineBuilder timelineBuilder = new AudioTimelineBuilder();
        AudioTimeline audioTimeline = timelineBuilder.buildTimeline(records, frameInfos, frameRate);
        FFmpegAudioProcessor audioProcessor = new FFmpegAudioProcessor();
        audioProcessor.processAudioTimeline(audioTimeline, audioPath);

        VideoAudioMerger.mergeVideoAudioDirect(silentVideoPath, audioPath, outputPath);
        logger.info("异步批量视频处理完成: {}", outputPath);
    }
}