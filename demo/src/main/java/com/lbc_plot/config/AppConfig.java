package com.lbc_plot.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.render.audio.AudioLoudnessMeasurer;

/**
 * 应用程序配置
 */
public class AppConfig {
    private static final Logger logger = LoggerFactory.getLogger(AppConfig.class);

    /**
     * 初始化音频系统
     */
    public static void initializeAudioSystem() {
        logger.info("初始化音频系统...");

        // 1. 设置用户音量偏好
        initializeUserVolumes();

        // 2. 预热响度测量（可选，用于缓存）
        preloadCommonAudioLoudness();

        // 3. 清理旧的临时文件
        cleanupTempFiles();

        logger.info("音频系统初始化完成");
    }

    /**
     * 初始化用户音量设置
     */
    private static void initializeUserVolumes() {
        // 从配置文件读取或使用默认值
        float bgmVolume = loadConfig("audio.bgm.volume", 0.7f);
        float voiceVolume = loadConfig("audio.voice.volume", 1.0f);
        float sfxVolume = loadConfig("audio.sfx.volume", 0.8f);

        // 修复：使用正确的方法名
        VolumeConfig.setUserVolumes(bgmVolume, voiceVolume, sfxVolume);

        // 新增：初始化类型增益
        float bgmGain = loadConfig("audio.bgm.gain", 1.2f);
        float voiceGain = loadConfig("audio.voice.gain", 1.0f);
        float sfxGain = loadConfig("audio.sfx.gain", 1.5f);
        VolumeConfig.setTypeGains(bgmGain, voiceGain, sfxGain);
    }

    /**
     * 预加载常用音频的响度（加快第一次处理速度）
     */
    private static void preloadCommonAudioLoudness() {
        // 这里可以预加载你常用的音频文件
        String[] commonAudioFiles = {
                "bgm_main", "bgm_battle", "sfx_click", "voice_narrator"
        };

        logger.debug("预加载常用音频响度...");
        for (String audioId : commonAudioFiles) {
            try {
                AudioLoudnessMeasurer.measureAudioLoudness(audioId);
            } catch (Exception e) {
                logger.debug("预加载失败: {}", audioId, e);
            }
        }
    }

    /**
     * 清理临时文件
     */
    private static void cleanupTempFiles() {
        AudioLoudnessMeasurer.clearCache();
        // 清理其他临时文件...
    }

    private static float loadConfig(String key, float defaultValue) {
        // 实际项目中从配置文件读取
        // 这里返回默认值
        return defaultValue;
    }
}