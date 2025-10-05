package com.lbc_plot.application.Composer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.model.Record;
import com.lbc_plot.project.audio.AudioTimelineBuilder;
import com.lbc_plot.project.audio.FFmpegAudioProcessor;
import com.lbc_plot.project.audio.FrameInfo;
import com.lbc_plot.project.audio.TimelineToFFmpegConverter;
import com.lbc_plot.project.audio.model.AudioCommand;
import com.lbc_plot.project.audio.model.AudioSegment;
import com.lbc_plot.project.audio.model.AudioTimeline;
import com.lbc_plot.util.VideoAudioMerger;
import com.lbc_plot.util.VideoConcatenator;

/**
 * 批量视频处理管理器
 */
public class BatchVideoProcessor {
    private static final Logger logger = LoggerFactory.getLogger(BatchVideoProcessor.class);
    
    /**
     * 处理Record列表并生成最终视频
     * @param records Record列表
     * @param outputPath 最终输出视频路径
     * @param tempDir 临时视频文件目录
     * @param plot 是否是剧情模式
     * @param width 视频宽度
     * @param height 视频高度
     * @param frameRate 帧率
     * @throws Exception 处理失败时抛出
     */
    public static void processRecordList(
        List<Record> records,
        String outputPath,
        String tempDir,
        boolean plot,
        int width,
        int height,
        int frameRate
    ) throws Exception {
        
        logger.info("开始处理 {} 个Record", records.size());
        long totalStartTime = System.currentTimeMillis();
        
        // 创建临时目录
        File tempDirectory = new File(tempDir);
        if (!tempDirectory.exists() && !tempDirectory.mkdirs()) {
            throw new IOException("无法创建临时目录: " + tempDir);
        }
        logger.info("临时目录正常");

        // 新增：音频处理相关变量
        List<FrameInfo> frameInfos = new ArrayList<>(); // 记录每条Record的帧数信息
        int currentFrame = 0;
    
        List<String> videoPaths = new ArrayList<>();
        try {
            // 1. 逐个导出Record视频
            for (int i = 0; i < records.size(); i++) {
                Record record = records.get(i);
                String videoFileName = generateVideoFileName(record, i);
                String videoPath = tempDir + File.separator + videoFileName;
                
                logger.info("处理第 {}/{} 个Record: {}", i + 1, records.size(), videoFileName);
                
                long recordStartTime = System.currentTimeMillis();

                RenderResult recordResult = RenderOfVideo.exportRecordVideo(
                    record, plot, width, height, videoPath, frameRate);

                long recordDuration = System.currentTimeMillis() - recordStartTime;
                
                logger.info("Record {} 导出完成，耗时: {}ms", videoFileName, recordDuration);
                videoPaths.add(videoPath);

                // 新增：记录帧数信息（关键步骤）
                FrameInfo frameInfo = new FrameInfo(
                    record.getUuid(),
                    currentFrame,
                    recordResult.getFrameCount()  // 从渲染结果获取实际帧数
                );
                frameInfos.add(frameInfo);
                
                currentFrame += recordResult.getFrameCount();
                logger.debug("Record {} 帧数信息: 开始帧={}, 帧数={}", 
                    record.getUuid(), frameInfo.getStartFrame(), frameInfo.getFrameCount());
            }
            
            // 阶段2: 连接所有视频（无声）
            String silentVideoPath = tempDir + File.separator + "silent_video.mp4";
            VideoConcatenator.concatenateVideos(videoPaths, silentVideoPath);
            logger.info("无声视频生成完成: {}", silentVideoPath);
            
            // 阶段3: FFmpeg音频处理（使用修复版）
            String audioPath = tempDir + File.separator + "mixed_audio.wav";
            
            AudioTimelineBuilder timelineBuilder = new AudioTimelineBuilder();
            AudioTimeline audioTimeline = timelineBuilder.buildTimeline(records, frameInfos, frameRate);
            
            FFmpegAudioProcessor audioProcessor = new FFmpegAudioProcessor();
            audioProcessor.processAudioTimeline(audioTimeline, audioPath);
            
            logger.info("音频生成完成: {}", audioPath);
            
            // 阶段4: 合并音视频（使用新的直接映射方法）
            logger.info("开始合并音视频");
            
            // 方法1: 直接映射合并（推荐，速度更快）
            VideoAudioMerger.mergeVideoAudioDirect(silentVideoPath, audioPath, outputPath);
            
            // 或者方法2: 以最长文件为准的合并
            // VideoAudioMerger.mergeVideoAudioLongest(silentVideoPath, audioPath, outputPath);
            
            logger.info("音视频合并完成: {}", outputPath);
                
        } finally {
            // 可选：清理临时文件
            // cleanupTempFiles(videoPaths);
        }
        
    }



    
    /**
     * 生成有意义的视频文件名（包含顺序信息和Record标识）
     */
    private static String generateVideoFileName(Record record, int index) {
        // 使用索引保证顺序
        String sequence = String.format("%04d", index);
        String recordID = record.getUuid();

        // // 添加Record的标识信息（如果有的话）
        // String identifier = "";
        // if (record.getDialogue() != null && record.getDialogue().getSpeakerName() != null) {
        //     identifier = "_" + record.getDialogue().getSpeakerName();
        // }
        
        // // 添加场景信息（如果有的话）
        // String sceneInfo = "";
        // if (record.getBg() != null && !record.getBg().isEmpty()) {
        //     sceneInfo = "_scene";
        // }
        
        return String.format("record%s%s.mp4", sequence, recordID);
    }
    
