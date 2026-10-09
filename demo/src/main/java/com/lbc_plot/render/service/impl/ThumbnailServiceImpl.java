package com.lbc_plot.render.service.impl;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.List;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.lbc_plot.render.cache.ThumbnailCache;
import com.lbc_plot.render.service.ThumbnailService;
import com.lbc_plot.resource.model.Portrait;
import com.lbc_plot.resource.service.CharacterService;

// ThumbnailService.java
@Service
public class ThumbnailServiceImpl implements ThumbnailService {
    private static final Logger logger = LoggerFactory.getLogger(ThumbnailServiceImpl.class);

    private static final String THUMBNAIL_DIR = "thumbnails"; // 相对路径

    @Autowired
    private ThumbnailCache thumbnailCache;

    /**
     * 生成缩略图文件名（相对路径）
     * 格式: thumbnails/{portraitID}.png
     */
    public String generateThumbnailFileName(Portrait portrait) {
        // 使用UUID作为文件名，确保唯一性
        return THUMBNAIL_DIR + File.separator + portrait.getPortraitID() + ".png";
    }

    /**
     * 获取缩略图目录的绝对路径
     */
    public File getThumbnailDirectory() {
        File thumbnailDir = new File(THUMBNAIL_DIR);
        if (!thumbnailDir.exists()) {
            thumbnailDir.mkdirs(); // 自动创建目录
        }
        return thumbnailDir;
    }

    /**
     * 生成缩略图（完整实现）
     */
    public void generateThumbnail(Portrait portrait) {
        try {
            // 如果缓存存在，先尝试删除旧缓存
            if (thumbnailCache != null) {
                try {
                    thumbnailCache.delete(portrait);
                } catch (Exception ignored) {
                }
            }

            // 加载原始图像：优先判断是文件系统路径还是资源路径
            BufferedImage originalImage = null;
            try {
                String imagePath = portrait.getImagePath();
                if (imagePath == null) {
                    logger.error("portrait.imagePath 为空，无法生成缩略图");
                    return;
                }
                java.io.File imageFile = new java.io.File(imagePath);
                if (imageFile.isAbsolute() || imagePath.contains(java.io.File.separator)) {
                    // 统一读图入口：支持 WebP（ImageIO 不认，由 FFmpeg 兜底并保留 alpha）
                    originalImage = com.lbc_plot.common.util.io.ImageReader.readImageFile(imageFile);
                } else {
                    originalImage = com.lbc_plot.common.util.io.ImageReader.readCharacters(imagePath);
                }
            } catch (IOException e) {
                logger.error("无法加载图像: {}", portrait.getImagePath(), e);
                return;
            }

            if (originalImage == null) {
                logger.error("无法加载图像: {}", portrait.getImagePath());
                return;
            }

            // 计算裁剪区域
            int cropX = Math.max(0, Math.min(portrait.getFaceX() + portrait.getAdjX(),
                    originalImage.getWidth() - 1));
            int cropY = Math.max(0, Math.min(portrait.getFaceY() + portrait.getAdjY(),
                    originalImage.getHeight() - 1));
            int cropSize = Math.min(portrait.getLength(),
                    Math.min(originalImage.getWidth() - cropX, originalImage.getHeight() - cropY));

            if (cropSize <= 0) {
                logger.error("裁剪区域无效");
                return;
            }

            // 裁剪图像
            BufferedImage thumbnail = originalImage.getSubimage(cropX, cropY, cropSize, cropSize);

            // 将缩略图写入缓存并设置路径
            if (thumbnailCache != null) {
                try {
                    thumbnailCache.put(portrait, thumbnail);
                    portrait.setThumbnailPath(thumbnailCache.getRelativePath(portrait));
                } catch (Exception e) {
                    logger.warn("写入缩略图缓存失败，回退到直接写入文件: {}", e.getMessage());
                    String thumbnailRelativePath = generateThumbnailFileName(portrait);
                    File thumbnailFile = new File(thumbnailRelativePath);
                    ImageIO.write(thumbnail, "png", thumbnailFile);
                    portrait.setThumbnailPath(thumbnailRelativePath);
                }
            } else {
                String thumbnailRelativePath = generateThumbnailFileName(portrait);
                File thumbnailFile = new File(thumbnailRelativePath);
                ImageIO.write(thumbnail, "png", thumbnailFile);
                portrait.setThumbnailPath(thumbnailRelativePath);
            }

            logger.info("缩略图生成成功: {}", portrait.getThumbnailPath());

        } catch (IOException e) {
            logger.error("生成缩略图失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 删除旧的缩略图文件
     */
    private void deleteOldThumbnail(Portrait portrait) {
        if (portrait.getThumbnailPath() != null && !portrait.getThumbnailPath().isEmpty()) {
            try {
                if (thumbnailCache != null) {
                    thumbnailCache.deleteByPath(portrait.getThumbnailPath());
                    return;
                }
            } catch (Exception ignored) {
            }
            File oldThumbnail = new File(portrait.getThumbnailPath());
            if (oldThumbnail.exists() && !oldThumbnail.delete()) {
                logger.warn("无法删除旧缩略图: {}", portrait.getThumbnailPath());
            }
        }
    }

    // 在需要加载缩略图的地方
    public BufferedImage loadThumbnail(Portrait portrait) {
        if (portrait.getThumbnailPath() == null) {
            return null;
        }

        try {
            if (thumbnailCache != null && thumbnailCache.exists(portrait)) {
                File thumbnailFile = thumbnailCache.getFile(portrait);
                return ImageIO.read(thumbnailFile);
            } else if (thumbnailCache != null && portrait.getThumbnailPath() != null
                    && thumbnailCache.existsByPath(portrait.getThumbnailPath())) {
                File thumbnailFile = thumbnailCache.getFileByPath(portrait.getThumbnailPath());
                return ImageIO.read(thumbnailFile);
            } else {
                // 如果缩略图不存在，重新生成并读出
                generateThumbnail(portrait);
                File thumbnailFile = (thumbnailCache != null) ? thumbnailCache.getFile(portrait)
                        : new File(portrait.getThumbnailPath());
                if (thumbnailFile != null && thumbnailFile.exists()) {
                    return ImageIO.read(thumbnailFile);
                }
                return null;
            }
        } catch (IOException e) {
            logger.error("加载缩略图失败: {}", portrait.getThumbnailPath(), e);
            return null;
        }
    }

    @Override
    public void generateThumbnailsBatch(List<Portrait> portraits) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'generateThumbnailsBatch'");
    }

    @Override
    public BufferedImage loadThumbnailByPath(String thumbnailPath) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'loadThumbnailByPath'");
    }

    @Override
    public boolean deleteThumbnail(Portrait portrait) {
        try {
            if (thumbnailCache != null) {
                return thumbnailCache.delete(portrait);
            }
        } catch (Exception e) {
            logger.warn("通过缓存删除缩略图失败，尝试直接删除: {}", e.getMessage());
        }
        if (portrait.getThumbnailPath() != null && !portrait.getThumbnailPath().isEmpty()) {
            File oldThumbnail = new File(portrait.getThumbnailPath());
            if (oldThumbnail.exists() && !oldThumbnail.delete()) {
                logger.warn("无法删除缩略图: {}", portrait.getThumbnailPath());
                return false;
            }
        }
        return true;
    }

    @Override
    public boolean deleteThumbnailByPath(String thumbnailPath) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'deleteThumbnailByPath'");
    }

