package com.lbc_plot.resource.controller;

import java.util.List;
import java.util.logging.Logger;
import java.io.File;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.resource.character.CharacterCardImageCache;
import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.dao.PortraitDAO;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;
import com.lbc_plot.resource.service.StorageService;

import org.jdbi.v3.core.Jdbi;
import org.springframework.web.multipart.MultipartFile;

/**
 * 立绘控制器
 */
@RestController
@RequestMapping("/api")
public class PortraitController {

    private static final Logger logger = Logger.getLogger(PortraitController.class.getName());

    @Autowired
    private Jdbi jdbi;

    @Autowired
    private StorageService storageService;

    @Autowired
    private com.lbc_plot.resource.character.CharacterCardImageCache characterCardImageCache;

    /**
     * 上传立绘图片文件
     * 接收 multipart 文件 + portraitId + emotion 字段，返回保存后的相对路径
     * 文件以 {portraitId}.{ext} 命名，保存到 {characterId}/ 目录下
     *
     * @param characterId 角色ID（直接用作目录名）
     * @param portraitId  立绘ID（直接用作文件名）
     * @param file        图片文件
     * @param emotion     情绪（如 "happy"、"sad"），仅记录用
     * @return 上传结果，包含 imagePath
     */
    @PostMapping("/characters/{characterId}/portraits/upload")
    public StorageService.PortraitUploadResult uploadPortraitFile(
            @PathVariable String characterId,
            @RequestParam("file") MultipartFile file,
            @RequestParam("portraitId") String portraitId,
            @RequestParam("emotion") String emotion) {
        try {
            logger.info("上传立绘文件，角色ID: " + characterId + ", 立绘ID: " + portraitId +
                    ", 情绪: " + emotion + ", 文件: " + file.getOriginalFilename());
            return storageService.uploadPortraitFile(file, characterId, portraitId, emotion);
        } catch (Exception e) {
            logger.severe("上传立绘文件失败: " + e.getMessage());
            throw new RuntimeException("上传立绘文件失败: " + e.getMessage());
        }
    }

    /**
     * 上传立绘缩略图文件
     * 接收前端裁剪后的缩略图，保存到角色拼音目录下的 thumbnails 子目录，
     * 返回访问 URL 路径（供前端 <img src> 使用，并存入 DB portrait.thumbnail_path）。
     *
     * 路径由后端 config 集中管理（appConfig.assets.characterThumbnailsSubdir），
     * 删除角色目录时缩略图会一并清理。
     *
     * @param characterId 角色ID
     * @param portraitId  立绘ID
     * @param file        缩略图文件
     * @return 缩略图访问 URL 路径
     */
    @PostMapping("/characters/{characterId}/portraits/{portraitId}/thumbnail")
    public String uploadPortraitThumbnail(
            @PathVariable String characterId,
            @PathVariable String portraitId,
            @RequestParam("file") MultipartFile file) {
        try {
            logger.info("上传立绘缩略图，角色ID: " + characterId + ", 立绘ID: " + portraitId +
                    ", 文件: " + file.getOriginalFilename());
            String urlPath = storageService.uploadPortraitThumbnail(file, characterId, portraitId);
            logger.info("立绘缩略图上传成功，URL: " + urlPath);
            return urlPath;
        } catch (Exception e) {
            logger.severe("上传立绘缩略图失败: " + e.getMessage());
            throw new RuntimeException("上传立绘缩略图失败: " + e.getMessage());
        }
    }

