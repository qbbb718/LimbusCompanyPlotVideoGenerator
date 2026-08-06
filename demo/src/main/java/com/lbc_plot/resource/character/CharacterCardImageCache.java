package com.lbc_plot.resource.character;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

import javax.imageio.ImageIO;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.lbc_plot.config.AppConfig;
import com.lbc_plot.render.engine.RenderOfImage;
import com.lbc_plot.render.video.CharacterRef;
import com.lbc_plot.resource.model.MyCharacter;

/**
 * 角色名片图片缓存工具类
 * 负责生成、缓存和管理角色名片图片
 *
 * 重构说明：目录名直接用 characterId（不再用拼音），
 * 名片缓存保存到 {characters}/{characterId}/{characterThumbnailsSubdir}/{characterId}.png，
 * 删除角色目录时会一并清理。
 */
@Component
public class CharacterCardImageCache {
    private static final Logger logger = Logger.getLogger(CharacterCardImageCache.class.getName());

    // 内存缓存（与磁盘路径解耦，按 characterId 索引，保留 static）
    private static final ConcurrentHashMap<String, BufferedImage> imageCache = new ConcurrentHashMap<>();

    @Autowired
    private AppConfig appConfig;

    /**
     * 获取角色名片图片
     * 优先从缓存读取，如果不存在则生成并缓存
     *
     * @param character 角色对象
     * @return 名片图片
     */
    public BufferedImage getCharacterCardImage(MyCharacter character) {
        if (character == null) {
            logger.warning("角色对象为null，无法获取名片图片");
            return null;
        }

        String characterId = character.getCharacterID();
        if (characterId == null || characterId.isEmpty()) {
            logger.warning("角色ID为空，无法获取名片图片");
            return null;
        }

        // 1. 先检查内存缓存
        BufferedImage cachedImage = imageCache.get(characterId);
        if (cachedImage != null) {
            logger.info("从内存缓存中获取名片图片，角色ID: " + characterId);
            return cachedImage;
        }

        // 2. 检查磁盘缓存
        File cacheFile = getCacheFile(characterId);
        if (cacheFile.exists()) {
            try {
                logger.info("从磁盘缓存中读取名片图片，角色ID: " + characterId + ", 文件路径: " + cacheFile.getAbsolutePath());
                BufferedImage image = ImageIO.read(cacheFile);
                if (image != null) {
                    imageCache.put(characterId, image);
                    logger.info("成功从磁盘缓存加载名片图片并加入内存缓存，角色ID: " + characterId);
                    return image;
                } else {
                    logger.warning("从磁盘缓存读取的名片图片为null，角色ID: " + characterId);
                }
            } catch (IOException e) {
                logger.warning("读取名片缓存文件失败: " + e.getMessage());
            }
        } else {
            logger.info("名片缓存文件不存在，角色ID: " + characterId + ", 文件路径: " + cacheFile.getAbsolutePath());
        }

        // 3. 生成新的名片图片
        logger.info("生成新的名片图片，角色ID: " + characterId);
        BufferedImage newImage = generateCharacterCardImage(character);
        if (newImage != null) {
            saveToCache(characterId, newImage);
            imageCache.put(characterId, newImage);
            logger.info("成功生成并缓存名片图片，角色ID: " + characterId);
        } else {
            logger.warning("生成名片图片失败，角色ID: " + characterId);
        }

        return newImage;
    }

    /**
     * 生成角色名片图片
     */
    private BufferedImage generateCharacterCardImage(MyCharacter character) {
        try {
            CharacterRef characterRef = new CharacterRef(
                    character.getCharacterID(),
                    character.getCharacterName(),
                    character.getHeight(),
                    character.getFaction(),
                    character.getColorBg(),
                    character.getColorText());

            return RenderOfImage.renderCharaNameUI(characterRef);
        } catch (Exception e) {
            logger.severe("生成名片图片失败: " + e.getMessage());
            return null;
        }
    }

    /**
     * 保存名片图片到磁盘缓存
     *
     * @param characterId 角色ID（即目录名）
     * @param image       名片图片
     */
    private void saveToCache(String characterId, BufferedImage image) {
        try {
            File cacheFile = getCacheFile(characterId);
            Path cacheDir = cacheFile.getParentFile().toPath();
            if (!Files.exists(cacheDir)) {
                Files.createDirectories(cacheDir);
            }
            ImageIO.write(image, "PNG", cacheFile);
            logger.info("名片图片已缓存: " + cacheFile.getAbsolutePath());
        } catch (IOException e) {
            logger.severe("保存名片缓存失败: " + e.getMessage());
        }
    }

    /**
     * 获取缓存文件路径
     * 动态计算：{characters}/{characterId}/{characterThumbnailsSubdir}/{characterId}.png
     *
     * @param characterId 角色ID（即目录名）
     * @return 缓存文件
     */
    private File getCacheFile(String characterId) {
        File dir = new File(
                new File(appConfig.getAssets().getCharacters(), characterId),
                appConfig.getAssets().getCharacterThumbnailsSubdir());
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return new File(dir, characterId + ".png");
    }

    /**
     * 清除指定角色的名片缓存（内存 + 磁盘）
     *
     * @param characterId 角色ID
     */
    public void clearCache(String characterId) {
        // 从内存缓存中移除
        imageCache.remove(characterId);

        // 删除磁盘缓存文件
        try {
            File cacheFile = getCacheFile(characterId);
            if (cacheFile.exists() && cacheFile.delete()) {
                logger.info("已删除名片缓存文件: " + cacheFile.getAbsolutePath());
            }
        } catch (Exception e) {
            logger.warning("清除名片磁盘缓存失败，角色ID: " + characterId + ", 错误: " + e.getMessage());
        }
    }

    /**
     * 清除所有名片缓存
     */
    public void clearAllCache() {
        // 清空内存缓存
        imageCache.clear();
        logger.info("已清空名片内存缓存");
        // 磁盘缓存随角色目录管理，不在此单独清理
    }

    /**
     * 获取名片图片的相对路径（用于前端访问）
     *
     * @param characterId 角色ID
     * @return 相对路径（URL 形式）
     */
    public String getCharacterCardImagePath(String characterId) {
        // 返回API路径，而不是文件系统路径
        return "/api/character-card/" + characterId;
    }
}
