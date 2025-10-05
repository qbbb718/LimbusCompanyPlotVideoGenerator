package com.lbc_plot.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.project.audio.AudioCommand;
import com.lbc_plot.project.audio.AudioManager;
import com.lbc_plot.model.Record;


public class RecordDurationCalculator {
    private static final Logger logger = LoggerFactory.getLogger(RecordDurationCalculator.class);

    private static final int DEFAULT_STAY_FRAMES = ProjectConfig.DEFAULT_STAY_FRAMES; // 对话末尾延迟帧数
    
    
    /**
     * 计算Record的总时长（帧数）
     * 取最大值：音频时长 或 文字显示时长
     */
    public static int calculateDurationFrames(Record record, int frameRate) {
        if (record == null) {
            return 0;
        }
        
        // 计算音频相关时长
        int audioDuration = calculateAudioDuration(record, frameRate);
        
        // 计算文字显示时长
        int textDuration = calculateTextDuration(record);
        
        // 取最大值
        int finalDuration = Math.max(audioDuration, textDuration);
        
        logger.debug("Record时长计算 - 音频: {}帧, 文字: {}帧, 最终: {}帧", 
            audioDuration, textDuration, finalDuration);
        
        return finalDuration;
    }
    
    /**
     * 计算音频相关时长
     */
    private static int calculateAudioDuration(Record record, int frameRate) {
        if (record.getAudioCommands() == null || record.getAudioCommands().isEmpty()) {
            return 0;
        }
        
        int maxAudioDuration = 0;
        
        for (AudioCommand audioCmd : record.getAudioCommands()) {
            int audioFrames = calculateSingleAudioDuration(audioCmd, frameRate);
            maxAudioDuration = Math.max(maxAudioDuration, audioFrames);
        }
        
        // 如果有音频，加上额外的停留帧数
        if (maxAudioDuration > 0) {
            return maxAudioDuration + DEFAULT_STAY_FRAMES;
        }
        
        return 0;
    }
    
    /**
     * 计算单个音频的时长
     */
    private static int calculateSingleAudioDuration(AudioCommand audioCmd, int frameRate) {
        switch (audioCmd.getType()) {
            case VOICE_PLAY:
            case SFX_PLAY:
                // 对于语音和音效，获取音频文件的实际时长
                return getAudioFileDurationFrames(audioCmd.getAudioId(), frameRate);
                
            case BGM_START:
            case BGM_STOP:
                // BGM控制指令本身不占用时间（BGM时长在时间线层面处理）
                return 0;
                
            default:
                return 0;
        }
    }
    
    /**
     * 获取音频文件的时长（转换为帧数）
     */
    private static int getAudioFileDurationFrames(String audioId, int frameRate) {
        try {
            // 这里需要你实现音频文件时长的获取
            // 可以通过音频文件解析库获取实际时长
            double durationSeconds = AudioManager.getAudioDuration(audioId);
            return (int) Math.ceil(durationSeconds * frameRate);
            
        } catch (Exception e) {
            logger.warn("无法获取音频文件时长: {}, 使用默认值", audioId, e);
            return 2 * frameRate; // 默认2秒
        }
    }
    
    /**
     * 计算文字显示时长
     */
    private static int calculateTextDuration(Record record) {
        Dialogue dialogue = record.getDialogue();
        if (dialogue == null || dialogue.getText() == null) {
            return 0;
        }
        
        String text = dialogue.getText().trim();
        if (text.isEmpty()) {
            return 0;
        }
        
        // 计算逐字显示的基础帧数
        int baseTextFrames = text.length() * dialogue.getSpeed();
        
        // 加上显示完后的额外停留帧数
        return baseTextFrames + DEFAULT_STAY_FRAMES;
    }
    

}