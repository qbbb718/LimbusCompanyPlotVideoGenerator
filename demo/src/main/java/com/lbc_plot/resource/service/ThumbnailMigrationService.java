package com.lbc_plot.resource.service;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.logging.Logger;

import org.jdbi.v3.core.Jdbi;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import com.lbc_plot.config.AppConfig;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.dao.PortraitDAO;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

/**
 * 缩略图、角色名片图片、角色目录命名迁移服务
 *
 * 启动时执行一次，迁移顺序：
 * 1. migrateFoldersAndPortraitsToId()：拼音目录 → characterId 目录，立绘文件名 → portraitId
 * 2. migratePortraitThumbnails()：旧 {thumbnails}/thumbnail_{portraitId}.png →
 * {characterId}/thumbnails/
 * 3. migrateCharacterCardCaches()：旧 character_cards/{characterId}.png →
 * {characterId}/thumbnails/
 *
 * 幂等：目标已存在则跳过；DB 查不到对应记录的孤儿文件跳过并 warning。
 * 迁移失败不阻塞启动（try-catch 记录 error）。
 */
@Component
public class ThumbnailMigrationService implements ApplicationRunner {

    private static final Logger logger = Logger.getLogger(ThumbnailMigrationService.class.getName());

    @Autowired
    private AppConfig appConfig;

    @Autowired
    private Jdbi jdbi;