    @Override
    public boolean thumbnailExists(Portrait portrait) {
        if (thumbnailCache != null && thumbnailCache.exists(portrait))
            return true;
        if (portrait.getThumbnailPath() != null && !portrait.getThumbnailPath().isEmpty()) {
            File thumbnail = new File(portrait.getThumbnailPath());
            if (thumbnail.exists())
                return true;
        }
        return false;
    }

    @Override
    public boolean thumbnailExistsByPath(String thumbnailPath) {
        if (thumbnailCache != null && thumbnailCache.existsByPath(thumbnailPath))
            return true;
        File thumbnail = new File(thumbnailPath);
        return thumbnail.exists();
    }

    @Override
    public void updateThumbnailIfNeeded(Portrait portrait) {
        // 简单实现：如果缩略图不存在或校验失败则重建
        if (!thumbnailExists(portrait) || !validateThumbnail(portrait)) {
            generateThumbnail(portrait);
        }
    }

    @Override
    public int cleanupOrphanedThumbnails() {
        // 尝试通过缓存清理，如果缓存支持则委托
        try {
            if (thumbnailCache != null)
                return thumbnailCache.clear();
        } catch (Exception e) {
            logger.warn("清理缩略图缓存失败: {}", e.getMessage());
        }
        return 0;
    }

    @Override
    public File getThumbnailFile(Portrait portrait) {
        if (thumbnailCache != null)
            return thumbnailCache.getFile(portrait);
        if (portrait.getThumbnailPath() != null)
            return new File(portrait.getThumbnailPath());
        return null;
    }

    @Override
    public File getThumbnailFileByPath(String thumbnailPath) {
        if (thumbnailCache != null)
            return thumbnailCache.getFileByPath(thumbnailPath);
        return new File(thumbnailPath);
    }

    @Override
    public boolean validateThumbnail(Portrait portrait) {
        File f = getThumbnailFile(portrait);
        return f != null && f.exists() && f.length() > 0;
    }
}