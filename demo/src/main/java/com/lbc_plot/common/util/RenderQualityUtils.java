package com.lbc_plot.common.util;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;

/**
 * 高质量渲染工具类
 * 提供统一的超高质量渲染设置
 */
public class RenderQualityUtils {

    // 私有构造函数，防止实例化
    private RenderQualityUtils() {
    }

    /**
     * 设置超高质量渲染参数（静态方法）
     */
    public static void setupUltraQualityRendering(Graphics2D g2d) {
        if (g2d == null) {
            return;
        }

        // 图像渲染质量
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g2d.setRenderingHint(RenderingHints.KEY_ALPHA_INTERPOLATION, RenderingHints.VALUE_ALPHA_INTERPOLATION_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_COLOR_RENDERING, RenderingHints.VALUE_COLOR_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_DITHERING, RenderingHints.VALUE_DITHER_ENABLE);

        // 文字渲染质量
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_LCD_HRGB);
        g2d.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
    }

    /**
     * 设置高质量渲染参数（平衡性能和质量）
     */
    public static void setupHighQualityRendering(Graphics2D g2d) {
        if (g2d == null) {
            return;
        }

        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g2d.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
    }

    /**
     * 创建高质量BufferedImage（ARGB格式）
     */
    public static BufferedImage createHighQualityImage(int width, int height) {
        return new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
    }

    /**
     * 转换图像到高质量格式（ARGB）
     */
    public static BufferedImage convertToHighQuality(BufferedImage source) {
        if (source == null) {
            return null;
        }

        // 如果已经是高质量格式，直接返回
        if (source.getType() == BufferedImage.TYPE_INT_ARGB) {
            return source;
        }

        // 创建高质量图像
        BufferedImage highQualityImage = createHighQualityImage(
                source.getWidth(), source.getHeight());

        Graphics2D g2d = highQualityImage.createGraphics();
        setupUltraQualityRendering(g2d);
        g2d.drawImage(source, 0, 0, null);
        g2d.dispose();

        return highQualityImage;
    }

    /**
     * 高质量图像缩放（按倍数缩放）
     * 
     * @param original 原始图像
     * @param scale    缩放倍数（1.0 = 100%, 0.5 = 50%, 2.0 = 200%）
     * @return 缩放后的高质量图像
     */
    public static BufferedImage scaleImageHighQuality(BufferedImage original, float scale) {
        if (original == null) {
            return null;
        }

        if (scale <= 0) {
            throw new IllegalArgumentException("缩放倍数必须大于0");
        }

        // 计算新尺寸
        int newWidth = Math.max(1, Math.round(original.getWidth() * scale));
        int newHeight = Math.max(1, Math.round(original.getHeight() * scale));

        return scaleImageHighQuality(original, newWidth, newHeight);
    }

    /**
     * 高质量图像缩放（按倍数缩放，保持宽高比）
     * 
     * @param original        原始图像
     * @param scale           缩放倍数
     * @param keepAspectRatio 是否保持宽高比
     * @return 缩放后的高质量图像
     */
    public static BufferedImage scaleImageHighQuality(BufferedImage original, float scale, boolean keepAspectRatio) {
        if (original == null) {
            return null;
        }

        if (scale <= 0) {
            throw new IllegalArgumentException("缩放倍数必须大于0");
        }

        if (keepAspectRatio) {
            int newWidth = Math.max(1, Math.round(original.getWidth() * scale));
            int newHeight = Math.max(1, Math.round(original.getHeight() * scale));
            return scaleImageHighQuality(original, newWidth, newHeight);
        } else {
            return scaleImageHighQuality(original, scale);
        }
    }

    /**
     * 高质量图像缩放（指定最大尺寸，保持宽高比）
     * 
     * @param original     原始图像
     * @param maxDimension 最大尺寸（宽或高）
     * @return 缩放后的高质量图像
     */
    public static BufferedImage scaleImageToMaxDimension(BufferedImage original, int maxDimension) {
        if (original == null) {
            return null;
        }

        if (maxDimension <= 0) {
            throw new IllegalArgumentException("最大尺寸必须大于0");
        }

        int width = original.getWidth();
        int height = original.getHeight();

        // 计算缩放比例
        float scale;
        if (width > height) {
            scale = (float) maxDimension / width;
        } else {
            scale = (float) maxDimension / height;
        }

        return scaleImageHighQuality(original, scale);
    }

    /**
     * 高质量图像缩放（指定目标尺寸，可选择是否保持宽高比）
     * 
     * @param original        原始图像
     * @param targetWidth     目标宽度
     * @param targetHeight    目标高度
     * @param keepAspectRatio 是否保持宽高比
     * @return 缩放后的高质量图像
     */
    public static BufferedImage scaleImageHighQuality(BufferedImage original,
            int targetWidth, int targetHeight,
            boolean keepAspectRatio) {
        if (original == null) {
            return null;
        }

        if (keepAspectRatio) {
            // 计算保持宽高比的缩放
            float widthRatio = (float) targetWidth / original.getWidth();
            float heightRatio = (float) targetHeight / original.getHeight();
            float scale = Math.min(widthRatio, heightRatio);

            int newWidth = Math.round(original.getWidth() * scale);
            int newHeight = Math.round(original.getHeight() * scale);

            return scaleImageHighQuality(original, newWidth, newHeight);
        } else {
            return scaleImageHighQuality(original, targetWidth, targetHeight);
        }
    }

    /**
     * 高质量图像缩放
     */
    public static BufferedImage scaleImageHighQuality(BufferedImage source, int newWidth, int newHeight) {
        if (source == null) {
            return null;
        }

        BufferedImage scaledImage = createHighQualityImage(newWidth, newHeight);
        Graphics2D g2d = scaledImage.createGraphics();

        setupUltraQualityRendering(g2d);
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                RenderingHints.VALUE_INTERPOLATION_BICUBIC);

        g2d.drawImage(source, 0, 0, newWidth, newHeight, null);
        g2d.dispose();

        return scaledImage;
    }

    /**
     * 获取渲染质量配置常量
     */
    public static class QualityPresets {
        // 超高质量配置（用于最终渲染）
        public static final Object[] ULTRA_QUALITY = {
                RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON,
                RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY,
                RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC,
                RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_LCD_HRGB
        };

        // 高质量配置（平衡性能）
        public static final Object[] HIGH_QUALITY = {
                RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON,
                RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY,
                RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR
        };

        // 性能优先配置
        public static final Object[] PERFORMANCE = {
                RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_OFF,
                RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_SPEED,
                RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR
        };
    }
}