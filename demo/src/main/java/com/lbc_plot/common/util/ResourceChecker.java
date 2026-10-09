package com.lbc_plot.common.util;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 资源文件检查工具
 */
public class ResourceChecker {
    private static final Logger logger = LoggerFactory.getLogger(ResourceChecker.class);

    /**
     * 检查文件是否存在（支持文件系统和resources目录）
     */
    public static boolean checkFileExists(String filePath) {
        // 1. 先检查文件系统
        File file = new File(filePath);
        if (file.exists()) {
            logger.debug("文件存在于文件系统: {}", file.getAbsolutePath());
            return true;
        }

        // 2. 检查resources目录
        try {
            InputStream inputStream = ResourceChecker.class.getClassLoader().getResourceAsStream(filePath);
            if (inputStream != null) {
                inputStream.close();
                logger.debug("文件存在于resources: {}", filePath);
                return true;
            }
        } catch (IOException e) {
            logger.debug("检查resources文件失败: {}", filePath, e);
        }

        logger.debug("文件不存在: {}", filePath);
        return false;
    }

    /**
     * 查找音频文件路径（支持多种格式）。
     *
     * <p>音频素材统一存放在运行时素材目录下的 audios（{@link RuntimePaths#getAudiosDir()}，
     * 即 {@code {dataRoot}/assets/audios}）。传入值可能是：
     * <ul>
     *   <li>不带扩展名的名称/stem（如 {@code 卧槽_1791379183273}，渲染管线走的就是这种）；</li>
     *   <li>带扩展名的文件名（{@code 卧槽_1791379183273.wav}）；</li>
     *   <li>数据库中保存的 URL 形式路径（{@code /assets/audios/xxx.mp3}）。</li>
     * </ul>
     *
     * <p>旧实现只在相对路径 {@code assets/audios/}、{@code audio/} 等目录里找，
     * 这些路径按 JVM 工作目录解析，而音频实际落在用户数据目录，
     * 于是"上传成功、预览能放，但导出视频时音频被静默跳过"。
     *
     * @return 磁盘上的绝对路径；找不到时返回原值，让 FFmpeg 报出明确错误
     */
    public static String findAudioFilePath(String audioId) {
        // 伪指令（如 -STOP）不解析为文件路径
        if (audioId == null || audioId.startsWith("-")) {
            logger.debug("跳过伪音频指令: {}", audioId);
            return audioId;
        }

        String normalized = audioId.replace('\\', '/').trim();

        // 已经是可直接使用的绝对路径
        File asIs = new File(normalized);
        if (asIs.isAbsolute() && asIs.isFile()) {
            logger.debug("音频为绝对路径且存在: {}", asIs.getAbsolutePath());
            return asIs.getAbsolutePath();
        }

        // 去掉 /assets/ 或 assets/ 前缀，并把 audios/ 之前的部分剥离，
        // 只保留相对 audios 目录的剩余部分（通常是文件名）
        String relative = normalized;
        if (relative.startsWith("/assets/")) {
            relative = relative.substring("/assets/".length());
        } else if (relative.startsWith("assets/")) {
            relative = relative.substring("assets/".length());
        }
        if (relative.startsWith("audios/")) {
            relative = relative.substring("audios/".length());
        }
        // 只允许在 audios 目录内查找：去掉前导 '/' 与 '..' 段，
        // 避免形如 "../../x" 的输入把查找引出素材目录
        while (relative.startsWith("/")) {
            relative = relative.substring(1);
        }
        if (relative.contains("..")) {
            logger.warn("音频名称包含非法路径片段，已拒绝解析: {}", audioId);
            return audioId;
        }

        // 1) 运行时素材目录下的 audios（唯一权威位置）
        Path runtimeAudios = RuntimePaths.getAudiosDir();
        String found = findUnder(runtimeAudios, relative);
        if (found != null) {
            return found;
        }

        // 2) 兼容历史布局：相对工作目录的 assets/audios 与 audio/
        String[] legacyDirs = { "assets/audios/", "audio/" };
        for (String dir : legacyDirs) {
            String candidate = findUnder(new File(dir).toPath(), relative);
            if (candidate != null) {
                return candidate;
            }
        }

        // 3) classpath 内的音频（随包发布的小素材）
        for (String ext : AUDIO_EXTENSIONS) {
            String resourcePath = "assets/audios/" + relative + ext;
            if (isResourceExists(resourcePath)) {
                return copyResourceToTempFile(resourcePath);
            }
        }

        logger.warn("未找到音频文件: {}（已查找 {}）", audioId, runtimeAudios.toAbsolutePath());
        return audioId; // 返回原值，让FFmpeg处理错误
    }

