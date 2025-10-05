package com.lbc_plot.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.project.audio.AudioDurationHelper;
import com.lbc_plot.project.audio.model.AudioCommand;
import com.lbc_plot.model.Record;

public class RecordDurationCalculator {
    private static final Logger logger = LoggerFactory.getLogger(RecordDurationCalculator.class);
    
    /**
     * 计算Record的总时长（帧数）- 带详细日志
     */
    public static int calculateDurationFrames(Record record, int frameRate) {
        if (record == null) {
            logger.warn("Record为null，返回0帧时长");
            return 0;
        }
        
        logger.debug("开始计算Record时长 - Record ID: {}, 帧率: {}fps", 
            record.getUuid(), frameRate);
        
        // 计算音频相关时长
        int audioDuration = calculateAudioDuration(record, frameRate);
        
        // 计算文字显示时长
        int textDuration = calculateTextDuration(record);
        
        // 取最大值
        int finalDuration = Math.max(audioDuration, textDuration) + ProjectConfig.DEFAULT_STAY_FRAMES;
        
        logger.info("Record时长计算完成 - Record ID: {}, 音频: {}帧, 文字: {}帧, 最终: {}帧 (约{}秒)", 
            record.getUuid(), audioDuration, textDuration, finalDuration,
            String.format("%.2f", finalDuration / (double)frameRate));
        
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

            return maxAudioDuration;
        }
        
        
        return 0;
    }
    
    /**
     * 计算单个音频的时长
     */
    private static int calculateSingleAudioDuration(AudioCommand audioCmd, int frameRate) {
        int durationFrames = 0;
        
        switch (audioCmd.getType()) {
            case VOICE_PLAY:
            case SFX_PLAY:
                // 对于语音和音效，获取音频文件的实际时长
                durationFrames = AudioDurationHelper.getAudioFileDurationFrames(audioCmd.getAudioId(), frameRate);
                logger.debug("音频时长计算 - 类型: {}, 文件: {}, 时长: {}帧 (约{}秒)", 
                    audioCmd.getType(), audioCmd.getAudioId(), durationFrames, 
                    String.format("%.2f", durationFrames / (double)frameRate));
                break;
                
            case BGM_START:
            case BGM_STOP:
                // BGM控制指令本身不占用时间
                logger.debug("音频时长计算 - 类型: {}, 文件: {}, BGM控制指令不计时长", 
                    audioCmd.getType(), audioCmd.getAudioId());
                durationFrames = 0;
                break;
                
            default:
                logger.warn("音频时长计算 - 未知指令类型: {}, 文件: {}, 不计时长", 
                    audioCmd.getType(), audioCmd.getAudioId());
                durationFrames = 0;
        }
        
        return durationFrames;
    }
    
    /**
     * 计算文字显示时长（保持不变）
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
        
        int baseTextFrames = text.length() * dialogue.getSpeed();
        
        return baseTextFrames;
    }
    
}