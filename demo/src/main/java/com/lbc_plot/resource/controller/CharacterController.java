package com.lbc_plot.resource.controller;

import java.util.List;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Logger;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.lbc_plot.resource.character.CharacterCardImageCache;
import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.dao.CharacterMapper;
import com.lbc_plot.resource.dao.PortraitDAO;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;
import com.lbc_plot.resource.service.CharacterFolderService;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.config.AppConfig;
import org.jdbi.v3.core.Jdbi;

/**
 * 角色API控制器
 */
@RestController
@RequestMapping("/api")
public class CharacterController {

    private static final Logger logger = Logger.getLogger(CharacterController.class.getName());

    @Autowired
    private AppConfig appConfig;

    @Autowired
    private Jdbi jdbi;

    @Autowired
    private CharacterFolderService characterFolderService;

    @Autowired
    private com.lbc_plot.resource.character.CharacterCardImageCache characterCardImageCache;

    /**
     * 获取所有角色
     */
    @GetMapping("/characters")
    public List<MyCharacter> getCharacters() {
        logger.info("获取所有角色");
        try {
            logger.info("获取所有角色");

            // 使用自定义的CharacterMapper，确保加载关联的立绘信息
            List<MyCharacter> characters = jdbi.withHandle(handle -> {
                // 注册自定义的CharacterMapper
                handle.registerRowMapper(new CharacterMapper(jdbi));
                // 查询所有角色
                return handle.createQuery("SELECT * FROM characters ORDER BY character_name")
                        .mapTo(MyCharacter.class)
                        .list();
            });

            logger.info("成功获取 " + characters.size() + " 个角色");

            // 记录每个角色的名片图片路径
            for (MyCharacter character : characters) {
                logger.info("角色 " + character.getCharacterName() + " (ID: " + character.getCharacterID() +
                        ") 的名片图片路径: " + character.getCharacterCardImagePath());
            }

            return characters;
        } catch (Exception e) {
            logger.severe("获取角色失败: " + e.getMessage());
            e.printStackTrace();
            return new ArrayList<>();
        }
    }