    /**
     * 清理临时视频文件（可选）
     */
    private static void cleanupTempFiles(List<String> videoPaths) {
        logger.info("开始清理临时文件");
        int deletedCount = 0;
        
        for (String videoPath : videoPaths) {
            File file = new File(videoPath);
            if (file.exists() && file.delete()) {
                deletedCount++;
            }
        }
        
        logger.info("清理完成，删除了 {}/{} 个临时文件", deletedCount, videoPaths.size());
    }
    
    /**
     * 只处理特定的Record（用于增量更新）
     * @param recordIndex 需要更新的Record索引
     * @param records 完整的Record列表
     * @param finalOutputPath 最终输出视频路径
     * @param tempDir 临时文件目录
     */
    public static void updateSingleRecord(
        int recordIndex,
        List<Record> records,
        String finalOutputPath,
        String tempDir
    ) throws Exception {
        
        if (recordIndex < 0 || recordIndex >= records.size()) {
            throw new IllegalArgumentException("Record索引越界");
        }
        
        Record record = records.get(recordIndex);
        String videoFileName = generateVideoFileName(record, recordIndex);
        String videoPath = tempDir + File.separator + videoFileName;
        
        logger.info("更新第 {} 个Record: {}", recordIndex + 1, videoFileName);
        
        // 重新导出单个Record视频
        RenderOfVideo.exportRecordVideo(record, 
            true, 
            ProjectConfig.VIDEO_WIDTH, 
            ProjectConfig.VIDEO_HEIGHT, 
            videoPath, 
            ProjectConfig.FRAME_RATE
        );
        
        // 获取所有视频文件路径（按顺序）
        List<String> allVideoPaths = new ArrayList<>();
        for (int i = 0; i < records.size(); i++) {
            String fileName = generateVideoFileName(records.get(i), i);
            allVideoPaths.add(tempDir + File.separator + fileName);
        }
        
        // 重新连接所有视频
        VideoConcatenator.concatenateVideos(allVideoPaths, finalOutputPath);
        
        logger.info("单个Record更新完成");
    }

    /**
     * 渲染单个Record的结果
     */
    public static class RenderResult {
        private final int frameCount;
        private final long startTimeMs;
        private final long durationMs;
        
        public RenderResult(int frameCount, long startTimeMs, long durationMs) {
            this.frameCount = frameCount;
            this.startTimeMs = startTimeMs;
            this.durationMs = durationMs;
        }
        
        // getter方法
        public int getFrameCount() { return frameCount; }
        public long getStartTimeMs() { return startTimeMs; }
        public long getDurationMs() { return durationMs; }

        @Override
        public String toString() {
            return String.format("RenderResult{frameCount=%d, durationMs=%d}", frameCount, durationMs);
        }
    }
}