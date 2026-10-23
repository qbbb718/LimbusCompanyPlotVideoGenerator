package com.lbc_plot.render.engine;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * @module 渲染缓存
 * 片段缓存的「时长指纹」。
 *
 * <h2>它防的是什么</h2>
 * 批量导出支持"保留中间文件、跳过未修改的记录"。判断依据只有 {@code record.isDirty()} —
 * 但**影响成片时长的东西不全在记录里**：剧情类型（plot）、输出分辨率、帧率、结尾停留帧数
 * 都是工程级/全局设置。用户改了这些再导出时，记录本身没变，旧片段就会被直接复用，
 * 于是成片还是按老设置渲的（最典型的是"改了结尾停留时长但视频长度没变"）。
 *
 * <h2>做法</h2>
 * 每渲完一个片段，在它旁边写一个同名 {@code .fp} 旁文件（不改进原视频文件名，
 * 以免和其它按名字找片段的代码冲突）。复用前比对指纹，不一致就重渲。
 *
 * <p>指纹缺失（首次升级到这个版本）视为不一致 → 重渲一次并补写指纹，
 * 这是安全方向：宁可多渲一次，也不能拿老片段冒充新设置。
 */
public final class ClipCacheFingerprint {

    private static final Logger logger = LoggerFactory.getLogger(ClipCacheFingerprint.class);

    /** 指纹格式版本：以后加字段时改它，让所有旧缓存自然失效 */
    private static final String FORMAT_VERSION = "v1";

    private ClipCacheFingerprint() {
    }

    /**
     * 生成指纹。
     *
     * @param plot       是否剧情模式（影响 0.8 场景缩放与立绘是否渲染）
     * @param width      输出宽
     * @param height     输出高
     * @param frameRate  帧率
     * @param stayFrames 结尾停留帧数（工程级设置，将来可配）
     * @param layerType  分层类型（不同分层渲出来的片段不能混用）
     */
    public static String of(boolean plot, int width, int height, int frameRate, int stayFrames, String layerType) {
        return FORMAT_VERSION
                + "|plot=" + plot
                + "|size=" + width + "x" + height
                + "|fps=" + frameRate
                + "|stay=" + stayFrames
                + "|layer=" + (layerType == null ? RenderOfVideo.LAYER_FULL : layerType);
    }

    /** 片段旁边的指纹文件路径 */
    public static File sidecarOf(String videoPath) {
        return new File(videoPath + ".fp");
    }

    /** 读指纹；文件不存在/读失败返回空串（= 与任何期望值都不一致） */
    public static String read(File sidecar) {
        if (sidecar == null || !sidecar.isFile()) {
            return "";
        }
        try {
            return Files.readString(sidecar.toPath(), StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            logger.warn("读取片段指纹失败: {}", sidecar, e);
            return "";
        }
    }

    /** 写指纹；失败只告警，不影响导出（最坏结果是下次多渲一次） */
    public static void write(File sidecar, String fingerprint) {
        if (sidecar == null || fingerprint == null) {
            return;
        }
        try {
            Files.writeString(sidecar.toPath(), fingerprint, StandardCharsets.UTF_8);
        } catch (IOException e) {
            logger.warn("写入片段指纹失败: {}", sidecar, e);
        }
    }
}
