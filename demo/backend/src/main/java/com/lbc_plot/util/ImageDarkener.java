package com.lbc_plot.util;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.awt.*;
import java.awt.image.BufferedImage;

/**
 * 图像压暗工具类
 * 在带透明度的图像上覆盖半透明黑色，实现压暗效果
 */
public class ImageDarkener {
    private static final Logger logger = LoggerFactory.getLogger(ImageDarkener.class);
    
    // 默认压暗颜色（半透明黑色）
    private static final Color DEFAULT_DARK_COLOR = new Color(0, 0, 0, 128); // 50%透明度黑色
    
    /**
     * 使用默认压暗颜色处理图像
     * @param image 原始图像（带透明度）
     * @return 压暗后的图像
     */
    public static BufferedImage darkenImage(BufferedImage image) {
        return darkenImage(image, DEFAULT_DARK_COLOR);
    }
    
    /**
     * 使用指定透明度压暗图像
     * @param image 原始图像（带透明度）
     * @param opacity 透明度（0.0-1.0，0为完全透明，1为完全不透明）
     * @return 压暗后的图像
     */
    public static BufferedImage darkenImage(BufferedImage image, float opacity) {
        int alpha = (int) (opacity * 255);
        alpha = Math.max(0, Math.min(255, alpha)); // 限制范围
        Color darkColor = new Color(0, 0, 0, alpha);
        return darkenImage(image, darkColor);
    }
    
    /**
     * 使用指定压暗颜色处理图像
     * @param image 原始图像（带透明度）
     * @param darkColor 压暗颜色（带透明度）
     * @return 压暗后的图像
     */
    public static BufferedImage darkenImage(BufferedImage image, Color darkColor) {
        long startTime = System.currentTimeMillis();
        
        logger.info("开始图像压暗处理: 图像尺寸={}x{}, 压暗颜色=RGBA({},{},{},{})", 
            image.getWidth(), image.getHeight(), 
            darkColor.getRed(), darkColor.getGreen(), darkColor.getBlue(), darkColor.getAlpha());

        // 验证输入参数
        if (image == null) {
            logger.error("图像不能为null");
            throw new IllegalArgumentException("图像不能为null");
        }

        if (darkColor == null) {
            logger.error("压暗颜色不能为null");
            throw new IllegalArgumentException("压暗颜色不能为null");
        }

        // 创建结果图像（保持相同的类型和透明度）
        BufferedImage result = new BufferedImage(
            image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_ARGB
        );

        int totalPixels = image.getWidth() * image.getHeight();
        int processedPixels = 0;
        long lastLogTime = startTime;

        // 提取压暗颜色的RGBA分量
        int darkR = darkColor.getRed();
        int darkG = darkColor.getGreen();
        int darkB = darkColor.getBlue();
        int darkA = darkColor.getAlpha();
        float darkAlphaFactor = darkA / 255.0f;

        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int originalRGB = image.getRGB(x, y);
                Color originalColor = new Color(originalRGB, true);
                
                // 获取原始颜色的RGBA分量
                int origR = originalColor.getRed();
                int origG = originalColor.getGreen();
                int origB = originalColor.getBlue();
                int origA = originalColor.getAlpha();
                
                // 计算压暗后的颜色
                Color darkenedColor = applyDarkening(origR, origG, origB, origA, darkR, darkG, darkB, darkAlphaFactor);
                
                result.setRGB(x, y, darkenedColor.getRGB());
                
                processedPixels++;
                
                // 进度日志（每10%或5秒）
                if (processedPixels % (totalPixels / 10) == 0 || 
                    System.currentTimeMillis() - lastLogTime > 5000) {
                    float progress = (float) processedPixels / totalPixels * 100;
                    logger.debug("处理进度: {:.1f}%", progress);
                    lastLogTime = System.currentTimeMillis();
                }
            }
        }

        long duration = System.currentTimeMillis() - startTime;
        logger.info("图像压暗完成: 耗时{}ms, 处理{}个像素", duration, totalPixels);

        return result;
    }
    
    /**
     * 应用压暗效果到单个像素
     */
    private static Color applyDarkening(int origR, int origG, int origB, int origA, 
                                      int darkR, int darkG, int darkB, float darkAlphaFactor) {
        // 计算压暗颜色的混合权重
        float blendWeight = darkAlphaFactor;
        
        // 混合原始颜色和压暗颜色
        int blendedR = (int) (origR * (1 - blendWeight) + darkR * blendWeight);
        int blendedG = (int) (origG * (1 - blendWeight) + darkG * blendWeight);
        int blendedB = (int) (origB * (1 - blendWeight) + darkB * blendWeight);
        
        // 保持原始透明度（压暗操作不应该改变图像本身的透明度）
        int finalA = origA;
        
        // 限制颜色范围
        blendedR = Math.max(0, Math.min(255, blendedR));
        blendedG = Math.max(0, Math.min(255, blendedG));
        blendedB = Math.max(0, Math.min(255, blendedB));
        
        return new Color(blendedR, blendedG, blendedB, finalA);
    }
    
    /**
     * 使用Graphics2D合成模式压暗（性能更好，但可能不如逐像素精确）
     */
    public static BufferedImage darkenImageFast(BufferedImage image, Color darkColor) {
        logger.info("开始快速图像压暗处理");
        
        BufferedImage result = new BufferedImage(
            image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_ARGB
        );
        
        Graphics2D g2d = result.createGraphics();
        try {
            // 开启抗锯齿
            g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            
            // 先绘制原始图像
            g2d.drawImage(image, 0, 0, null);
            
            // 设置混合模式（SRC_OVER表示覆盖）
            g2d.setComposite(AlphaComposite.SrcOver);
            
            // 绘制半透明黑色覆盖层
            g2d.setColor(darkColor);
            g2d.fillRect(0, 0, image.getWidth(), image.getHeight());
            
        } finally {
            g2d.dispose();
        }
        
        logger.info("快速图像压暗完成");
        return result;
    }
    
    /**
     * 便捷方法：使用十六进制颜色和透明度
     */
    public static BufferedImage darkenImage(BufferedImage image, String hexColor, float opacity) {
        Color color = TextureColorizer.hexToColor(hexColor);
        int alpha = (int) (opacity * 255);
        Color darkColor = new Color(color.getRed(), color.getGreen(), color.getBlue(), alpha);
        return darkenImage(image, darkColor);
    }
    
    /**
     * 批量压暗图像（用于性能测试）
     */
    public static void batchDarkenImages(BufferedImage[] images, Color darkColor) {
        logger.info("开始批量压暗{}张图像", images.length);
        
        long totalStartTime = System.currentTimeMillis();
        int totalPixels = 0;
        
        for (int i = 0; i < images.length; i++) {
            long imageStartTime = System.currentTimeMillis();
            BufferedImage image = images[i];
            
            logger.debug("处理第{}张图像: {}x{}", i + 1, image.getWidth(), image.getHeight());
            
            BufferedImage darkened = darkenImage(image, darkColor);
            images[i] = darkened; // 替换原图像
            
            long imageDuration = System.currentTimeMillis() - imageStartTime;
            totalPixels += image.getWidth() * image.getHeight();
            
            logger.debug("第{}张图像处理完成: 耗时{}ms", i + 1, imageDuration);
        }
        
        long totalDuration = System.currentTimeMillis() - totalStartTime;
        logger.info("批量压暗完成: 总耗时{}ms, 总像素{}, 平均{:.2f}像素/ms", 
            totalDuration, totalPixels, (float) totalPixels / Math.max(1, totalDuration));
    }
}