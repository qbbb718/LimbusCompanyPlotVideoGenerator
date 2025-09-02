package com.lbc_plot.project.tool;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;

/**
 * 图片读取工具类
 * 提供从文件系统读取图片的功能
 */
public class ImageReader {

    /**
     * 读取图片文件到BufferedImage
     * @param filePath 图片文件路径
     * @return 读取到的BufferedImage对象
     * @throws IOException 当文件不存在或读取失败时抛出
     */
    public static BufferedImage readImage(String filePath) throws IOException {
        File file = new File(filePath);
        if (!file.exists()) {
            throw new IOException("文件不存在: " + filePath);
        }
        if (!file.isFile()) {
            throw new IOException("路径不是文件: " + filePath);
        }
        return ImageIO.read(file);
    }

    /**
     * 读取图片文件到BufferedImage（带格式验证）
     * @param filePath 图片文件路径
     * @param allowedFormats 允许的图片格式（如 "png", "jpg", "jpeg"）
     * @return 读取到的BufferedImage对象
     * @throws IOException 当文件格式不支持或读取失败时抛出
     */
    public static BufferedImage readImage(String filePath, String[] allowedFormats) throws IOException {
        File file = new File(filePath);
        String fileName = file.getName().toLowerCase();
        
        // 检查文件格式
        boolean formatValid = false;
        for (String format : allowedFormats) {
            if (fileName.endsWith("." + format.toLowerCase())) {
                formatValid = true;
                break;
            }
        }
        
        if (!formatValid) {
            throw new IOException("不支持的图片格式: " + fileName + "，支持的格式: " + 
                String.join(", ", allowedFormats));
        }
        
        return readImage(filePath);
    }

    /**
     * 安全读取图片，如果文件不存在返回null
     * @param filePath 图片文件路径
     * @return BufferedImage对象，如果文件不存在返回null
     */
    public static BufferedImage readImageSafe(String filePath) {
        try {
            return readImage(filePath);
        } catch (IOException e) {
            return null;
        }
    }
}