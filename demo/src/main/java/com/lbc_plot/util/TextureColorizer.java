package com.lbc_plot.util;

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
     * @param texture 白色纹理（RGB格式）
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
     * @param texture 白色纹理（RGB格式）
     * @param targetRed 目标红色分量 (0-255)
     * @param targetGreen 目标绿色分量 (0-255)
     * @param targetBlue 目标蓝色分量 (0-255)
     * @return 着色后的图像
     */
    public static BufferedImage colorizeToRGB(BufferedImage texture, int targetRed, int targetGreen, int targetBlue) {
        long startTime = System.currentTimeMillis();
        
        logger.info("开始纹理着色: 纹理尺寸={}x{}, 目标颜色=RGB({},{},{})", 
            texture.getWidth(), texture.getHeight(), targetRed, targetGreen, targetBlue);

        // 验证输入参数
        if (texture == null) {
            logger.error("纹理不能为null");
            throw new IllegalArgumentException("纹理不能为null");
        }

        if (targetRed < 0 || targetRed > 255 || targetGreen < 0 || targetGreen > 255 || targetBlue < 0 || targetBlue > 255) {
            logger.error("颜色分量超出范围: R={}, G={}, B={}", targetRed, targetGreen, targetBlue);
            throw new IllegalArgumentException("颜色分量必须在0-255范围内");
        }

        BufferedImage result = new BufferedImage(
            texture.getWidth(), texture.getHeight(), BufferedImage.TYPE_INT_ARGB
        );

        int totalPixels = texture.getWidth() * texture.getHeight();
        int processedPixels = 0;
        long lastLogTime = startTime;

        for (int y = 0; y < texture.getHeight(); y++) {
            for (int x = 0; x < texture.getWidth(); x++) {
                int rgb = texture.getRGB(x, y);
                Color originalColor = new Color(rgb, true); // 支持透明度

                // 计算原像素的亮度（灰度值）
                float brightness = calculateBrightness(originalColor);

                // 应用目标颜色，保持亮度关系
                Color newColor = applyTargetColor(originalColor, targetRed, targetGreen, targetBlue, brightness);

                result.setRGB(x, y, newColor.getRGB());
                
                processedPixels++;
                
                // 每处理10%的像素或每隔5秒记录一次进度
                long currentTime = System.currentTimeMillis();
                if (processedPixels % (totalPixels / 10) == 0 || currentTime - lastLogTime > 5000) {
                    float progress = (float) processedPixels / totalPixels * 100;
                    //logger.debug("处理进度: {:.1f}% ({}/{} 像素)", progress, processedPixels, totalPixels);
                    lastLogTime = currentTime;
                }
            }
        }

        long duration = System.currentTimeMillis() - startTime;
        logger.info("纹理着色完成: 耗时{}ms, 处理{}个像素, 平均{:.2f}像素/ms", 
            duration, totalPixels, (float) totalPixels / Math.max(1, duration));

        return result;
    }

    /**
     * 计算颜色的亮度（多种算法可选）
     */
    private static float calculateBrightness(Color color) {
        // 方法2：加权平均（更符合人眼感知，推荐）
        float brightness = (color.getRed() * 0.299f + color.getGreen() * 0.587f + color.getBlue() * 0.114f) / 255.0f;
        
        if (logger.isTraceEnabled()) {
            logger.trace("计算亮度: RGB({},{},{}) -> 亮度={:.3f}", 
                color.getRed(), color.getGreen(), color.getBlue(), brightness);
        }
        
        return brightness;
    }

    /**
     * 应用目标颜色到原像素
     */
    private static Color applyTargetColor(Color originalColor, int targetRed, int targetGreen, int targetBlue, float brightness) {
        // 保持透明度
        int alpha = originalColor.getAlpha();

        // 基础着色：目标颜色 × 原像素亮度
        int r = (int)(targetRed * brightness);
        int g = (int)(targetGreen * brightness);
        int b = (int)(targetBlue * brightness);

        // 限制范围 (0-255)
        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));

        if (logger.isTraceEnabled()) {
            logger.trace("应用颜色: 亮度={:.3f}, 目标RGB({},{},{}), 结果RGB({},{},{})", 
                brightness, targetRed, targetGreen, targetBlue, r, g, b);
        }

        return new Color(r, g, b, alpha);
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
                Integer.valueOf(cleanHex.substring(4, 6), 16)
            );
            
            logger.debug("颜色转换成功: {} -> RGB({},{},{})", hex, 
                color.getRed(), color.getGreen(), color.getBlue());
            
            return color;
            
        } catch (NumberFormatException e) {
            logger.error("十六进制颜色格式错误: {}", hex, e);
            throw new IllegalArgumentException("无效的十六进制颜色: " + hex, e);
        }
    }
}