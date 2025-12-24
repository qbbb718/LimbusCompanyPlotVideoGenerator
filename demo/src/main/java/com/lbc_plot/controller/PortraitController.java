package com.lbc_plot.controller;

import java.util.List;
import java.util.logging.Logger;
import java.io.File;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.util.CharacterCardImageCache;
import org.jdbi.v3.core.Jdbi;

/**
 * 立绘控制器
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = { "http://localhost:3000", "http://127.0.0.1:3000" })
public class PortraitController {

    private static final Logger logger = Logger.getLogger(PortraitController.class.getName());

    // 资源文件夹路径
    private static final String PORTRAITS_DIR = "resources/portraits";

    @Autowired
    private Jdbi jdbi;

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

                // 保存角色与立绘的关联关系
                dao.saveCharacterPortrait(characterId, portrait.getPortraitID(), true, 0);

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
                    File portraitFile = new File(PORTRAITS_DIR, portrait.getImagePath());
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
                    CharacterCardImageCache.clearCache(characterId);
                    CharacterCardImageCache.getCharacterCardImage(character);
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