    @Autowired
    private CharacterFolderService characterFolderService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // 先迁移目录和立绘命名（拼音→ID）
            int[] folderResult = migrateFoldersAndPortraitsToId();
            // 再迁移旧位置的缩略图和名片缓存到角色目录
            int[] thumbResult = migratePortraitThumbnails();
            int[] cardResult = migrateCharacterCardCaches();
            logger.info(String.format(
                    "迁移完成：目录/立绘迁移 %d 个角色（跳过 %d 个），缩略图迁移 %d 个（跳过 %d 个），名片迁移 %d 个（跳过 %d 个）",
                    folderResult[0], folderResult[1], thumbResult[0], thumbResult[1], cardResult[0], cardResult[1]));
        } catch (Exception e) {
            logger.severe("迁移失败（不阻塞启动）: " + e.getMessage());
            e.printStackTrace();
        }
    }

    /**
     * 迁移角色目录从拼音名到 characterId，立绘文件名从 {拼音}_{情绪}_{编号} 到 {portraitId}
     * 返回 [已迁移角色数, 跳过角色数]
     */
    private int[] migrateFoldersAndPortraitsToId() {
        int migrated = 0, skipped = 0;
        String subdir = appConfig.getAssets().getCharacterThumbnailsSubdir();

        List<MyCharacter> characters = jdbi.withExtension(CharacterDAO.class, CharacterDAO::findAll);
        if (characters == null || characters.isEmpty()) {
            logger.info("无角色记录，跳过目录迁移");
            return new int[] { 0, 0 };
        }

        for (MyCharacter character : characters) {
            String characterId = character.getCharacterID();
            String dbFolderName = character.getFolderName();

            // 获取该角色的所有立绘
            List<Portrait> portraits = jdbi.withExtension(PortraitDAO.class,
                    dao -> dao.findByCharacterId(characterId));
            if (portraits == null || portraits.isEmpty()) {
                // 无立绘，只确保 folder_name 和目录正确
                if (dbFolderName == null || !dbFolderName.equals(characterId)) {
                    characterFolderService.resolveOrCreateFolder(characterId);
                }
                skipped++;
                continue;
            }

            // 检查是否有立绘的 image_path 还是旧格式（不以 {characterId}/ 开头）
            String oldFolderName = null;
            boolean needMigrate = false;
            for (Portrait portrait : portraits) {
                String imgPath = portrait.getImagePath();
                if (imgPath != null && !imgPath.isEmpty() && !imgPath.startsWith(characterId + "/")) {
                    needMigrate = true;
                    // 从 image_path 解析旧目录名（格式如 "xinjiaose/xinjiaose_normal_1.png"）
                    if (oldFolderName == null && imgPath.contains("/")) {
                        oldFolderName = imgPath.substring(0, imgPath.indexOf('/'));
                    }
                }
            }

            // 幂等：所有立绘都已是新格式，跳过
            if (!needMigrate) {
                // 确保 folder_name 正确
                if (dbFolderName == null || !dbFolderName.equals(characterId)) {
                    characterFolderService.resolveOrCreateFolder(characterId);
                }
                skipped++;
                continue;
            }

            // 如果无法从 image_path 解析旧目录名，用 DB folder_name
            if (oldFolderName == null || oldFolderName.isEmpty()) {
                oldFolderName = dbFolderName;
            }
            logger.info("迁移角色目录: characterId=" + characterId + ", oldFolder=" + oldFolderName);

            try {
                File oldDir = oldFolderName != null ? new File(appConfig.getAssets().getCharacters(), oldFolderName)
                        : null;
                File newDir = new File(appConfig.getAssets().getCharacters(), characterId);

                // 1. 目录重命名/合并
                if (oldDir != null && oldDir.exists()) {
                    if (newDir.exists()) {
                        // 目标已存在：合并内容（逐文件 move）
                        mergeDirectory(oldDir, newDir);
                        logger.info("合并目录: " + oldDir.getAbsolutePath() + " -> " + newDir.getAbsolutePath());
                    } else {
                        if (!oldDir.renameTo(newDir)) {
                            logger.warning("目录重命名失败: " + oldDir.getAbsolutePath() + " -> " + newDir.getAbsolutePath());
                        } else {
                            logger.info("目录重命名: " + oldFolderName + " -> " + characterId);
                        }
                    }
                } else {
                    if (oldDir != null) {
                        logger.warning("旧角色目录不存在: " + oldDir.getAbsolutePath() + "，尝试从其他位置恢复");
                    }
                    // 旧目录不存在，可能在 DB folder_name 对应的目录或其他位置
                    // 检查 DB folder_name 是否指向一个存在的目录
                    if (dbFolderName != null && !dbFolderName.equals(oldFolderName)
                            && !dbFolderName.equals(characterId)) {
                        File dbDir = new File(appConfig.getAssets().getCharacters(), dbFolderName);
                        if (dbDir.exists()) {
                            if (newDir.exists()) {
                                mergeDirectory(dbDir, newDir);
                            } else {
                                dbDir.renameTo(newDir);
                            }
                        }
                    }
                }

                // 确保 newDir 存在
                if (!newDir.exists()) {
                    newDir.mkdirs();
                }

                // 2. 立绘文件改名 + DB 更新
                for (Portrait portrait : portraits) {
                    migratePortraitFile(portrait, oldFolderName, characterId, newDir, subdir);
                }

                // 3. 更新 folder_name = characterId
                jdbi.useExtension(CharacterDAO.class,
                        dao -> dao.updateFolderName(characterId, characterId));
                logger.info("角色 folder_name 已更新: " + characterId);

                migrated++;
            } catch (Exception e) {
                logger.severe("迁移角色目录失败，characterId=" + characterId + ", oldFolder=" + oldFolderName +
                        ", 错误: " + e.getMessage());
                skipped++;
            }
        }
        return new int[] { migrated, skipped };
    }

    /**
     * 迁移单个立绘文件：改名为 {portraitId}.{ext}，更新 DB image_path 和 thumbnail_path
     */
    private void migratePortraitFile(Portrait portrait, String oldFolderName, String characterId,
            File characterDir, String subdir) {
        String portraitId = portrait.getPortraitID();
        String oldImagePath = portrait.getImagePath();

        // 幂等：imagePath 已是新格式 {characterId}/{portraitId}.ext
        if (oldImagePath == null || oldImagePath.startsWith(characterId + "/")) {
            return;
        }

        try {
            // 解析旧文件名
            int slashIdx = oldImagePath.lastIndexOf('/');
            String oldFilename = slashIdx >= 0 ? oldImagePath.substring(slashIdx + 1) : oldImagePath;

            // 旧文件应在 characterDir 中（目录已重命名）
            File oldFile = new File(characterDir, oldFilename);

            // 新文件名 = portraitId + 扩展名
            String ext = oldFilename.contains(".")
                    ? oldFilename.substring(oldFilename.lastIndexOf('.'))
                    : ".png";
            String newFilename = portraitId + ext;
            File newFile = new File(characterDir, newFilename);

            // 文件改名
            if (oldFile.exists() && !newFile.equals(oldFile)) {
                if (!newFile.exists()) {
                    if (oldFile.renameTo(newFile)) {
                        logger.info("立绘文件改名: " + oldFilename + " -> " + newFilename);
                    } else {
                        logger.warning("立绘文件改名失败: " + oldFile.getAbsolutePath());
                    }
                } else {
                    logger.warning("目标立绘文件已存在，跳过改名: " + newFile.getAbsolutePath());
                }
            } else if (!oldFile.exists()) {
                logger.warning("旧立绘文件不存在: " + oldFile.getAbsolutePath());
            }

            // 更新 DB image_path
            String newImagePath = characterId + "/" + newFilename;
            if (!newImagePath.equals(oldImagePath)) {
                jdbi.useExtension(PortraitDAO.class,
                        dao -> dao.updateImagePath(portraitId, newImagePath));
                logger.info("已更新 image_path: " + portraitId + " -> " + newImagePath);
            }

            // 缩略图路径同步
            String oldThumb = portrait.getThumbnailPath();
            if (oldThumb != null && !oldThumb.isEmpty()) {
                if (oldThumb.contains("/" + oldFolderName + "/")) {
                    // 旧路径含拼音目录，替换为 characterId
                    String newThumb = oldThumb.replace("/" + oldFolderName + "/", "/" + characterId + "/");
                    if (!newThumb.equals(oldThumb)) {
                        jdbi.useExtension(PortraitDAO.class,
                                dao -> dao.updateThumbnailPath(portraitId, newThumb));
                        logger.info("已更新 thumbnail_path: " + portraitId + " -> " + newThumb);
                    }
                } else if (oldThumb.contains("/assets/thumbnails/")) {
                    // 旧 IPC 残留的缩略图，物理移动到角色目录
                    String thumbFilename = oldThumb.substring(oldThumb.lastIndexOf('/') + 1);
                    File oldThumbFile = new File(appConfig.getAssets().getThumbnails(), thumbFilename);
                    File newThumbDir = new File(characterDir, subdir);
                    if (!newThumbDir.exists())
                        newThumbDir.mkdirs();
                    File newThumbFile = new File(newThumbDir, thumbFilename);
                    if (oldThumbFile.exists()) {
                        Files.move(oldThumbFile.toPath(), newThumbFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
                        logger.info("迁移旧IPC缩略图: " + oldThumbFile.getAbsolutePath() + " -> "
                                + newThumbFile.getAbsolutePath());
                    }
                    String newThumb = "/assets/characters/" + characterId + "/" + subdir + "/" + thumbFilename;
                    jdbi.useExtension(PortraitDAO.class,
                            dao -> dao.updateThumbnailPath(portraitId, newThumb));
                    logger.info("已更新 thumbnail_path: " + portraitId + " -> " + newThumb);
                }
            }
        } catch (Exception e) {
            logger.severe("迁移立绘文件失败，portraitId=" + portraitId + ", 错误: " + e.getMessage());
        }
    }

    /**
     * 递归合并目录内容（把 src 中的文件/子目录移到 dest）
     */
    private void mergeDirectory(File src, File dest) {
        if (!src.exists())
            return;
        File[] files = src.listFiles();
        if (files == null)
            return;
        for (File file : files) {
            File target = new File(dest, file.getName());
            if (file.isDirectory()) {
                if (!target.exists())
                    target.mkdirs();
                mergeDirectory(file, target);
            } else {
                try {
                    Files.move(file.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING);
                } catch (Exception e) {
                    logger.warning("合并文件失败: " + file.getAbsolutePath() + " -> " + target.getAbsolutePath() + ", "
                            + e.getMessage());
                }
            }
        }
        // 删除空目录
        if (src.list() != null && src.list().length == 0) {
            src.delete();
        }
    }

    /**
     * 迁移立绘缩略图（旧 /assets/thumbnails/ → {characterId}/thumbnails/）
     * 返回 [已迁移数, 跳过数]
     */
    private int[] migratePortraitThumbnails() {
        int migrated = 0, skipped = 0;
        String oldThumbnailsDir = appConfig.getAssets().getThumbnails();
        File srcDir = new File(oldThumbnailsDir);
        if (!srcDir.exists() || !srcDir.isDirectory()) {
            logger.info("旧缩略图目录不存在，跳过缩略图迁移: " + oldThumbnailsDir);
            return new int[] { 0, 0 };
        }

        File[] files = srcDir.listFiles((dir, name) -> name.startsWith("thumbnail_") && name.endsWith(".png"));
        if (files == null || files.length == 0) {
            logger.info("旧缩略图目录无待迁移文件: " + oldThumbnailsDir);
            return new int[] { 0, 0 };
        }

        String subdir = appConfig.getAssets().getCharacterThumbnailsSubdir();
        for (File srcFile : files) {
            try {
                String name = srcFile.getName();
                String portraitId = name.substring("thumbnail_".length(), name.length() - ".png".length());

                Portrait portrait = jdbi.withExtension(PortraitDAO.class,
                        dao -> dao.findById(portraitId).orElse(null));
                if (portrait == null) {
                    logger.warning("跳过孤儿缩略图文件（DB 无立绘记录）: " + srcFile.getAbsolutePath());
                    skipped++;
                    continue;
                }
                String characterId = portrait.getCharacterID();
                if (characterId == null || characterId.isEmpty()) {
                    logger.warning("跳过孤儿缩略图文件（无 characterId）: " + srcFile.getAbsolutePath());
                    skipped++;
                    continue;
                }

                // 目录名直接用 characterId
                File destDir = new File(new File(appConfig.getAssets().getCharacters(), characterId), subdir);
                if (!destDir.exists())
                    destDir.mkdirs();
                File destFile = new File(destDir, name);

                if (destFile.exists()) {
                    logger.info("目标缩略图已存在，跳过文件移动: " + destFile.getAbsolutePath());
                } else {
                    Files.move(srcFile.toPath(), destFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
                    logger.info("迁移缩略图: " + srcFile.getAbsolutePath() + " -> " + destFile.getAbsolutePath());
                }
                migrated++;

                // 更新 DB thumbnail_path
                String newUrlPath = "/assets/characters/" + characterId + "/" + subdir + "/" + name;
                if (!newUrlPath.equals(portrait.getThumbnailPath())) {
                    jdbi.useExtension(PortraitDAO.class,
                            dao -> dao.updateThumbnailPath(portraitId, newUrlPath));
                    logger.info("已更新 DB thumbnail_path: " + portraitId + " -> " + newUrlPath);
                }
            } catch (Exception e) {
                logger.severe("迁移缩略图失败: " + srcFile.getAbsolutePath() + ", 错误: " + e.getMessage());
                skipped++;
            }
        }
        return new int[] { migrated, skipped };
    }

    /**
     * 迁移角色名片图片缓存（旧 character_cards/ → {characterId}/thumbnails/）
     * 返回 [已迁移数, 跳过数]
     */
    private int[] migrateCharacterCardCaches() {
        int migrated = 0, skipped = 0;
        String oldCardsDir = ProjectConfig.THUMBNAIL_BASE_PATH + "character_cards";
        File srcDir = new File(oldCardsDir);
        if (!srcDir.exists() || !srcDir.isDirectory()) {
            logger.info("旧名片缓存目录不存在，跳过名片迁移: " + oldCardsDir);
            return new int[] { 0, 0 };
        }

        File[] files = srcDir.listFiles((dir, n) -> n.endsWith(".png"));
        if (files == null || files.length == 0) {
            logger.info("旧名片缓存目录无待迁移文件: " + oldCardsDir);
            return new int[] { 0, 0 };
        }

        String subdir = appConfig.getAssets().getCharacterThumbnailsSubdir();
        for (File srcFile : files) {
            try {
                String name = srcFile.getName();
                String characterId = name.substring(0, name.length() - ".png".length());

                // 检查角色是否存在于 DB
                MyCharacter character = jdbi.withExtension(CharacterDAO.class,
                        dao -> dao.findById(characterId).orElse(null));
                if (character == null) {
                    logger.warning("跳过孤儿名片缓存（DB 无角色记录）: " + srcFile.getAbsolutePath());
                    skipped++;
                    continue;
                }

                // 目录名直接用 characterId
                File destDir = new File(new File(appConfig.getAssets().getCharacters(), characterId), subdir);
                if (!destDir.exists())
                    destDir.mkdirs();
                File destFile = new File(destDir, name);

                if (destFile.exists()) {
                    logger.info("目标名片缓存已存在，跳过文件移动: " + destFile.getAbsolutePath());
                } else {
                    Files.move(srcFile.toPath(), destFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
                    logger.info("迁移名片缓存: " + srcFile.getAbsolutePath() + " -> " + destFile.getAbsolutePath());
                }
                migrated++;
            } catch (Exception e) {
                logger.severe("迁移名片缓存失败: " + srcFile.getAbsolutePath() + ", 错误: " + e.getMessage());
                skipped++;
            }
        }
        return new int[] { migrated, skipped };
    }
}
