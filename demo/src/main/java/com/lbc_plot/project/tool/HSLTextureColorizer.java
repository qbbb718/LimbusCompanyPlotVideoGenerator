package com.lbc_plot.project.tool;
//工具类

import java.awt.*;
import java.awt.image.BufferedImage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


public class HSLTextureColorizer {

    /**
     * 将白色纹理调整为目标HSL值, 用于调整说话人的对话框颜色UI
     * @param texture 白色纹理（RGB）
     * @param hue 目标色相（0-360）
     * @param saturation 目标饱和度（0-100）
     * @param lightnessAdjust 亮度调整（-100到+100）
     * @return 着色后的图像
     */

    private static final Logger logger = LoggerFactory.getLogger(HSLTextureColorizer.class);
    
    public static BufferedImage colorize(BufferedImage texture, float hue, float saturation, float lightnessAdjust) {
        logger.debug("开始处理纹理着色: 尺寸={}x{}, 色相={}, 饱和度={}, 亮度调整={}", 
            texture.getWidth(), texture.getHeight(), hue, saturation, lightnessAdjust);

        long startTime = System.currentTimeMillis();
        BufferedImage result = new BufferedImage(
            texture.getWidth(), texture.getHeight(), BufferedImage.TYPE_INT_ARGB
        );

        try {
            for (int y = 0; y < texture.getHeight(); y++) {
                for (int x = 0; x < texture.getWidth(); x++) {
                    int rgb = texture.getRGB(x, y);
                    Color color = new Color(rgb);

                    float[] hsl = ColorSpaceConverter.rgbToHsl(
                        color.getRed(), color.getGreen(), color.getBlue()
                    );

                    // 记录异常值（用于调试）
                    if (hsl[0] < 0 || hsl[0] > 360) {
                        logger.warn("异常色相值: {} 在位置 ({}, {})", hsl[0], x, y);
                    }

                    hsl[0] = hue;
                    hsl[1] = saturation / 100f;
                    hsl[2] = (hsl[2] * (1 + lightnessAdjust / 100f));
                    hsl[2] = Math.max(0, Math.min(1, hsl[2]));

                    Color newColor = ColorSpaceConverter.hslToRgb(hsl[0], hsl[1], hsl[2]);
                    result.setRGB(x, y, newColor.getRGB());
                }
            }

            long duration = System.currentTimeMillis() - startTime;
            logger.info("纹理着色完成: 耗时{}ms, 处理{}个像素", 
                duration, texture.getWidth() * texture.getHeight());
            
        } catch (Exception e) {
            logger.error("纹理着色过程中发生错误", e);
            throw e;
        }

        return result;
    }

}