    /**
     * 添加新角色
     */
    @PostMapping("/characters")
    public MyCharacter addCharacter(@RequestBody MyCharacter character) {
        try {
            logger.info("添加新角色: " + character.getCharacterName());

            // 确保角色ID存在
            if (character.getCharacterID() == null || character.getCharacterID().isEmpty()) {
                character.setNewCharacterID();
                logger.info("生成新角色ID: " + character.getCharacterID());
            }

            // 确保颜色值不为空
            if (character.getColorBg() == null) {
                character.setColorBg(ProjectConfig.DEFAULT_BG_COLOR);
                logger.info("设置默认背景颜色");
            }
            if (character.getColorText() == null) {
                character.setColorText(ProjectConfig.DEFAULT_TEXT_COLOR);
                logger.info("设置默认文字颜色");
            }

            // 确保阵营不为空
            if (character.getFaction() == null || character.getFaction().trim().isEmpty()) {
                character.setFaction("未设定");
                logger.info("设置默认阵营");
            }

            // 确保集合不为空
            if (character.getPortraits() == null) {
                character.setPortraits(new ArrayList<>());
            }
            if (character.getTags() == null) {
                character.setTags(new ArrayList<>());
            }

            // 使用事务保存角色
            jdbi.inTransaction(handle -> {
                CharacterDAO dao = handle.attach(CharacterDAO.class);
                dao.addCharacter(character);
                return null;
            });

            // 创建角色目录（目录名=characterId，唯一且不可变）
            try {
                String folderName = characterFolderService.resolveOrCreateFolder(
                        character.getCharacterID());
                character.setFolderName(folderName);
                logger.info("角色目录: " + folderName);
            } catch (Exception e) {
                logger.warning("创建角色目录失败（不影响角色创建）: " + e.getMessage());
            }

            // 生成名片图片
            logger.info("开始生成名片图片，角色ID: " + character.getCharacterID() +
                    ", 角色名称: " + character.getCharacterName());
            try {
                BufferedImage cardImage = characterCardImageCache.getCharacterCardImage(character);
                if (cardImage != null) {
                    // 设置名片图片路径
                    String cardImagePath = "/api/character-card/" + character.getCharacterID();
                    character.setCharacterCardImagePath(cardImagePath);

                    // 更新数据库中的名片图片路径
                    logger.info("更新名片图片路径到数据库，角色ID: " + character.getCharacterID() +
                            ", 路径: " + cardImagePath);
                    jdbi.useExtension(CharacterDAO.class, dao -> {
                        boolean updated = dao.updateCardImagePath(character.getCharacterID(), cardImagePath);
                        logger.info("名片图片路径已保存到数据库，更新结果: " + updated);

                        // 验证更新是否成功
                        MyCharacter updatedCharacter = dao.findById(character.getCharacterID()).orElse(null);
                        if (updatedCharacter != null) {
                            logger.info("验证更新结果 - 角色ID: " + updatedCharacter.getCharacterID() +
                                    ", 名片路径: " + updatedCharacter.getCharacterCardImagePath());
                        } else {
                            logger.warning("无法找到更新后的角色信息");
                        }
                    });

                    logger.info("名片图片生成成功: " + cardImagePath);

                    // 清除名片缓存，确保前端获取最新图片
                    characterCardImageCache.clearCache(character.getCharacterID());
                    logger.info("已清除名片缓存，角色ID: " + character.getCharacterID());
                } else {
                    logger.warning("名片图片生成失败");
                }
            } catch (Exception e) {
                logger.severe("生成名片图片时出错: " + e.getMessage());
            }

            logger.info("成功添加角色: " + character.getCharacterName());
            return character;
        } catch (Exception e) {
            logger.severe("添加角色失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("添加角色失败: " + e.getMessage());
        }
    }

    /**
     * 更新角色
     */
    @PutMapping("/characters/{id}")
    public MyCharacter updateCharacter(@PathVariable String id, @RequestBody MyCharacter character) {
        try {
            logger.info("开始更新角色，ID: " + id);

            // 获取更新前的角色信息，用于比较
            MyCharacter oldCharacter = jdbi.withHandle(handle -> {
                CharacterDAO dao = handle.attach(CharacterDAO.class);
                return dao.findById(id).orElse(null);
            });

            // 检查是否需要清除名片缓存
            boolean needClearCache = false;
            if (oldCharacter != null) {
                // 检查角色名称是否改变
                if (!oldCharacter.getCharacterName().equals(character.getCharacterName())) {
                    logger.info("角色名称已改变，需要清除名片缓存");
                    needClearCache = true;
                }

                // 检查阵营是否改变
                if (!oldCharacter.getFaction().equals(character.getFaction())) {
                    logger.info("阵营已改变，需要清除名片缓存");
                    needClearCache = true;
                }

                // 检查背景颜色是否改变
                if (!oldCharacter.getColorBg().equals(character.getColorBg())) {
                    logger.info("背景颜色已改变，需要清除名片缓存");
                    needClearCache = true;
                }

                // 检查文字颜色是否改变
                if (!oldCharacter.getColorText().equals(character.getColorText())) {
                    logger.info("文字颜色已改变，需要清除名片缓存");
                    needClearCache = true;
                }
            }
            logger.info("角色名称: " + character.getCharacterName());
            logger.info("角色阵营: " + character.getFaction());
            logger.info("角色身高: " + character.getHeight());

            // 检查颜色值
            try {
                // 直接获取颜色对象
                Color colorBg = character.getColorBg();
                Color colorText = character.getColorText();

                // 如果颜色为空，设置默认值
                if (colorBg == null) {
                    logger.warning("背景颜色为空，使用默认值");
                    character.setColorBg(ProjectConfig.DEFAULT_BG_COLOR);
                } else {
                    // 记录颜色的RGB值
                    logger.info("背景颜色 - R:" + colorBg.getRed() +
                            ", G:" + colorBg.getGreen() +
                            ", B:" + colorBg.getBlue() +
                            ", A:" + colorBg.getAlpha());
                }

                if (colorText == null) {
                    logger.warning("文字颜色为空，使用默认值");
                    character.setColorText(ProjectConfig.DEFAULT_TEXT_COLOR);
                } else {
                    // 记录颜色的RGB值
                    logger.info("文字颜色 - R:" + colorText.getRed() +
                            ", G:" + colorText.getGreen() +
                            ", B:" + colorText.getBlue() +
                            ", A:" + colorText.getAlpha());
                }
            } catch (Exception e) {
                logger.warning("颜色处理异常: " + e.getMessage());
                // 设置默认颜色
                character.setColorBg(ProjectConfig.DEFAULT_BG_COLOR);
                character.setColorText(ProjectConfig.DEFAULT_TEXT_COLOR);
            }

            // 确保阵营不为空
            if (character.getFaction() == null || character.getFaction().trim().isEmpty()) {
                character.setFaction("未设定");
                logger.info("设置默认阵营");
            }

            // 确保集合不为空
            if (character.getPortraits() == null) {
                character.setPortraits(new ArrayList<>());
            }
            if (character.getTags() == null) {
                character.setTags(new ArrayList<>());
            }

            logger.info("最终背景颜色: " + character.getColorBg());
            logger.info("最终文字颜色: " + character.getColorText());
            logger.info("角色标签: " + (character.getTags() != null ? String.join(", ", character.getTags()) : "无"));
            logger.info("立绘数量: " + (character.getPortraits() != null ? character.getPortraits().size() : 0));

            character.setCharacterID(id);

            logger.info("准备执行数据库更新操作");

            // 将needClearCache声明为final，以便在lambda中使用
            final boolean finalNeedClearCache = needClearCache;

            // 使用事务更新角色和立绘
            jdbi.inTransaction(handle -> {
                CharacterDAO characterDao = handle.attach(CharacterDAO.class);
                PortraitDAO portraitDao = handle.attach(PortraitDAO.class);

                // 更新角色基本信息
                boolean updated = characterDao.update(character);
                if (!updated) {
                    // 如果更新失败，可能是角色不存在，尝试添加
                    logger.warning("角色更新失败，可能是角色不存在，尝试添加新角色");
                    characterDao.addCharacter(character);
                    // 新角色需要生成名片，在lambda外部设置标志
                    // finalNeedClearCache已在事务外设置
                }

                // 更新立绘信息
                if (character.getPortraits() != null && !character.getPortraits().isEmpty()) {
                    // 先删除旧的关联关系
                    portraitDao.deleteCharacterPortraits(id);

                    // 更新或添加每个立绘
                    for (Portrait portrait : character.getPortraits()) {
                        if (portrait.getPortraitID() == null || portrait.getPortraitID().isEmpty()) {
                            // 如果是新立绘，生成ID
                            portrait.setNewPortraitID();
                        }

                        // 确保立绘属于当前角色
                        portrait.setCharacterID(id);

                        // 检查立绘是否已存在
                        if (portraitDao.existsById(portrait.getPortraitID())) {
                            // 更新现有立绘
                            portraitDao.update(portrait);
                        } else {
                            // 添加新立绘
                            portraitDao.save(portrait);
                            // 添加立绘不需要清除名片缓存，只有修改名片相关属性时才需要
                        }
                    }

                    // 保存新的关联关系
                    portraitDao.saveCharacterPortraits(id, character.getPortraits());
                }

                return null;
            });

            logger.info("数据库更新操作完成");

            // 角色ID不变，目录名（=characterId）不变，无需重命名目录

            // 生成名片图片
            logger.info("开始生成名片图片，角色ID: " + character.getCharacterID() +
                    ", 角色名称: " + character.getCharacterName());
            try {
                BufferedImage cardImage = characterCardImageCache.getCharacterCardImage(character);
                if (cardImage != null) {
                    // 设置名片图片路径
                    String cardImagePath = "/api/character-card/" + character.getCharacterID();
                    character.setCharacterCardImagePath(cardImagePath);

                    // 更新数据库中的名片图片路径
                    logger.info("更新名片图片路径到数据库，角色ID: " + character.getCharacterID() +
                            ", 路径: " + cardImagePath);
                    jdbi.useExtension(CharacterDAO.class, dao -> {
                        boolean updated = dao.updateCardImagePath(character.getCharacterID(), cardImagePath);
                        logger.info("名片图片路径已保存到数据库，更新结果: " + updated);

                        // 验证更新是否成功
                        MyCharacter updatedCharacter = dao.findById(character.getCharacterID()).orElse(null);
                        if (updatedCharacter != null) {
                            logger.info("验证更新结果 - 角色ID: " + updatedCharacter.getCharacterID() +
                                    ", 名片路径: " + updatedCharacter.getCharacterCardImagePath());
                        } else {
                            logger.warning("无法找到更新后的角色信息");
                        }
                    });

                    logger.info("名片图片生成成功: " + cardImagePath);

                    // 只有在需要时才清除名片缓存
                    if (finalNeedClearCache) {
                        characterCardImageCache.clearCache(character.getCharacterID());
                        logger.info("已清除名片缓存，角色ID: " + character.getCharacterID());
                    }
                } else {
                    logger.warning("名片图片生成失败");
                }
            } catch (Exception e) {
                logger.severe("生成名片图片时出错: " + e.getMessage());
            }

            logger.info("成功更新角色: " + character.getCharacterName());
            return character;
        } catch (Exception e) {
            logger.severe("更新角色失败，详细信息:");
            logger.severe("- 异常类型: " + e.getClass().getName());
            logger.severe("- 异常消息: " + e.getMessage());
            logger.severe("- 角色ID: " + id);
            logger.severe("- 角色名称: " + (character != null ? character.getCharacterName() : "null"));

            // 打印堆栈跟踪
            java.io.StringWriter sw = new java.io.StringWriter();
            java.io.PrintWriter pw = new java.io.PrintWriter(sw);
            e.printStackTrace(pw);
            logger.severe("- 堆栈跟踪:" + sw.toString());

            throw new RuntimeException("更新角色失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/characters/{id}")
    public void deleteCharacter(@PathVariable String id,
            @RequestParam(required = false, defaultValue = "false") boolean deleteFiles) {
        try {
            logger.info("删除角色: " + id + ", 删除文件: " + deleteFiles);

            // 如果需要删除文件，先查询立绘（此时图片文件还在），再删除目录和缩略图。
            // PortraitMapper 构建时会调用 ImageReader 验证图片存在，
            // 若先删目录会导致图片加载失败抛异常，DB 记录也无法删除。
            if (deleteFiles) {
                List<Portrait> portraits = jdbi.withExtension(PortraitDAO.class,
                        dao -> dao.findByCharacterId(id));

                // 清理名片图片内存缓存（磁盘文件随角色目录递归删除）。
                // 必须在 deleteFolder 之前调用，因为 clearCache 需要查 DB 拿角色名定位磁盘文件。
                try {
                    characterCardImageCache.clearCache(id);
                } catch (Exception e) {
                    logger.warning("清理名片缓存失败: " + e.getMessage());
                }

                // 删除角色目录（包含立绘原图、缩略图、名片图片——都在 thumbnails 子目录下）
                try {
                    characterFolderService.deleteFolder(id);
                } catch (Exception e) {
                    logger.warning("删除角色目录失败: " + e.getMessage());
                }

                // 兜底：单独删除缩略图文件（兼容旧路径残留，新路径已随目录删除）
                for (Portrait portrait : portraits) {
                    if (portrait.getThumbnailPath() != null && !portrait.getThumbnailPath().isEmpty()) {
                        // thumbnailPath 形如 "/assets/characters/{拼音}/thumbnails/xxx.png"（URL 路径）
                        // 或旧值 "/assets/thumbnails/xxx.png"，去掉前导 / 按工作目录解析
                        String tp = portrait.getThumbnailPath();
                        String fsPath = tp.startsWith("/") ? tp.substring(1) : tp;
                        File thumbnailFile = new File(fsPath);
                        if (thumbnailFile.exists()) {
                            thumbnailFile.delete();
                            logger.info("已删除缩略图文件: " + thumbnailFile.getAbsolutePath());
                        }
                    }
                }
            }

            // 删除关联的立绘记录（portraits 表 + character_portraits 表）
            jdbi.useExtension(PortraitDAO.class, dao -> {
                dao.deleteCharacterPortraits(id);
                dao.deleteByCharacterId(id);
            });
            logger.info("已清理角色 " + id + " 的立绘记录");

            jdbi.useExtension(CharacterDAO.class, dao -> dao.deleteCharacter(id, deleteFiles));
            logger.info("成功删除角色: " + id);
        } catch (Exception e) {
            logger.severe("删除角色失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("删除角色失败: " + e.getMessage());
        }
    }

    /**
     * 导出角色为 ZIP 文件
     * ZIP 内含 characters.json（角色元数据）和各角色的立绘原图及缩略图
     */
    @PostMapping("/characters/export")
    public ResponseEntity<Resource> exportCharacters(@RequestBody List<String> characterIds) {
        try {
            logger.info("导出角色请求，数量: " + (characterIds != null ? characterIds.size() : 0));

            // 1. 从数据库加载角色（含立绘）
            String charactersDir = appConfig.getAssets().getCharacters();
            List<MyCharacter> characters = jdbi.withHandle(handle -> {
                handle.registerRowMapper(new CharacterMapper(jdbi));
                CharacterDAO dao = handle.attach(CharacterDAO.class);
                List<MyCharacter> result = new ArrayList<>();
                if (characterIds != null) {
                    for (String id : characterIds) {
                        dao.findById(id).ifPresent(result::add);
                    }
                }
                return result;
            });
            logger.info("找到 " + characters.size() + " 个角色待导出");

            // 2. 在临时目录创建 ZIP
            Path tempZip = Files.createTempFile("characters_export_", ".zip");
            ObjectMapper mapper = new ObjectMapper();
            mapper.enable(SerializationFeature.INDENT_OUTPUT);

            try (ZipOutputStream zos = new ZipOutputStream(
                    new FileOutputStream(tempZip.toFile()))) {

                // 3. 写入 characters.json
                zos.putNextEntry(new ZipEntry("characters.json"));
                byte[] jsonBytes = mapper.writeValueAsBytes(characters);
                zos.write(jsonBytes);
                zos.closeEntry();

                // 4. 写入每个角色的立绘图片和缩略图
                for (MyCharacter ch : characters) {
                    String folderName = ch.getFolderName();
                    if (folderName == null || folderName.isEmpty()) {
                        continue;
                    }

                    if (ch.getPortraits() != null) {
                        for (Portrait p : ch.getPortraits()) {
                            // 立绘原图
                            String imagePath = p.getImagePath();
                            if (imagePath != null && !imagePath.isEmpty()) {
                                File imageFile = new File(charactersDir, imagePath);
                                addFileToZip(zos, imageFile,
                                        folderName + "/" + imageFile.getName());
                            }

                            // 缩略图
                            String thumbnailPath = p.getThumbnailPath();
                            if (thumbnailPath != null && !thumbnailPath.isEmpty()) {
                                // thumbnailPath 是 URL 如 "/assets/characters/{id}/thumbnails/x.png"
                                String fsPath = thumbnailPath.startsWith("/")
                                        ? thumbnailPath.substring(1)
                                        : thumbnailPath;
                                File thumbFile = new File(fsPath);
                                if (thumbFile.exists()) {
                                    addFileToZip(zos, thumbFile,
                                            folderName + "/thumbnails/" + thumbFile.getName());
                                } else {
                                    logger.warning("缩略图文件不存在，跳过: " + thumbFile.getAbsolutePath());
                                }
                            }
                        }
                    }
                }
            }

            // 5. 返回下载
            Resource resource = new UrlResource(tempZip.toUri());
            String fileName = "characters_" + System.currentTimeMillis() + ".zip";
            logger.info("导出完成: " + fileName);
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType("application/zip"))
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=\"" + fileName + "\"")
                    .body(resource);
        } catch (Exception e) {
            logger.severe("导出角色失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("导出角色失败: " + e.getMessage());
        }
    }

    /**
     * 从 ZIP 文件导入角色
     */
    @PostMapping("/characters/import")
    public List<MyCharacter> importCharacters(@RequestParam("file") MultipartFile file) {
        try {
            logger.info("导入角色请求，文件: " + file.getOriginalFilename());

            // 1. 保存上传的 ZIP 到临时文件
            Path tempZip = Files.createTempFile("characters_import_", ".zip");
            Files.copy(file.getInputStream(), tempZip,
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING);

            // 2. 先完整读取 ZIP 内容到内存
            Map<String, byte[]> zipEntries = new HashMap<>();
            String charactersJson = null;

            try (ZipInputStream zis = new ZipInputStream(
                    new FileInputStream(tempZip.toFile()))) {
                java.util.zip.ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    String name = entry.getName();
                    if (entry.isDirectory()) {
                        zis.closeEntry();
                        continue;
                    }
                    byte[] data = zis.readAllBytes();
                    if ("characters.json".equals(name)) {
                        charactersJson = new String(data, java.nio.charset.StandardCharsets.UTF_8);
                    } else {
                        zipEntries.put(name, data);
                    }
                    zis.closeEntry();
                }
            }

            if (charactersJson == null) {
                throw new RuntimeException("无效的角色导出文件：缺少 characters.json");
            }

            // 3. 反序列化角色列表
            ObjectMapper mapper = new ObjectMapper();
            List<MyCharacter> importedChars = mapper.readValue(charactersJson,
                    mapper.getTypeFactory().constructCollectionType(List.class, MyCharacter.class));

            List<MyCharacter> result = new ArrayList<>();
            String charactersDir = appConfig.getAssets().getCharacters();
            String timestamp = String.valueOf(System.currentTimeMillis());

            // 4. 逐个处理角色
            for (int i = 0; i < importedChars.size(); i++) {
                MyCharacter ch = importedChars.get(i);
                String oldFolderName = ch.getFolderName();

                // 检查 ID 是否冲突，若冲突则分配新 ID
                final String newCharId;
                String origCharId = ch.getCharacterID();
                MyCharacter existing = jdbi.withHandle(handle -> {
                    CharacterDAO dao = handle.attach(CharacterDAO.class);
                    return dao.findById(origCharId).orElse(null);
                });

                if (existing != null) {
                    newCharId = "char_import_" + timestamp + "_" + i;
                    logger.info("角色 ID 冲突，已分配新 ID: " + origCharId + " → " + newCharId);
                    ch.setCharacterID(newCharId);
                } else {
                    newCharId = origCharId;
                }

                // 创建角色目录
                String newFolderName = characterFolderService.resolveOrCreateFolder(newCharId);
                ch.setFolderName(newFolderName);

                // 处理立绘文件
                if (ch.getPortraits() != null) {
                    for (Portrait p : ch.getPortraits()) {
                        // 更新 characterID
                        p.setCharacterID(newCharId);

                        // 保留原 portraitID（或在冲突时生成新的）
                        String origPortraitId = p.getPortraitID();
                        // 检查 portrait ID 是否冲突
                        Portrait existingPortrait = jdbi.withExtension(
                                PortraitDAO.class,
                                dao -> dao.findById(origPortraitId).orElse(null));
                        if (existingPortrait != null) {
                            p.setNewPortraitID();
                            logger.info("立绘 ID 冲突，已生成新 ID: " + origPortraitId + " → "
                                    + p.getPortraitID());
                        }

                        // 保存 JSON 中的缩略图路径，因为 setImagePath() 会将其清空
                        String jsonThumbnailPath = p.getThumbnailPath();

                        // 从 ZIP 中恢复立绘原图
                        if (oldFolderName != null && p.getImagePath() != null) {
                            String oldImageFileName = new File(p.getImagePath()).getName();
                            String zipImageEntry = oldFolderName + "/" + oldImageFileName;
                            byte[] imageData = zipEntries.get(zipImageEntry);

                            if (imageData != null) {
                                String ext = oldImageFileName.contains(".")
                                        ? oldImageFileName.substring(
                                                oldImageFileName.lastIndexOf('.'))
                                        : ".png";
                                String newFileName = p.getPortraitID() + ext;
                                File destFile = new File(charactersDir,
                                        newFolderName + "/" + newFileName);
                                destFile.getParentFile().mkdirs();
                                Files.write(destFile.toPath(), imageData);
                                p.setImagePath(newFolderName + "/" + newFileName);
                            } else {
                                logger.warning("ZIP 中未找到立绘文件: " + zipImageEntry
                                        + "，已清除立绘路径");
                                p.setImagePath(null);
                            }
                        }

                        // 从 ZIP 中恢复缩略图（使用保存的 jsonThumbnailPath，
                        // 因为 setImagePath() 已将其清空）
                        if (oldFolderName != null && jsonThumbnailPath != null
                                && !jsonThumbnailPath.isEmpty()) {
                            String oldThumbFileName = new File(jsonThumbnailPath).getName();
                            String zipThumbEntry = oldFolderName + "/thumbnails/"
                                    + oldThumbFileName;
                            byte[] thumbData = zipEntries.get(zipThumbEntry);

                            if (thumbData != null) {
                                String newThumbFileName = "thumbnail_" + p.getPortraitID()
                                        + ".png";
                                String subdir = appConfig.getAssets()
                                        .getCharacterThumbnailsSubdir();
                                File destDir = new File(charactersDir,
                                        newFolderName + "/" + subdir);
                                destDir.mkdirs();
                                File destFile = new File(destDir, newThumbFileName);
                                Files.write(destFile.toPath(), thumbData);
                                p.setThumbnailPath("/assets/characters/" + newFolderName
                                        + "/" + subdir + "/" + newThumbFileName);
                            } else {
                                logger.warning("ZIP 中未找到缩略图: " + zipThumbEntry
                                        + "，已清除缩略图路径");
                                p.setThumbnailPath(null);
                            }
                        }
                    }
                }

                // 保存角色到数据库
                jdbi.inTransaction(handle -> {
                    CharacterDAO charDao = handle.attach(CharacterDAO.class);
                    PortraitDAO portDao = handle.attach(PortraitDAO.class);

                    // 保存角色基本信息
                    charDao.addCharacter(ch);

                    // 先清理该角色的旧立绘记录（重复导入时会残留）
                    portDao.deleteCharacterPortraits(newCharId);
                    portDao.deleteByCharacterId(newCharId);
                    logger.info("已清理角色 " + newCharId + " 的旧立绘记录");

                    // 保存立绘
                    if (ch.getPortraits() != null && !ch.getPortraits().isEmpty()) {
                        for (Portrait p : ch.getPortraits()) {
                            portDao.save(p);
                        }
                        portDao.saveCharacterPortraits(newCharId, ch.getPortraits());
                    }

                    return null;
                });

                result.add(ch);
                logger.info("成功导入角色: " + ch.getCharacterName() + " (ID: " + newCharId
                        + ")");
            }

            // 清理临时文件
            Files.deleteIfExists(tempZip);

            logger.info("导入完成，共 " + result.size() + " 个角色");
            return result;
        } catch (Exception e) {
            logger.severe("导入角色失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("导入角色失败: " + e.getMessage());
        }
    }

    /**
     * 向 ZIP 输出流添加一个文件
     */
    private void addFileToZip(ZipOutputStream zos, File file, String entryName)
            throws IOException {
        if (!file.exists()) {
            logger.warning("文件不存在，跳过: " + file.getAbsolutePath());
            return;
        }
        zos.putNextEntry(new ZipEntry(entryName));
        byte[] data = Files.readAllBytes(file.toPath());
        zos.write(data);
        zos.closeEntry();
    }

    /**
     * 递归删除目录及其所有内容
     */
    private void deleteDirectory(File directory) {
        File[] files = directory.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isDirectory()) {
                    deleteDirectory(file);
                } else {
                    file.delete();
                }
            }
        }
        directory.delete();
    }
}
