package com.lbc_plot.core.service.impl;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.List;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.core.service.CharacterService;
import com.lbc_plot.core.service.ThumbnailService;
import com.lbc_plot.model.storage.Portrait;

// ThumbnailService.java
public class ThumbnailServiceImpl implements ThumbnailService {
    private static final Logger logger = LoggerFactory.getLogger(ThumbnailServiceImpl.class);

    private static final String THUMBNAIL_DIR = "thumbnails"; // 相对路径
    
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
            // 删除旧的缩略图文件
            deleteOldThumbnail(portrait);
            
            // 确保缩略图目录存在
            getThumbnailDirectory();
            
            // 加载原始图像（使用相对路径）
            File imageFile = new File(portrait.getImagePath());
            BufferedImage originalImage = ImageIO.read(imageFile);
            
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
            
            // 生成相对路径的文件名
            String thumbnailRelativePath = generateThumbnailFileName(portrait);
            File thumbnailFile = new File(thumbnailRelativePath);
            
            // 保存缩略图
            ImageIO.write(thumbnail, "png", thumbnailFile);
            
            // 更新立绘的缩略图路径（存储相对路径）
            portrait.setThumbnailPath(thumbnailRelativePath);
            
            logger.info("缩略图生成成功: {}", thumbnailRelativePath);
            
        } catch (IOException e) {
            logger.error("生成缩略图失败: {}", e.getMessage(), e);
        }
    }
    
    /**
     * 删除旧的缩略图文件
     */
    private void deleteOldThumbnail(Portrait portrait) {
        if (portrait.getThumbnailPath() != null && !portrait.getThumbnailPath().isEmpty()) {
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
            // 相对路径会自动相对于当前工作目录解析
            File thumbnailFile = new File(portrait.getThumbnailPath());
            if (thumbnailFile.exists()) {
                return ImageIO.read(thumbnailFile);
            } else {
                // 如果缩略图不存在，重新生成
                generateThumbnail(portrait);
                return ImageIO.read(thumbnailFile);
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
        if (portrait.getThumbnailPath() != null && !portrait.getThumbnailPath().isEmpty()) {
            File thumbnail = new File(portrait.getThumbnailPath());
            if (thumbnail.exists() ) {
                return true;
            }
        }
        return false;
    }

    @Override
    public boolean thumbnailExistsByPath(String thumbnailPath) {
        File thumbnail = new File(thumbnailPath);
        if (thumbnail.exists() ) {
            return true;
        }
        return false;
    }

    @Override
    public void updateThumbnailIfNeeded(Portrait portrait) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'updateThumbnailIfNeeded'");
    }

    @Override
    public int cleanupOrphanedThumbnails() {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'cleanupOrphanedThumbnails'");
    }

    @Override
    public File getThumbnailFile(Portrait portrait) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'getThumbnailFile'");
    }

    @Override
    public File getThumbnailFileByPath(String thumbnailPath) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'getThumbnailFileByPath'");
    }

    @Override
    public boolean validateThumbnail(Portrait portrait) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'validateThumbnail'");
    }
}