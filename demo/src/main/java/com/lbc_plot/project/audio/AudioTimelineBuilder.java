package com.lbc_plot.project.audio;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.lbc_plot.model.Record;
import com.lbc_plot.project.audio.model.AudioCommand;
import com.lbc_plot.project.audio.model.AudioSegment;
import com.lbc_plot.project.audio.model.AudioTimeline;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


/**
 * 音频时间线构建器
 * 负责将Record中的音频指令转换为连续的音频时间线
 */
public class AudioTimelineBuilder {
    private static final Logger logger = LoggerFactory.getLogger(AudioTimelineBuilder.class);
    
    /**
     * 构建音频时间线
     * @param records 所有Record记录
     * @param frameInfos 帧信息列表（包含每个Record的时间位置）
     * @param frameRate 视频帧率
     * @return 构建好的音频时间线
     */
    public AudioTimeline buildTimeline(List<Record> records, List<FrameInfo> frameInfos, double frameRate) {
        logger.info("开始构建音频时间线: {}个Record, {}个帧信息, 帧率{}fps", 
            records.size(), frameInfos.size(), frameRate);
        
        // 计算总帧数
        int totalFrames = calculateTotalFrames(frameInfos);
        AudioTimeline timeline = new AudioTimeline(totalFrames, frameRate);
        
        // 当前活跃的BGM映射（audioId -> AudioSegment）
        Map<String, AudioSegment> activeBgms = new HashMap<>();
        
        // 按时间顺序处理每个Record
        for (FrameInfo frameInfo : frameInfos) {
            Record record = findRecordById(records, frameInfo.getRecordId());
            if (record == null) {
                logger.warn("找不到对应的Record: {}", frameInfo.getRecordId());
                continue;
            }
            
            // 处理该Record中的所有音频指令
            processRecordAudioCommands(record, frameInfo, timeline, activeBgms);
        }
        
        // 处理未结束的BGM（持续播放到视频结束）
        handleRemainingBgms(activeBgms, totalFrames, timeline);
        
        logger.info("音频时间线构建完成: 总帧数{}, 音频片段{}个", 
            totalFrames, timeline.getSegmentCount());
        
        return timeline;
    }
    
    /**
     * 计算总帧数
     */
    private int calculateTotalFrames(List<FrameInfo> frameInfos) {
        if (frameInfos.isEmpty()) {
            return 0;
        }
        
        FrameInfo lastFrameInfo = frameInfos.get(frameInfos.size() - 1);
        return lastFrameInfo.getStartFrame() + lastFrameInfo.getFrameCount();
    }
    
    /**
     * 处理单个Record的音频指令
     */
    private void processRecordAudioCommands(Record record, FrameInfo frameInfo, 
                                          AudioTimeline timeline, Map<String, AudioSegment> activeBgms) {
        List<AudioCommand> audioCommands = record.getAudioCommands();
        if (audioCommands == null || audioCommands.isEmpty()) {
            return;
        }
        
        logger.debug("处理Record {} 的音频指令: {}个指令", 
            record.getUuid(), audioCommands.size());
        
        for (AudioCommand command : audioCommands) {
            processSingleAudioCommand(command, frameInfo, timeline, activeBgms);
        }
    }
    
    /**
     * 处理单个音频指令
     */
    private void processSingleAudioCommand(AudioCommand command, FrameInfo frameInfo,
                                         AudioTimeline timeline, Map<String, AudioSegment> activeBgms) {
        switch (command.getType()) {
            case BGM_START:
                handleBgmStart(command, frameInfo, activeBgms);
                break;
                
            case BGM_STOP:
                handleBgmStop(command, frameInfo, activeBgms, timeline);
                break;
                
            case SFX_PLAY:
            case VOICE_PLAY:
                handleShortAudio(command, frameInfo, timeline);
                break;
                
            default:
                logger.warn("未知的音频指令类型: {}", command.getType());
        }
    }
    