    /** 支持的音频扩展名（与上传接口的格式白名单保持一致，避免上传成功却渲染时找不到） */
    private static final String[] AUDIO_EXTENSIONS = {
            ".wav", ".mp3", ".ogg", ".oga", ".m4a", ".aac", ".flac", ".wma", ".opus", ".aiff", ".aif"
    };

    /**
     * 在指定目录下查找音频：先按原样（可能已含扩展名），再逐个尝试补扩展名。
     *
     * @return 绝对路径；未找到返回 null
     */
    private static String findUnder(Path dir, String relative) {
        if (relative == null || relative.isEmpty()) {
            return null;
        }

        // 原样（含扩展名的情况）
        File exact = dir.resolve(relative).toFile();
        if (exact.isFile()) {
            logger.debug("文件存在于文件系统(含扩展名): {}", exact.getAbsolutePath());
            return exact.getAbsolutePath();
        }

        // 不带扩展名的 stem → 逐个扩展名尝试
        if (!hasExtension(relative)) {
            for (String ext : AUDIO_EXTENSIONS) {
                File withExt = dir.resolve(relative + ext).toFile();
                if (withExt.isFile()) {
                    logger.debug("文件存在于文件系统: {}", withExt.getAbsolutePath());
                    return withExt.getAbsolutePath();
                }
            }
        }

        return null;
    }

    /** 判断文件名是否已带扩展名（只看最后一段） */
    private static boolean hasExtension(String name) {
        int slash = name.lastIndexOf('/');
        String last = (slash >= 0) ? name.substring(slash + 1) : name;
        int dot = last.lastIndexOf('.');
        return dot > 0 && dot < last.length() - 1;
    }

    /**
     * 检查资源文件是否存在
     */
    private static boolean isResourceExists(String resourcePath) {
        try {
            InputStream inputStream = ResourceChecker.class.getClassLoader().getResourceAsStream(resourcePath);
            if (inputStream != null) {
                inputStream.close();
                return true;
            }
        } catch (IOException e) {
            logger.debug("检查resources文件失败: {}", resourcePath, e);
        }
        return false;
    }

    /**
     * 将resources中的文件复制到临时文件
     */
    private static String copyResourceToTempFile(String resourcePath) throws RuntimeException {
        try {
            InputStream inputStream = ResourceChecker.class.getClassLoader().getResourceAsStream(resourcePath);
            if (inputStream == null) {
                throw new IOException("资源文件不存在: " + resourcePath);
            }

            // 创建临时文件
            String fileName = new File(resourcePath).getName();
            File tempFile = File.createTempFile("audio_", "_" + fileName);
            tempFile.deleteOnExit();

            // 复制数据
            try (FileOutputStream outputStream = new FileOutputStream(tempFile)) {
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = inputStream.read(buffer)) != -1) {
                    outputStream.write(buffer, 0, bytesRead);
                }
            } finally {
                inputStream.close();
            }

            logger.debug("资源文件已复制到临时文件: {}", tempFile.getAbsolutePath());
            return tempFile.getAbsolutePath();

        } catch (IOException e) {
            throw new RuntimeException("复制资源文件失败: " + resourcePath, e);
        }
    }
}