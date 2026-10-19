package com.lbc_plot.common.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.awt.*;
import java.awt.image.BufferedImage;

/**
 * 纹理着色工具类 - 直接RGB着色方案
 * 输入RGB颜色和白色纹理，输出着色后的纹理
 * 甚至能保留透明度，好
 */
public class TextureColorizer {
    private static final Logger logger = LoggerFactory.getLogger(TextureColorizer.class);

    /**
     * 将白色纹理着色为目标RGB颜色
     * 
     * @param texture     白色纹理（RGB格式）
     * @param targetColor 目标RGB颜色
     * @return 着色后的图像
     */
    public static BufferedImage colorizeToRGB(BufferedImage texture, Color targetColor) {
        logger.debug("开始着色处理 - 使用Color对象: R={}, G={}, B={}",
                targetColor.getRed(), targetColor.getGreen(), targetColor.getBlue());
        return colorizeToRGB(texture, targetColor.getRed(), targetColor.getGreen(), targetColor.getBlue());
    }

    /**
     * 将白色纹理着色为目标RGB颜色
     *
     * <p>算法与旧实现逐像素一致：先按加权平均算亮度，再用「目标色 × 亮度」着色、保留原 alpha。
     * 但不再逐像素 {@code getRGB}/{@code new Color()}：整幅取一次 {@code int[]}、原地算完再整幅写回。
     * 名片纹理是 1308×543（71 万像素），旧写法每次要 30~70ms，而每渲染一次预览都要跑一次。
     *
     * @param texture     白色纹理（RGB格式）
     * @param targetRed   目标红色分量 (0-255)
     * @param targetGreen 目标绿色分量 (0-255)
     * @param targetBlue  目标蓝色分量 (0-255)
     * @return 着色后的图像（不修改入参）
     */
    public static BufferedImage colorizeToRGB(BufferedImage texture, int targetRed, int targetGreen, int targetBlue) {
        if (texture == null) {
            logger.error("纹理不能为null");
            throw new IllegalArgumentException("纹理不能为null");
        }

        if (targetRed < 0 || targetRed > 255 || targetGreen < 0 || targetGreen > 255 || targetBlue < 0
                || targetBlue > 255) {
            logger.error("颜色分量超出范围: R={}, G={}, B={}", targetRed, targetGreen, targetBlue);
            throw new IllegalArgumentException("颜色分量必须在0-255范围内");
        }

        final int width = texture.getWidth();
        final int height = texture.getHeight();
        BufferedImage result = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        if (width <= 0 || height <= 0) {
            return result;
        }

        int[] pixels = texture.getRGB(0, 0, width, height, null, 0, width);
        for (int i = 0; i < pixels.length; i++) {
            int pixel = pixels[i];
            int alpha = pixel >>> 24;
            if (alpha == 0) {
                // 全透明像素着色后依旧不可见，保持原值
                continue;
            }
            int r = (pixel >> 16) & 0xFF;
            int g = (pixel >> 8) & 0xFF;
            int b = pixel & 0xFF;
            // 与人眼感知接近的加权平均亮度（与旧实现一致）
            float brightness = (r * 0.299f + g * 0.587f + b * 0.114f) / 255.0f;
            int outR = clamp((int) (targetRed * brightness));
            int outG = clamp((int) (targetGreen * brightness));
            int outB = clamp((int) (targetBlue * brightness));
            pixels[i] = (alpha << 24) | (outR << 16) | (outG << 8) | outB;
        }
        result.setRGB(0, 0, width, height, pixels, 0, width);

        return result;
    }

    /** 限制到 0-255。 */
    private static int clamp(int value) {
        return value < 0 ? 0 : Math.min(value, 255);
    }

    /**
     * 便捷方法：从十六进制字符串获取颜色
     */
    public static BufferedImage colorizeToHex(BufferedImage texture, String hexColor) {
        logger.debug("开始着色处理 - 使用十六进制颜色: {}", hexColor);
        try {
            Color color = hexToColor(hexColor);
            return colorizeToRGB(texture, color);
        } catch (Exception e) {
            logger.error("十六进制颜色转换失败: {}", hexColor, e);
            throw e;
        }
    }

    /**
     * 十六进制颜色字符串转Color对象
     */
    public static Color hexToColor(String hex) {
        logger.debug("转换十六进制颜色: {}", hex);

        if (hex == null || hex.trim().isEmpty()) {
            logger.error("十六进制颜色字符串不能为空");
            throw new IllegalArgumentException("十六进制颜色字符串不能为空");
        }

        String cleanHex = hex;
        if (cleanHex.startsWith("#")) {
            cleanHex = cleanHex.substring(1);
            logger.debug("移除#前缀: {}", cleanHex);
        }

        if (cleanHex.length() != 6) {
            logger.error("十六进制颜色长度不正确: {} (应为6个字符)", cleanHex);
            throw new IllegalArgumentException("十六进制颜色必须为6个字符");
        }

        try {
            Color color = new Color(
                    Integer.valueOf(cleanHex.substring(0, 2), 16),
                    Integer.valueOf(cleanHex.substring(2, 4), 16),
                    Integer.valueOf(cleanHex.substring(4, 6), 16));

            logger.debug("颜色转换成功: {} -> RGB({},{},{})", hex,
                    color.getRed(), color.getGreen(), color.getBlue());

            return color;

        } catch (NumberFormatException e) {
            logger.error("十六进制颜色格式错误: {}", hex, e);
            throw new IllegalArgumentException("无效的十六进制颜色: " + hex, e);
        }
    }
}