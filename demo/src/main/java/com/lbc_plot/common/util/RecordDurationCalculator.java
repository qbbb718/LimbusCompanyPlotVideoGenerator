package com.lbc_plot.common.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.render.audio.model.AudioCommand;
import com.lbc_plot.render.audio.model.AudioCommandType;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.audio.AudioDurationHelper;
import com.lbc_plot.render.engine.RenderOfVideo;

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
        int textDuration = calculateTextDuration(record, frameRate);

        // 取最大值
        int finalDuration = Math.max(audioDuration, textDuration) + ProjectConfig.DEFAULT_STAY_FRAMES;

        logger.info("Record时长计算完成 - Record ID: {}, 音频: {}帧, 文字: {}帧, 最终: {}帧 (约{}秒)",
                record.getUuid(), audioDuration, textDuration, finalDuration,
                String.format("%.2f", finalDuration / (double) frameRate));

        return finalDuration;
    }

    /**
     * 计算音频相关时长
     * 只计算音效(SFX_PLAY)和语音(VOICE_PLAY)的时长，忽略BGM时长
     */
    private static int calculateAudioDuration(Record record, int frameRate) {
        logger.info("=== 开始计算音频时长（仅音效和语音）===");
        logger.info("Record ID: {}", record.getUuid());

        if (record.getAudioCommands() == null) {
            logger.warn("audioCommands为null，返回0帧");
            return 0;
        }

        if (record.getAudioCommands().isEmpty()) {
            logger.info("audioCommands为空列表，返回0帧");
            return 0;
        }

        logger.info("发现 {} 个音频指令", record.getAudioCommands().size());

        int maxAudioDuration = 0;
        int commandIndex = 0;
        int sfxVoiceCount = 0; // 统计音效和语音数量

        for (AudioCommand audioCmd : record.getAudioCommands()) {
            commandIndex++;

            // 🔥 关键修改：只处理音效和语音，跳过BGM
            if (audioCmd.getType() == AudioCommandType.BGM_START ||
                    audioCmd.getType() == AudioCommandType.BGM_STOP) {
                logger.info("跳过第 {}/{} 个音频指令（BGM类型: {}）",
                        commandIndex, record.getAudioCommands().size(), audioCmd.getType());
                continue; // 跳过BGM指令
            }

            // 只处理音效和语音
            sfxVoiceCount++;
            logger.info("处理第 {}/{} 个有效音频指令（{}）:",
                    commandIndex, record.getAudioCommands().size(), audioCmd.getType());
            logger.info("  类型: {}", audioCmd.getType());
            logger.info("  音频ID: {}", audioCmd.getAudioId());

            int audioFrames = calculateSingleAudioDuration(audioCmd, frameRate);
            logger.info("  计算出的帧数: {} 帧 (约 {} 秒)",
                    audioFrames, String.format("%.2f", audioFrames / (double) frameRate));

            maxAudioDuration = Math.max(maxAudioDuration, audioFrames);
            logger.info("  当前最大音频时长: {} 帧", maxAudioDuration);
        }

        if (sfxVoiceCount == 0) {
            logger.info("没有音效或语音指令，返回0帧");
            return 0;
        }

        logger.info("最终最大音频时长: {} 帧 (约 {} 秒)，基于 {} 个音效/语音指令",
                maxAudioDuration, String.format("%.2f", maxAudioDuration / (double) frameRate), sfxVoiceCount);
        logger.info("=== 音频时长计算完成 ===\n");

        return maxAudioDuration;
    }

    /**
     * 计算单个音频指令的时长（仅处理音效和语音）
     */
    private static int calculateSingleAudioDuration(AudioCommand audioCmd, int frameRate) {
        logger.debug("计算单个音频时长 - 类型: {}, 音频ID: {}", audioCmd.getType(), audioCmd.getAudioId());

        // 安全检查：确保只处理音效和语音
        if (audioCmd.getType() == AudioCommandType.BGM_START ||
                audioCmd.getType() == AudioCommandType.BGM_STOP) {
            logger.warn("意外尝试计算BGM时长，返回0帧");
            return 0;
        }

        try {
            // 音效/语音处理：获取实际文件时长
            int audioFrames = AudioDurationHelper.getAudioFileDurationFrames(audioCmd.getAudioId(), frameRate);
            logger.debug("音效/语音文件时长: {} 帧", audioFrames);
            return audioFrames;
        } catch (Exception e) {
            logger.warn("计算音频时长失败: {}, 使用默认值", audioCmd.getAudioId(), e);
            // 返回一个安全的默认值，比如2秒
            int defaultFrames = 2 * frameRate;
            logger.debug("使用默认时长: {} 帧 (2秒)", defaultFrames);
            return defaultFrames;
        }
    }

    /**
     * 计算文字显示时长（更新为统一速度配置）
     */
    private static int calculateTextDuration(Record record, int frameRate) {
        Dialogue dialogue = record.getDialogue();
        if (dialogue == null || dialogue.getText() == null) {
            return 0;
        }

        String text = dialogue.getText().trim();
        if (text.isEmpty()) {
            return 0;
        }

        float unifiedSpeed = RenderOfVideo.getUnifiedSpeed(dialogue.getSpeed());
        int textDuration;

        if (unifiedSpeed < 1.0f) {
            // 🔥 慢速模式：每个字符持续多帧
            float framesPerChar = 1.0f / unifiedSpeed; // 比如 speed=0.1 → 10帧/字符
            int actualFramesPerChar = Math.max(1, Math.round(framesPerChar));
            textDuration = text.length() * actualFramesPerChar;

            logger.debug("文字时长计算(慢速): {}字符 × {}帧/字符 = {}帧",
                    text.length(), actualFramesPerChar, textDuration);

        } else {
            // 🔥 快速模式：每帧显示多字符
            int charsPerFrame = Math.max(1, Math.round(unifiedSpeed));
            textDuration = (int) Math.ceil((double) text.length() / charsPerFrame);

            logger.debug("文字时长计算(快速): {}字符 ÷ {}字符/帧 = {}帧",
                    text.length(), charsPerFrame, textDuration);
        }

        return textDuration;
    }

}