    /**
     * 处理BGM开始指令
     */
    private void handleBgmStart(AudioCommand command, FrameInfo frameInfo, 
                               Map<String, AudioSegment> activeBgms) {
        String audioId = command.getAudioId();
        
        // 如果同ID的BGM已经在播放，先结束它
        if (activeBgms.containsKey(audioId)) {
            logger.debug("BGM {} 已经在播放，重新开始", audioId);
            // 这里可以选择淡出旧BGM，或者直接切换
            // 当前实现是直接切换，旧BGM会被新BGM覆盖
        }
        
        // 创建新的BGM片段（结束帧暂设为-1，表示持续播放）
        AudioSegment bgmSegment = new AudioSegment(
            audioId,
            frameInfo.getStartFrame(), // 从当前Record开始播放
            -1, // 结束帧未知，持续播放直到BGM_STOP或视频结束
            command.getType(),
            command.getVolume() != null ? command.getVolume() : 1.0f
        );
        
        activeBgms.put(audioId, bgmSegment);
        logger.debug("BGM {} 开始播放，起始帧: {}", audioId, frameInfo.getStartFrame());
    }
    
    /**
     * 处理BGM停止指令
     */
    private void handleBgmStop(AudioCommand command, FrameInfo frameInfo,
                              Map<String, AudioSegment> activeBgms, AudioTimeline timeline) {
        String audioId = command.getAudioId();
        
        if (activeBgms.containsKey(audioId)) {
            AudioSegment bgmSegment = activeBgms.get(audioId);
            
            // 设置BGM结束帧（在当前Record结束时停止）
            int endFrame = frameInfo.getStartFrame() + frameInfo.getFrameCount();
            bgmSegment.setEndFrame(endFrame);
            
            // 添加到时间线
            timeline.addSegment(bgmSegment);
            activeBgms.remove(audioId);
            
            logger.debug("BGM {} 停止播放，结束帧: {}", audioId, endFrame);
        } else {
            logger.warn("尝试停止未播放的BGM: {}", audioId);
        }
    }
    
    /**
     * 处理短音频（音效、语音）
     */
    private void handleShortAudio(AudioCommand command, FrameInfo frameInfo, AudioTimeline timeline) {
        // 计算短音频的播放范围（在当前Record的时间范围内）
        int startFrame = frameInfo.getStartFrame();
        int endFrame = startFrame + frameInfo.getFrameCount();
        
        AudioSegment audioSegment = new AudioSegment(
            command.getAudioId(),
            startFrame,
            endFrame,
            command.getType(),
            command.getVolume() != null ? command.getVolume() : 1.0f
        );
        
        timeline.addSegment(audioSegment);
        logger.debug("短音频 {} 播放，帧范围: {}-{}, 类型: {}", 
            command.getAudioId(), startFrame, endFrame, command.getType());
    }
    
    /**
     * 处理未结束的BGM（持续到视频结束）
     */
    private void handleRemainingBgms(Map<String, AudioSegment> activeBgms, int totalFrames, 
                                   AudioTimeline timeline) {
        if (activeBgms.isEmpty()) {
            return;
        }
        
        logger.info("处理 {} 个持续到视频结束的BGM", activeBgms.size());
        
        for (Map.Entry<String, AudioSegment> entry : activeBgms.entrySet()) {
            AudioSegment bgmSegment = entry.getValue();
            bgmSegment.setEndFrame(totalFrames);
            timeline.addSegment(bgmSegment);
            
            logger.debug("BGM {} 持续播放到视频结束，帧范围: {}-{}", 
                entry.getKey(), bgmSegment.getStartFrame(), totalFrames);
        }
        
        activeBgms.clear();
    }
    
    /**
     * 根据ID查找Record
     */
    private Record findRecordById(List<Record> records, String recordId) {
        for (Record record : records) {
            if (record.getUuid().equals(recordId)) {
                return record;
            }
        }
        return null;
    }
}