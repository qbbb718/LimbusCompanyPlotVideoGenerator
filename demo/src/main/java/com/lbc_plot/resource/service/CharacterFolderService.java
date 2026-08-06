package com.lbc_plot.resource.service;

import com.lbc_plot.config.AppConfig;
import com.lbc_plot.resource.dao.CharacterDAO;

import org.jdbi.v3.core.Jdbi;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.File;

/**
 * 角色目录管理服务
 *
 * 重构说明：原先用拼音作为目录名，需要处理重名冲突、角色重命名时同步重命名目录。
 * 现改为直接用 characterId（全局唯一且不可变）作为目录名，
 * 无需冲突解决、无需重命名，逻辑大幅简化。
 *
 * folder_name 字段保留（向后兼容），值恒等于 characterId。
 */
@Service
public class CharacterFolderService {

    private static final Logger logger = LoggerFactory.getLogger(CharacterFolderService.class);

    @Autowired
    private AppConfig appConfig;

    @Autowired
    private Jdbi jdbi;

    /**
     * 给定角色 ID，返回该角色的目录名（即 characterId 本身）
     * 如果目录不存在则创建，并写 DB folder_name=characterId（保持兼容）
     *
     * @param characterId 角色ID（全局唯一，直接用作目录名）
     * @return 目录名（等于 characterId）
     */
    public String resolveOrCreateFolder(String characterId) {
        // 直接用 characterId 作为目录名
        File dir = getCharacterDir(characterId);
        if (!dir.exists()) {
            dir.mkdirs();
            logger.info("创建角色目录: {} (characterId: {})", dir.getAbsolutePath(), characterId);
        }

        // 写 DB folder_name=characterId（保持兼容，确保字段不为空）
        String existingFolder = jdbi.withExtension(CharacterDAO.class, dao -> dao.getFolderName(characterId));
        if (existingFolder == null || !existingFolder.equals(characterId)) {
            jdbi.useExtension(CharacterDAO.class, dao -> dao.updateFolderName(characterId, characterId));
            logger.info("角色 folder_name 已更新为 characterId: {}", characterId);
        }

        return characterId;
    }

    /**
     * 删除角色的目录（递归删除整个目录，包含立绘、缩略图、名片缓存）
     *
     * @param characterId 角色ID（即目录名）
     */
    public void deleteFolder(String characterId) {
        File dir = getCharacterDir(characterId);
        if (dir.exists()) {
            deleteDirectory(dir);
            logger.info("删除角色目录: {}", dir.getAbsolutePath());
        } else {
            logger.info("角色目录不存在，跳过: {}", dir.getAbsolutePath());
        }
    }

    /**
     * 获取角色目录的 File 对象
     *
     * @param folderName 目录名（现为 characterId）
     * @return File 对象
     */
    public File getCharacterDir(String folderName) {
        return new File(appConfig.getAssets().getCharacters(), folderName);
    }

    /**
     * 递归删除目录
     */
    private void deleteDirectory(File directory) {
        if (!directory.exists()) {
            return;
        }
        File[] files = directory.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isDirectory()) {
                    deleteDirectory(file);
                } else {
                    if (!file.delete()) {
                        logger.warn("删除文件失败: {}", file.getAbsolutePath());
                    }
                }
            }
        }
        if (!directory.delete()) {
            logger.warn("删除目录失败: {}", directory.getAbsolutePath());
        }
    }
}
