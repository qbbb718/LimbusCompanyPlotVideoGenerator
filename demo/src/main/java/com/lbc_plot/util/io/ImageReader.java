package com.lbc_plot.util.io;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;

/**
 * 图片读取工具类
 * 提供从文件系统读取图片的功能
 * 
 * 示例
 * BufferedImage image1 = ImageReader.readResourceImage("assets/ui/name_tag.png");
 * BufferedImage image3 = ImageReader.readFileImage("demo/src/main/resources/assets/ui/image.png");
 */
public class ImageReader {



    /**
     * 从resources目录读取图片（推荐方式）
     * @param resourcePath 相对于resources目录的路径
     * @return BufferedImage对象
     * @throws IOException 当读取失败时抛出
     */
    public static BufferedImage readResourceImage(String resourcePath) throws IOException {
        ClassLoader classLoader = ImageReader.class.getClassLoader();
        InputStream inputStream = classLoader.getResourceAsStream(resourcePath);
        
        if (inputStream == null) {
            throw new IOException("资源文件不存在: " + resourcePath);
        }
        
        try {
            return ImageIO.read(inputStream);
        } finally {
            inputStream.close();
        }
    }

    public static BufferedImage readBackGround(String fileName) throws IOException {
        return readResourceImage("assets/backgrounds/" + fileName);
    }

    public static BufferedImage readCharacters(String fileName) throws IOException {
        return readResourceImage("assets/characters/" + fileName);
    }

    public static BufferedImage readEffects(String fileName) throws IOException {
        return readResourceImage("assets/effects/" + fileName);
    }

    public static BufferedImage readUI(String fileName) throws IOException {
        return readResourceImage("assets/ui/" + fileName);
    }

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