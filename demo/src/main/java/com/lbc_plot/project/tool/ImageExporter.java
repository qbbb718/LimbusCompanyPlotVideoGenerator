package com.lbc_plot.project.tool;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;

/**
 * 图片导出工具类
 * 提供将BufferedImage导出为文件的功能
 */
public class ImageExporter {

    /**
     * 导出图片到指定路径
     * @param image 要导出的BufferedImage
     * @param filePath 目标文件路径（包含文件名和扩展名）
     * @throws IOException 当导出失败时抛出
     */
    public static void exportImage(BufferedImage image, String filePath) throws IOException {
        if (image == null) {
            throw new IllegalArgumentException("图片不能为null");
        }

        File outputFile = new File(filePath);
        
        // 确保目录存在
        File parentDir = outputFile.getParentFile();
        if (parentDir != null && !parentDir.exists()) {
            if (!parentDir.mkdirs()) {
                throw new IOException("无法创建目录: " + parentDir.getAbsolutePath());
            }
        }

        // 从文件路径提取格式
        String format = getFormatFromPath(filePath);
        if (format == null) {
            throw new IOException("无法从文件路径确定图片格式: " + filePath);
        }

        if (!ImageIO.write(image, format, outputFile)) {
            throw new IOException("不支持导出格式: " + format);
        }
    }

    /**
     * 导出图片到指定路径（带格式参数）
     * @param image 要导出的BufferedImage
     * @param filePath 目标文件路径
     * @param format 图片格式（如 "png", "jpg", "jpeg"）
     * @throws IOException 当导出失败时抛出
     */
    public static void exportImage(BufferedImage image, String filePath, String format) throws IOException {
        if (image == null) {
            throw new IllegalArgumentException("图片不能为null");
        }

        File outputFile = new File(filePath);
        
        // 确保目录存在
        File parentDir = outputFile.getParentFile();
        if (parentDir != null && !parentDir.exists()) {
            if (!parentDir.mkdirs()) {
                throw new IOException("无法创建目录: " + parentDir.getAbsolutePath());
            }
        }

        if (!ImageIO.write(image, format, outputFile)) {
            throw new IOException("不支持导出格式: " + format);
        }
    }

    /**
     * 安全导出图片，失败时返回false而不是抛出异常
     * @param image 要导出的BufferedImage
     * @param filePath 目标文件路径
     * @return 导出成功返回true，失败返回false
     */
    public static boolean exportImageSafe(BufferedImage image, String filePath) {
        try {
            exportImage(image, filePath);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * 从文件路径提取图片格式
     * @param filePath 文件路径
     * @return 格式字符串（如 "png"），如果无法确定返回null
     */
    private static String getFormatFromPath(String filePath) {
        if (filePath == null || filePath.lastIndexOf('.') == -1) {
            return null;
        }
        
        String extension = filePath.substring(filePath.lastIndexOf('.') + 1).toLowerCase();
        
        // 支持常见图片格式
        switch (extension) {
            case "png":
            case "jpg":
            case "jpeg":
            case "gif":
            case "bmp":
            case "webp":
                return extension;
            default:
                return null;
        }
    }
}