    /**
     * 添加立绘
     */
    @PostMapping("/characters/{characterId}/portraits")
    public Portrait addPortrait(@PathVariable String characterId, @RequestBody Portrait portrait) {
        try {
            logger.info("为角色添加立绘，角色ID: " + characterId + ", 立绘名称: " + portrait.getPortName());

            // 确保立绘ID存在
            if (portrait.getPortraitID() == null || portrait.getPortraitID().isEmpty()) {
                portrait.setNewPortraitID();
                logger.info("生成新立绘ID: " + portrait.getPortraitID());
            }

            // 确保立绘属于当前角色
            portrait.setCharacterID(characterId);

            // 使用事务保存立绘
            jdbi.inTransaction(handle -> {
                PortraitDAO dao = handle.attach(PortraitDAO.class);
                dao.save(portrait);

                // 保存角色与立绘的关联关系，不设为默认立绘
                dao.saveCharacterPortrait(characterId, portrait.getPortraitID(), false, 0);

                return null;
            });

            logger.info("成功添加立绘: " + portrait.getPortName());

            return portrait;
        } catch (Exception e) {
            logger.severe("添加立绘失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("添加立绘失败: " + e.getMessage());
        }
    }

    /**
     * 更新立绘
     */
    @PutMapping("/characters/{characterId}/portraits/{portraitId}")
    public Portrait updatePortrait(
            @PathVariable String characterId,
            @PathVariable String portraitId,
            @RequestBody Portrait portrait) {
        try {
            logger.info("更新立绘，角色ID: " + characterId + ", 立绘ID: " + portraitId +
                    ", 立绘名称: " + portrait.getPortName());

            // 确保ID一致
            portrait.setPortraitID(portraitId);
            portrait.setCharacterID(characterId);

            // 使用事务更新立绘
            jdbi.inTransaction(handle -> {
                PortraitDAO dao = handle.attach(PortraitDAO.class);

                // 检查立绘是否存在
                Portrait existingPortrait = dao.findById(portraitId).orElse(null);
                if (existingPortrait == null) {
                    logger.warning("立绘不存在，ID: " + portraitId);
                    throw new RuntimeException("立绘不存在");
                }

                // 更新立绘信息
                dao.update(portrait);

                return null;
            });

            logger.info("成功更新立绘: " + portrait.getPortName());
            return portrait;
        } catch (Exception e) {
            logger.severe("更新立绘失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("更新立绘失败: " + e.getMessage());
        }
    }

    /**
     * 删除立绘
     */
    @DeleteMapping("/characters/{characterId}/portraits/{portraitId}")
    public void deletePortrait(
            @PathVariable String characterId,
            @PathVariable String portraitId,
            @RequestParam(required = false, defaultValue = "false") boolean deleteFiles) {
        try {
            logger.info("删除立绘，角色ID: " + characterId + ", 立绘ID: " + portraitId +
                    ", 删除文件: " + deleteFiles);

            // 获取立绘信息
            Portrait portrait = jdbi.withExtension(PortraitDAO.class, dao -> dao.findById(portraitId).orElse(null));

            if (portrait == null) {
                logger.warning("立绘不存在，ID: " + portraitId);
                return;
            }

            // 使用事务删除立绘
            jdbi.inTransaction(handle -> {
                PortraitDAO dao = handle.attach(PortraitDAO.class);

                // 删除角色与立绘的关联关系
                dao.deleteCharacterPortraits(characterId);

                // 删除立绘记录
                dao.delete(portraitId);

                return null;
            });

            // 如果需要删除文件
            if (deleteFiles && portrait != null) {
                // 删除立绘文件
                if (portrait.getImagePath() != null && !portrait.getImagePath().isEmpty()) {
                    File portraitFile = new File(portrait.getImagePath());
                    if (portraitFile.exists() && portraitFile.delete()) {
                        logger.info("已删除立绘文件: " + portraitFile.getAbsolutePath());
                    }
                }

                // 删除缩略图
                if (portrait.getThumbnailPath() != null && !portrait.getThumbnailPath().isEmpty()) {
                    File thumbnailFile = new File(portrait.getThumbnailPath());
                    if (thumbnailFile.exists() && thumbnailFile.delete()) {
                        logger.info("已删除缩略图文件: " + thumbnailFile.getAbsolutePath());
                    }
                }
            }

            logger.info("成功删除立绘，ID: " + portraitId);
        } catch (Exception e) {
            logger.severe("删除立绘失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("删除立绘失败: " + e.getMessage());
        }
    }

    /**
     * 设置默认立绘
     */
    @PutMapping("/characters/{characterId}/portraits/{portraitId}/default")
    public void setDefaultPortrait(
            @PathVariable String characterId,
            @PathVariable String portraitId) {
        try {
            logger.info("设置默认立绘，角色ID: " + characterId + ", 立绘ID: " + portraitId);

            // 使用事务更新默认立绘
            jdbi.inTransaction(handle -> {
                PortraitDAO dao = handle.attach(PortraitDAO.class);
                CharacterDAO characterDao = handle.attach(CharacterDAO.class);

                // 检查立绘是否存在
                Portrait portrait = dao.findById(portraitId).orElse(null);
                if (portrait == null) {
                    logger.warning("立绘不存在，ID: " + portraitId);
                    throw new RuntimeException("立绘不存在");
                }

                // 更新角色的默认立绘ID
                MyCharacter character = characterDao.findById(characterId).orElse(null);
                if (character == null) {
                    logger.warning("角色不存在，ID: " + characterId);
                    throw new RuntimeException("角色不存在");
                }

                // 更新角色的默认立绘
                // 使用character_portraits表来标记默认立绘
                dao.setDefaultPortrait(characterId, portraitId);

                // 重新生成名片图片
                try {
                    characterCardImageCache.clearCache(characterId);
                    characterCardImageCache.getCharacterCardImage(character);
                    logger.info("已重新生成名片图片");
                } catch (Exception e) {
                    logger.warning("生成名片图片失败: " + e.getMessage());
                }

                return null;
            });

            logger.info("成功设置默认立绘，角色ID: " + characterId + ", 立绘ID: " + portraitId);
        } catch (Exception e) {
            logger.severe("设置默认立绘失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("设置默认立绘失败: " + e.getMessage());
        }
    }
}
