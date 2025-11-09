package com.lbc_plot.util;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

import javax.imageio.ImageIO;

import org.springframework.stereotype.Component;

import com.lbc_plot.core.Composer.RenderOfImage;
import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.video.CharacterRef;
import com.lbc_plot.config.ProjectConfig;

/**
 * 角色名片图片缓存工具类
 * 负责生成、缓存和管理角色名片图片
 */
@Component
public class CharacterCardImageCache {
    private static final Logger logger = Logger.getLogger(CharacterCardImageCache.class.getName());

    // 缓存目录
    private static final String CACHE_DIR = "data/character_cards";

    // 内存缓存
    private static final ConcurrentHashMap<String, BufferedImage> imageCache = new ConcurrentHashMap<>();

    /**
     * 获取角色名片图片
     * 优先从缓存读取，如果不存在则生成并缓存
     * 
     * @param character 角色对象
     * @return 名片图片
     */
    public static BufferedImage getCharacterCardImage(MyCharacter character) {
        if (character == null) {
            return null;
        }

        String characterId = character.getCharacterID();
        if (characterId == null || characterId.isEmpty()) {
            return null;
        }

        // 1. 先检查内存缓存
        BufferedImage cachedImage = imageCache.get(characterId);
        if (cachedImage != null) {
            return cachedImage;
        }

        // 2. 检查磁盘缓存
        File cacheFile = getCacheFile(characterId);
        if (cacheFile.exists()) {
            try {
                BufferedImage image = ImageIO.read(cacheFile);
                if (image != null) {
                    // 加入内存缓存
                    imageCache.put(characterId, image);
                    return image;
                }
            } catch (IOException e) {
                logger.warning("读取名片缓存文件失败: " + e.getMessage());
            }
        }

        // 3. 生成新的名片图片
        BufferedImage newImage = generateCharacterCardImage(character);
        if (newImage != null) {
            // 保存到磁盘
            saveToCache(characterId, newImage);
            // 加入内存缓存
            imageCache.put(characterId, newImage);
        }

        return newImage;
    }

    /**
     * 生成角色名片图片
     * 
     * @param character 角色对象
     * @return 名片图片
     */
    private static BufferedImage generateCharacterCardImage(MyCharacter character) {
        try {
            // 转换为CharacterRef
            CharacterRef characterRef = new CharacterRef(
                character.getCharacterID(),
                character.getCharacterName(),
                character.getHeight(),
                character.getFaction(),
                character.getColorBg(),
                character.getColorText()
            );

            // 生成名片图片
            return RenderOfImage.renderCharaNameUI(characterRef);
        } catch (Exception e) {
            logger.severe("生成名片图片失败: " + e.getMessage());
            return null;
        }
    }

    /**
     * 保存名片图片到缓存
     * 
     * @param characterId 角色ID
     * @param image 名片图片
     */
    private static void saveToCache(String characterId, BufferedImage image) {
        try {
            // 确保缓存目录存在
            Path cacheDir = Paths.get(CACHE_DIR);
            if (!Files.exists(cacheDir)) {
                Files.createDirectories(cacheDir);
            }

            // 保存图片
            File cacheFile = getCacheFile(characterId);
            ImageIO.write(image, "PNG", cacheFile);
            logger.info("名片图片已缓存: " + cacheFile.getAbsolutePath());
        } catch (IOException e) {
            logger.severe("保存名片缓存失败: " + e.getMessage());
        }
    }

    /**
     * 获取缓存文件路径
     * 
     * @param characterId 角色ID
     * @return 缓存文件
     */
    private static File getCacheFile(String characterId) {
        return new File(CACHE_DIR, characterId + ".png");
    }

    /**
     * 清除指定角色的名片缓存
     * 
     * @param characterId 角色ID
     */
    public static void clearCache(String characterId) {
        // 从内存缓存中移除
        imageCache.remove(characterId);

        // 删除磁盘缓存文件
        File cacheFile = getCacheFile(characterId);
        if (cacheFile.exists() && cacheFile.delete()) {
            logger.info("已删除名片缓存文件: " + cacheFile.getAbsolutePath());
        }
    }

    /**
     * 清除所有名片缓存
     */
    public static void clearAllCache() {
        // 清空内存缓存
        imageCache.clear();

        // 删除磁盘缓存目录下的所有文件
        File cacheDir = new File(CACHE_DIR);
        if (cacheDir.exists() && cacheDir.isDirectory()) {
            File[] files = cacheDir.listFiles();
            if (files != null) {
                for (File file : files) {
                    if (file.delete()) {
                        logger.info("已删除名片缓存文件: " + file.getAbsolutePath());
                    }
                }
            }
        }
    }

    /**
     * 获取名片图片的相对路径（用于前端访问）
     * 
     * @param characterId 角色ID
     * @return 相对路径
     */
    public static String getCharacterCardImagePath(String characterId) {
        return "/" + CACHE_DIR + "/" + characterId + ".png";
    }
}
