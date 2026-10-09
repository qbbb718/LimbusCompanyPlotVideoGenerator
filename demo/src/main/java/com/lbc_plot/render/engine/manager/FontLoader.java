package com.lbc_plot.render.engine.manager;

import java.awt.Font;
import java.awt.FontFormatException;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.render.engine.RenderOfImage;

/**
 * 字体加载工具类
 */
public class FontLoader {
    private static final Logger logger = LoggerFactory.getLogger(FontLoader.class);

    private static Font chineseFont = null;

    /**
     * 加载中文字体
     */
    public static Font loadChineseFont() {
        if (chineseFont != null) {
            return chineseFont;
        }

        try {
            // 先尝试从 classpath 加载
            try (InputStream fontStream = FontLoader.class.getClassLoader()
                    .getResourceAsStream("fonts/ChineseFont.ttf")) {
                if (fontStream != null) {
                    chineseFont = Font.createFont(Font.TRUETYPE_FONT, fontStream);
                    logger.info("中文字体加载成功 (classpath)");
                    return chineseFont;
                }
            }

            // classpath 找不到时，回退到文件系统。
            // 字体位于运行时素材目录 {dataRoot}/assets/fonts/ChineseFont.ttf，
            // 由 RuntimePaths 解析成绝对路径，不再按 JVM 工作目录猜测 assets/fonts/...。
            File fontFile = RuntimePaths.getAssetsDir().resolve("fonts").resolve("ChineseFont.ttf").toFile();
            if (fontFile.exists() && fontFile.isFile()) {
                chineseFont = Font.createFont(Font.TRUETYPE_FONT, fontFile);
                logger.info("中文字体加载成功 (文件系统): {}", fontFile.getAbsolutePath());
                return chineseFont;
            }

            throw new IOException("字体文件未找到: fonts/ChineseFont.ttf"
                    + "（已尝试 classpath 与 " + fontFile.getAbsolutePath() + "）");

        } catch (FontFormatException | IOException e) {
            logger.error("字体加载失败，使用默认字体", e);
            chineseFont = new Font("SimSun", Font.PLAIN, 12); // fallback to 宋体
        }

        return chineseFont;
    }

    /**
     * 获取指定大小的中文字体
     */
    public static Font getChineseFont(float size) {
        Font baseFont = loadChineseFont();
        return baseFont.deriveFont(size);
    }

    /**
     * 获取指定样式和大小的中文字体
     */
    public static Font getChineseFont(int style, float size) {
        Font baseFont = loadChineseFont();
        return baseFont.deriveFont(style, size);
    }
}