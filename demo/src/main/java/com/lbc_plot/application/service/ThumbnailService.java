package com.lbc_plot.application.service;

import java.awt.image.BufferedImage;
import java.io.File;
import java.util.List;

import com.lbc_plot.model.storage.Portrait;

/**
 * 缩略图服务接口
 * 负责立绘缩略图的生成、加载和管理
 */
public interface ThumbnailService {
    
    /**
     * 生成缩略图文件名（相对路径）
     * @param portrait 立绘对象
     * @return 缩略图相对路径，格式: thumbnails/{portraitID}.png
     */
    String generateThumbnailFileName(Portrait portrait);
    
    /**
     * 获取缩略图目录
     * @return 缩略图目录File对象，如果目录不存在会自动创建
     */
    File getThumbnailDirectory();
    
    /**
     * 生成缩略图
     * @param portrait 立绘对象，生成后会更新其thumbnailPath属性
     */
    void generateThumbnail(Portrait portrait);
    
    /**
     * 批量生成缩略图
     * @param portraits 立绘对象列表
     */
    void generateThumbnailsBatch(List<Portrait> portraits);
    
    /**
     * 加载缩略图
     * @param portrait 立绘对象
     * @return 缩略图BufferedImage，如果不存在会自动生成
     */
    BufferedImage loadThumbnail(Portrait portrait);
    
    /**
     * 直接加载缩略图（通过路径）
     * @param thumbnailPath 缩略图路径
     * @return 缩略图BufferedImage，如果不存在返回null
     */
    BufferedImage loadThumbnailByPath(String thumbnailPath);
    
    /**
     * 删除缩略图文件
     * @param portrait 立绘对象
     * @return 是否删除成功
     */
    boolean deleteThumbnail(Portrait portrait);
    
    /**
     * 通过路径删除缩略图文件
     * @param thumbnailPath 缩略图路径
     * @return 是否删除成功
     */
    boolean deleteThumbnailByPath(String thumbnailPath);
    
    /**
     * 检查缩略图是否存在
     * @param portrait 立绘对象
     * @return 缩略图是否存在
     */
    boolean thumbnailExists(Portrait portrait);
    
    /**
     * 通过路径检查缩略图是否存在
     * @param thumbnailPath 缩略图路径
     * @return 缩略图是否存在
     */
    boolean thumbnailExistsByPath(String thumbnailPath);
    
    /**
     * 更新缩略图（如果立绘参数发生变化）
     * @param portrait 立绘对象
     */
    void updateThumbnailIfNeeded(Portrait portrait);
    
    /**
     * 清理无效的缩略图文件
     * @return 删除的文件数量
     */
    int cleanupOrphanedThumbnails();
    
    /**
     * 获取缩略图文件
     * @param portrait 立绘对象
     * @return 缩略图File对象
     */
    File getThumbnailFile(Portrait portrait);
    
    /**
     * 通过路径获取缩略图文件
     * @param thumbnailPath 缩略图路径
     * @return 缩略图File对象
     */
    File getThumbnailFileByPath(String thumbnailPath);
    
    /**
     * 验证缩略图文件是否有效
     * @param portrait 立绘对象
     * @return 缩略图文件是否有效且可读
     */
    boolean validateThumbnail(Portrait portrait);
}