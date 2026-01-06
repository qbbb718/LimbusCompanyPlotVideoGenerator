package com.lbc_plot.resource.service;

import com.lbc_plot.config.StorageConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import org.springframework.util.DigestUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * 存储服务类
 * 处理文件上传、存储和访问
 */
@Service
public class StorageService {

    private static final Logger logger = LoggerFactory.getLogger(StorageService.class);

    @Autowired
    private StorageConfig storageConfig;

    @Autowired
    private ResourceLoader resourceLoader;

    /**
     * 上传背景文件
     * 
     * @param file     上传的文件
     * @param fileName 可选的文件名，如果不提供则使用原文件名
     * @return 相对文件路径
     */
    public String uploadBackgroundFile(MultipartFile file, String fileName) throws IOException {
        // 验证文件
        validateFile(file);

        // 确保背景目录存在
        Path backgroundsDir = Paths.get(storageConfig.getBackgroundsDir());
        if (!Files.exists(backgroundsDir)) {
            Files.createDirectories(backgroundsDir);
            logger.info("创建背景目录: " + backgroundsDir.toAbsolutePath());
        }

        // 生成文件名
        String originalFilename = file.getOriginalFilename();
        String fileExtension = originalFilename.substring(originalFilename.lastIndexOf("."));

        String uniqueFilename;
        if (storageConfig.isEnableVersioning()) {
            // 使用文件内容的哈希值作为文件名的一部分
            String fileHash = calculateFileHash(file.getInputStream());
            uniqueFilename = fileHash + fileExtension;
        } else {
            // 使用UUID
            uniqueFilename = UUID.randomUUID().toString() + fileExtension;
        }

        // 如果提供了文件名，则使用它
        if (fileName != null && !fileName.trim().isEmpty()) {
            uniqueFilename = fileName + fileExtension;
        }

        Path filePath = backgroundsDir.resolve(uniqueFilename);

        // 保存文件
        Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);
        logger.info("背景文件已保存: " + filePath.toAbsolutePath());

        // 生成缩略图
        String thumbnailPath = null;
        if (storageConfig.isGenerateThumbnails()) {
            thumbnailPath = generateThumbnail(file, uniqueFilename);
        }

        // 返回相对路径
        return storageConfig.getBackgroundsDir() + "/" + uniqueFilename;
    }

    /**
     * 生成缩略图
     * 
     * @param file     原始文件
     * @param filename 文件名
     * @return 缩略图的相对路径
     */
    private String generateThumbnail(MultipartFile file, String filename) {
        try {
            // 确保缩略图目录存在
            Path thumbnailsDir = Paths.get(storageConfig.getThumbnailsDir());
            if (!Files.exists(thumbnailsDir)) {
                Files.createDirectories(thumbnailsDir);
                logger.info("创建缩略图目录: " + thumbnailsDir.toAbsolutePath());
            }

            // 读取原始图片
            BufferedImage originalImage = ImageIO.read(file.getInputStream());
            if (originalImage == null) {
                logger.warn("无法读取图片文件: " + filename);
                return null;
            }

            // 计算缩略图尺寸（保持宽高比）
            int originalWidth = originalImage.getWidth();
            int originalHeight = originalImage.getHeight();
            int thumbnailWidth = storageConfig.getThumbnailWidth();
            int thumbnailHeight = storageConfig.getThumbnailHeight();

            double widthRatio = (double) thumbnailWidth / originalWidth;
            double heightRatio = (double) thumbnailHeight / originalHeight;
            double ratio = Math.min(widthRatio, heightRatio);

            int newWidth = (int) (originalWidth * ratio);
            int newHeight = (int) (originalHeight * ratio);

            // 创建缩略图
            BufferedImage thumbnailImage = new BufferedImage(thumbnailWidth, thumbnailHeight,
                    BufferedImage.TYPE_INT_ARGB);
            Graphics2D g2d = thumbnailImage.createGraphics();

            // 设置高质量渲染参数
            g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            // 填充背景色（白色）
            g2d.setColor(Color.WHITE);
            g2d.fillRect(0, 0, thumbnailWidth, thumbnailHeight);

            // 居中绘制缩略图
            int x = (thumbnailWidth - newWidth) / 2;
            int y = (thumbnailHeight - newHeight) / 2;
            g2d.drawImage(originalImage, x, y, newWidth, newHeight, null);
            g2d.dispose();

            // 保存缩略图
            String fileExtension = filename.substring(filename.lastIndexOf(".") + 1);
            Path thumbnailPath = thumbnailsDir.resolve("thumb_" + filename);
            ImageIO.write(thumbnailImage, fileExtension, thumbnailPath.toFile());

            logger.info("缩略图已生成: " + thumbnailPath.toAbsolutePath());

            // 返回相对路径
            return storageConfig.getThumbnailsDir() + "/thumb_" + filename;
        } catch (IOException e) {
            logger.error("生成缩略图失败: " + e.getMessage(), e);
            return null;
        }
    }

    /**
     * 验证上传的文件
     * 
     * @param file 上传的文件
     */
    private void validateFile(MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("文件为空");
        }

        // 检查文件大小
        long fileSizeMB = file.getSize() / (1024 * 1024);
        if (fileSizeMB > storageConfig.getMaxFileSize()) {
            throw new IllegalArgumentException(
                    "文件大小超过限制: " + fileSizeMB + "MB > " + storageConfig.getMaxFileSize() + "MB");
        }

        // 检查文件格式
        String originalFilename = file.getOriginalFilename();
        String fileExtension = originalFilename.substring(originalFilename.lastIndexOf(".") + 1).toLowerCase();
        List<String> supportedFormats = Arrays.asList(storageConfig.getSupportedFormats().split(","));

        if (!supportedFormats.contains(fileExtension)) {
            throw new IllegalArgumentException("不支持的文件格式: " + fileExtension);
        }
    }

    /**
     * 计算文件内容的哈希值
     * 
     * @param inputStream 文件输入流
     * @return 文件哈希值
     */
    private String calculateFileHash(InputStream inputStream) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(DigestUtils.md5Digest(inputStream));

            // 转换为十六进制字符串
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }

            return sb.toString();
        } catch (NoSuchAlgorithmException | IOException e) {
            logger.error("计算文件哈希值失败: " + e.getMessage(), e);
            return UUID.randomUUID().toString();
        }
    }

    /**
     * 检查资源是否存在
     * 
     * @param resourcePath 资源路径
     * @return 资源是否存在
     */
    public boolean resourceExists(String resourcePath) {
        try {
            Resource resource = resourceLoader.getResource(resourcePath);
            return resource.exists();
        } catch (Exception e) {
            logger.warn("检查资源时出错: " + e.getMessage());
            return false;
        }
    }

    /**
     * 获取资源
     * 
     * @param resourcePath 资源路径
     * @return 资源对象
     */
    public Resource getResource(String resourcePath) {
        return resourceLoader.getResource(resourcePath);
    }
}
