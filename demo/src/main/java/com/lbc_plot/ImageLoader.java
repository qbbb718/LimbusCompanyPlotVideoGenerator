package com.lbc_plot;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.net.URL;

public class ImageLoader {
    public static BufferedImage loadImage(String classpathPath) {
        try {
            URL resUrl = ImageLoader.class.getResource(classpathPath);
            if (resUrl == null) {
                throw new RuntimeException("资源未找到: " + classpathPath);
            }
            return ImageIO.read(resUrl);
        } catch (Exception e) {
            throw new RuntimeException("加载图片失败: " + classpathPath, e);
        }
    }

    public static void main(String[] args) {
        // 使用示例（注意开头的/表示从类路径根开始）
        BufferedImage image = loadImage("/assets/backgrounds/test_bg.png");
        System.out.println("图片尺寸: " + image.getWidth() + "x" + image.getHeight());
    }
}