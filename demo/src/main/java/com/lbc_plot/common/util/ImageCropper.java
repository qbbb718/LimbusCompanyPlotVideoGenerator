package com.lbc_plot.common.util;

import java.awt.image.BufferedImage;
import java.awt.Graphics2D;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 图片裁剪工具类
 * 用于去除图片边缘的透明区域
 */
public class ImageCropper {
    private static final Logger logger = LoggerFactory.getLogger(ImageCropper.class);

    /** 裁剪时向右下留出的边距，避免把内容裁得太紧（与旧实现一致）。 */
    private static final int MARGIN = 10;

    /**
     * 裁剪图片的透明区域
     * 保留左上角内容，去除右方和下方的透明区域
     *
     * <p>整幅像素一次取出后再扫描，并从下/从右往回找边界：旧实现逐像素 {@code getRGB} 扫满
     * 1920×1080 要 15ms 以上，而每张说话人名片渲染完都要扫一次。
     *
     * @param image 原始图片
     * @return 裁剪后的图片（全透明时原样返回）
     */
    public static BufferedImage cropTransparentAreas(BufferedImage image) {
        if (image == null) {
            logger.debug("输入图片为null，返回null");
            return null;
        }

        int width = image.getWidth();
        int height = image.getHeight();
        if (width <= 0 || height <= 0) {
            return image;
        }

        int[] pixels = image.getRGB(0, 0, width, height, null, 0, width);

        // 最下方的非透明行：从下往上一行行找，找到第一行即可停
        int bottommostY = -1;
        for (int y = height - 1; y >= 0; y--) {
            int rowStart = y * width;
            for (int x = 0; x < width; x++) {
                if ((pixels[rowStart + x] >>> 24) != 0) {
                    bottommostY = y;
                    break;
                }
            }
            if (bottommostY >= 0) {
                break;
            }
        }

        // 最右侧的非透明列：从右往左一列列找，找到第一列即可停
        int rightmostX = -1;
        for (int x = width - 1; x >= 0; x--) {
            for (int y = 0; y < height; y++) {
                if ((pixels[y * width + x] >>> 24) != 0) {
                    rightmostX = x;
                    break;
                }
            }
            if (rightmostX >= 0) {
                break;
            }
        }

        logger.debug("裁剪透明区域: 原始 {}x{}, 最右X={}, 最下Y={}", width, height, rightmostX, bottommostY);

        // 整个图片都是透明的（或只有左上角一个像素）：返回原始图片，与旧实现一致
        if (rightmostX <= 0 && bottommostY <= 0) {
            logger.debug("图片中没有有效内容，返回原始图片");
            return image;
        }

        int safeRight = Math.max(0, rightmostX);
        int safeBottom = Math.max(0, bottommostY);

        // 添加一些边距，避免裁剪太紧
        int cropWidth = Math.min(safeRight + MARGIN, width);
        int cropHeight = Math.min(safeBottom + MARGIN, height);

        // 创建裁剪后的图片
        BufferedImage cropped = new BufferedImage(cropWidth, cropHeight, image.getType());
        Graphics2D g2d = cropped.createGraphics();
        try {
            g2d.drawImage(image, 0, 0, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight, null);
        } finally {
            g2d.dispose();
        }

        return cropped;
    }
}
