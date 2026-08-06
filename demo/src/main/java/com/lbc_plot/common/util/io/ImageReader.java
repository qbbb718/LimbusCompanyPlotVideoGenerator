package com.lbc_plot.common.util.io;

import com.lbc_plot.config.ProjectConfig;

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
 * BufferedImage image1 =
 * ImageReader.readResourceImage("assets/ui/name_tag.png");
 * BufferedImage image3 =
 * ImageReader.readFileImage("demo/src/main/resources/assets/ui/image.png");
 */
public class ImageReader {

    /**
     * 从resources目录读取图片（推荐方式）
     * 
     * @param resourcePath 相对于resources目录的路径
     * @return BufferedImage对象
     * @throws IOException 当读取失败时抛出
     */
    public static BufferedImage readResourceImage(String resourcePath) throws IOException {
        // 如果传入的是绝对路径（例如 Windows 下的 C:\... 或以 / 开头的绝对路径），
        // 则直接从文件系统读取，而不是从 classpath 资源中查找。
        File maybeFile = new File(resourcePath);
        if (maybeFile.isAbsolute()) {
            if (!maybeFile.exists() || !maybeFile.isFile()) {
                throw new IOException("文件不存在: " + resourcePath);
            }
            return ImageIO.read(maybeFile);
        }

        // 先尝试从 classpath 查找资源
        ClassLoader classLoader = ImageReader.class.getClassLoader();
        InputStream inputStream = classLoader.getResourceAsStream(resourcePath);

        if (inputStream != null) {
            try {
                return ImageIO.read(inputStream);
            } finally {
                inputStream.close();
            }
        }

        // classpath 找不到时，回退到文件系统相对路径（相对于 JVM 工作目录，
        // 即 mvn spring-boot:run 启动时的 demo 目录）。
        // 修复场景：border_1080p.png 等资源存在于 demo/assets/ui/ 下，但未打进
        // classpath（src/main/resources/assets/ui/ 不存在），导致 RenderOfImage
        // 静态块加载失败、后续名片图片生成 NPE。
        if (maybeFile.exists() && maybeFile.isFile()) {
            return ImageIO.read(maybeFile);
        }

        throw new IOException("资源文件不存在: " + resourcePath
                + "（已尝试 classpath 与文件系统相对路径 " + maybeFile.getAbsolutePath() + "）");
    }

    public static BufferedImage readBackGround(String fileName) throws IOException {
        String resourcePath = ProjectConfig.BACKGROUNDS_PATH + fileName;
        try {
            return readResourceImage(resourcePath);
        } catch (IOException e) {
            // 回退到文件系统候选路径查找
            String[] candidates = new String[] {
                    ProjectConfig.BACKGROUNDS_PATH + fileName,
                    ProjectConfig.ASSETS_BASE_PATH + "backgrounds/" + fileName,
                    fileName
            };
            for (String c : candidates) {
                File f = new File(c);
                if (f.exists() && f.isFile()) {
                    return ImageIO.read(f);
                }
            }
            throw new IOException("背景图片未找到: " + fileName + " (尝试路径: " + String.join(", ", candidates) + ")", e);
        }
    }

    public static BufferedImage readCharacters(String fileName) throws IOException {
        File f = new File(fileName);
        if (f.isAbsolute()) {
            if (!f.exists() || !f.isFile()) {
                throw new IOException("文件不存在: " + fileName);
            }
            return ImageIO.read(f);
        }

        String resourcePath = ProjectConfig.CHARACTERS_PATH + fileName;
        try {
            return readResourceImage(resourcePath);
        } catch (IOException e) {
            String[] candidates = new String[] {
                    ProjectConfig.CHARACTERS_PATH + fileName,
                    ProjectConfig.ASSETS_BASE_PATH + "characters/" + fileName,
                    fileName
            };
            for (String c : candidates) {
                File cf = new File(c);
                if (cf.exists() && cf.isFile()) {
                    return ImageIO.read(cf);
                }
            }
            throw new IOException("人物图片未找到: " + fileName + " (尝试路径: " + String.join(", ", candidates) + ")", e);
        }
    }

    public static BufferedImage readEffects(String fileName) throws IOException {
        return readResourceImage(ProjectConfig.EFFECTS_PATH + fileName);
    }

    public static BufferedImage readUI(String fileName) throws IOException {
        return readResourceImage(ProjectConfig.UI_PATH + fileName);
    }

    /**
     * 读取图片文件到BufferedImage
     * 
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
     * 
     * @param filePath       图片文件路径
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
     * 
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