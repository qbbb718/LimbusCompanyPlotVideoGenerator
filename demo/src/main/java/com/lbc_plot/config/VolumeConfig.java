package com.lbc_plot.config;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.render.audio.model.AudioCommandType;
import com.lbc_plot.common.util.ResourceChecker;
import com.lbc_plot.render.audio.AudioLoudnessMeasurer;

/**
 * 音量配置管理器
 */
public class VolumeConfig {
    private static final Logger logger = LoggerFactory.getLogger(VolumeConfig.class);

    // 用户设置的音量级别（0.0 - 1.0）
    private static float userBgmVolume = 0.7f; // 背景音乐音量
    private static float userVoiceVolume = 1.0f; // 语音音量
    private static float userSfxVolume = 0.8f; // 音效音量

    // 类型基础增益（用于自动均衡）
    private static float bgmGain = 1.0f;
    private static float voiceGain = 1.0f;
    private static float sfxGain = 1.0f;

    /**
     * 设置用户音量（主要调节方法）
     */
    public static void setUserVolumes(float bgm, float voice, float sfx) {
        userBgmVolume = clamp(bgm, 0.0f, 2.0f);
        userVoiceVolume = clamp(voice, 0.0f, 2.0f);
        userSfxVolume = clamp(sfx, 0.0f, 2.0f);

        logger.info("用户音量设置 - BGM: {}, 语音: {}, 音效: {}",
                userBgmVolume, userVoiceVolume, userSfxVolume);
    }

    /**
     * 同时设置用户音量和类型增益的便捷方法
     */
    public static void setVolumes(float bgmVol, float voiceVol, float sfxVol,
            float bgmGain, float voiceGain, float sfxGain) {
        setUserVolumes(bgmVol, voiceVol, sfxVol);
        setTypeGains(bgmGain, voiceGain, sfxGain);
    }

    /**
     * 只设置用户音量的便捷方法（保持与AppConfig兼容）
     */
    public static void setVolumes(float bgmVol, float voiceVol, float sfxVol) {
        setUserVolumes(bgmVol, voiceVol, sfxVol);
    }

    /**
     * 设置类型增益（高级调节，用于自动均衡）
     */
    public static void setTypeGains(float bgmGain, float voiceGain, float sfxGain) {
        VolumeConfig.bgmGain = clamp(bgmGain, 0.1f, 4.0f);
        VolumeConfig.voiceGain = clamp(voiceGain, 0.1f, 4.0f);
        VolumeConfig.sfxGain = clamp(sfxGain, 0.1f, 4.0f);

        logger.info("类型增益设置 - BGM增益: {}, 语音增益: {}, 音效增益: {}",
                bgmGain, voiceGain, sfxGain);
    }

    /**
     * 单独设置BGM音量
     */
    public static void setBgmVolume(float volume) {
        userBgmVolume = clamp(volume, 0.0f, 2.0f);
        logger.info("BGM音量设置: {}", userBgmVolume);
    }

    /**
     * 单独设置语音音量
     */
    public static void setVoiceVolume(float volume) {
        userVoiceVolume = clamp(volume, 0.0f, 2.0f);
        logger.info("语音音量设置: {}", userVoiceVolume);
    }

    /**
     * 单独设置音效音量
     */
    public static void setSfxVolume(float volume) {
        userSfxVolume = clamp(volume, 0.0f, 2.0f);
        logger.info("音效音量设置: {}", userSfxVolume);
    }

    /**
     * 单独设置BGM增益
     */
    public static void setBgmGain(float gain) {
        bgmGain = clamp(gain, 0.1f, 4.0f);
        logger.info("BGM增益设置: {}", bgmGain);
    }

    /**
     * 单独设置语音增益
     */
    public static void setVoiceGain(float gain) {
        voiceGain = clamp(gain, 0.1f, 4.0f);
        logger.info("语音增益设置: {}", voiceGain);
    }

    /**
     * 单独设置音效增益
     */
    public static void setSfxGain(float gain) {
        sfxGain = clamp(gain, 0.1f, 4.0f);
        logger.info("音效增益设置: {}", sfxGain);
    }

    /**
     * 获取标准化音量（AudioTimelineBuilder调用）
     */
    public static float getNormalizedVolume(AudioCommandType type, String audioId) {
        float userVolume = getUserVolume(type);
        float typeGain = getTypeGain(type);
        float normalizedVolume = userVolume * typeGain;

        // 限制在合理范围内
        normalizedVolume = clamp(normalizedVolume, 0.0f, 4.0f);

        logger.debug("音量计算 - 文件: {}, 类型: {}, 用户音量: {}, 类型增益: {}, 最终: {}",
                audioId, type, userVolume, typeGain, normalizedVolume);

        return normalizedVolume;
    }

    // 辅助方法
    private static float getUserVolume(AudioCommandType type) {
        switch (type) {
            case BGM_START:
                return userBgmVolume;
            case VOICE_PLAY:
                return userVoiceVolume;
            case SFX_PLAY:
                return userSfxVolume;
            default:
                return 1.0f;
        }
    }

    private static float getTypeGain(AudioCommandType type) {
        switch (type) {
            case BGM_START:
                return bgmGain;
            case VOICE_PLAY:
                return voiceGain;
            case SFX_PLAY:
                return sfxGain;
            default:
                return 1.0f;
        }
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    // 获取当前设置的方法（用于UI显示）
    public static float getCurrentBgmVolume() {
        return userBgmVolume;
    }

    public static float getCurrentVoiceVolume() {
        return userVoiceVolume;
    }

    public static float getCurrentSfxVolume() {
        return userSfxVolume;
    }

    public static float getCurrentBgmGain() {
        return bgmGain;
    }

    public static float getCurrentVoiceGain() {
        return voiceGain;
    }

    public static float getCurrentSfxGain() {
        return sfxGain;
    }
}