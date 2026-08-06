package com.lbc_plot.common.util;

import java.awt.image.BufferedImage;
import java.awt.Rectangle;
import java.awt.Graphics2D;
import java.awt.image.Raster;
import java.awt.Point;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 图片裁剪工具类
 * 用于去除图片边缘的透明区域
 */
public class ImageCropper {
    private static final Logger logger = LoggerFactory.getLogger(ImageCropper.class);

    /**
     * 裁剪图片的透明区域
     * 保留左上角内容，去除右方和下方的透明区域
     * 
     * @param image 原始图片
     * @return 裁剪后的图片
     */
    public static BufferedImage cropTransparentAreas(BufferedImage image) {
        if (image == null) {
            logger.debug("输入图片为null，返回null");
            return null;
        }

        int width = image.getWidth();
        int height = image.getHeight();
        logger.debug("开始裁剪透明区域，原始图片尺寸: {}x{}", width, height);

        // 查找最右侧的非透明像素
        int rightmostX = 0;
        // 查找最下方的非透明像素
        int bottommostY = 0;

        // 遍历所有像素，找到右下边界
        int opaquePixels = 0;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                // 检查像素是否不透明
                if (isPixelOpaque(image, x, y)) {
                    opaquePixels++;
                    if (x > rightmostX) {
                        rightmostX = x;
                    }
                    if (y > bottommostY) {
                        bottommostY = y;
                    }
                }
            }
        }

        logger.debug("找到的不透明像素数: {}, 最右X: {}, 最下Y: {}", opaquePixels, rightmostX, bottommostY);

        // 如果整个图片都是透明的，返回原始图片
        if (rightmostX == 0 && bottommostY == 0) {
            logger.debug("图片中没有不透明像素，返回原始图片");
            return image;
        }

        // 添加一些边距，避免裁剪太紧
        int margin = 10;
        int cropWidth = rightmostX + margin;
        int cropHeight = bottommostY + margin;

        // 确保不超出原始图片尺寸
        cropWidth = Math.min(cropWidth, width);
        cropHeight = Math.min(cropHeight, height);

        logger.debug("裁剪区域: {}x{} (原始: {}x{})", cropWidth, cropHeight, width, height);

        // 创建裁剪后的图片
        BufferedImage cropped = new BufferedImage(cropWidth, cropHeight, image.getType());
        Graphics2D g2d = cropped.createGraphics();
        g2d.drawImage(image, 0, 0, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight, null);
        g2d.dispose();

        return cropped;
    }

    /**
     * 检查像素是否不透明
     * 
     * @param image 图片
     * @param x     x坐标
     * @param y     y坐标
     * @return 如果像素不透明返回true
     */
    private static boolean isPixelOpaque(BufferedImage image, int x, int y) {
        if (x < 0 || y < 0 || x >= image.getWidth() || y >= image.getHeight()) {
            return false;
        }

        // 获取像素的alpha值
        int pixel = image.getRGB(x, y);
        int alpha = (pixel >> 24) & 0xff;

        // 如果alpha值大于0，认为是不透明的
        return alpha > 0;
    }
}
