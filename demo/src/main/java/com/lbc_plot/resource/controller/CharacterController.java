package com.lbc_plot.resource.controller;

import java.util.List;
import java.util.ArrayList;
import java.util.logging.Logger;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Autowired;
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
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.lbc_plot.resource.character.CharacterCardImageCache;
import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.dao.CharacterMapper;
import com.lbc_plot.resource.dao.PortraitDAO;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;
import com.lbc_plot.resource.service.CharacterFolderService;
import com.lbc_plot.resource.service.ResourceTransferService;
import com.lbc_plot.config.ProjectConfig;
import org.jdbi.v3.core.Jdbi;

/**
 * 角色API控制器
 */
@RestController
@RequestMapping("/api")
public class CharacterController {

    private static final Logger logger = Logger.getLogger(CharacterController.class.getName());

    @Autowired
    private Jdbi jdbi;

    @Autowired
    private ResourceTransferService resourceTransferService;

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
                    // 上面 getCharacterCardImage() 生成时已经把新图写进内存+磁盘缓存，
                    // 这里不要再 clearCache：那会把刚生成的名片删掉，导致首次请求还要重新渲染。
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
                }

                // 更新立绘信息
                if (character.getPortraits() != null && !character.getPortraits().isEmpty()) {
                    // 重建关联关系前先记下当前的默认立绘。
                    // deleteCharacterPortraits 会连默认标记一起删掉，若不留存快照，
                    // 后面 saveCharacterPortraits 只能退回"列表第一个是默认"，
                    // 用户的默认立绘选择就被重置了。
                    String preservedDefaultPortraitId = portraitDao.findDefaultPortraitId(id);

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

                    // 保存新的关联关系（保留原有默认立绘，入参带标记时以入参为准）
                    portraitDao.saveCharacterPortraits(id, character.getPortraits(), preservedDefaultPortraitId);
                }

                return null;
            });

            logger.info("数据库更新操作完成");

            // 角色ID不变，目录名（=characterId）不变，无需重命名目录

            // 生成名片图片
            logger.info("开始生成名片图片，角色ID: " + character.getCharacterID() +
                    ", 角色名称: " + character.getCharacterName());
            try {
                // 必须先清缓存再生成。顺序反过来的话 getCharacterCardImage() 会直接命中
                // 旧缓存、把旧图返回给前端，紧接着 clearCache() 又把这张旧图删掉，
                // 结果就是「改完角色得重启应用才能看到新名片」。
                characterCardImageCache.clearCache(character.getCharacterID());
                logger.info("已清除名片缓存，角色ID: " + character.getCharacterID());

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
     * @api 导出角色
     * @endpoint POST /api/characters/export
     * @param characterIds 要导出的角色 ID 列表；传空数组或不传表示导出全部角色
     * @return ZIP 文件（characters.json + 各角色的立绘原图与缩略图）
     *
     * <p>打包逻辑见 {@link ResourceTransferService#exportCharacters(List)}：与"全部资源"导出
     * 共用同一份实现，避免两处 ZIP 结构各写一份后逐渐漂移。
     */
    @PostMapping("/characters/export")
    public ResponseEntity<StreamingResponseBody> exportCharacters(
            @RequestBody(required = false) List<String> characterIds) {
        Path tempZip = null;
        try {
            logger.info("导出角色请求，数量: " + (characterIds != null ? characterIds.size() : 0));
            tempZip = resourceTransferService.exportCharacters(characterIds);
            return TransferHttpSupport.zipDownload(tempZip,
                    "characters_" + System.currentTimeMillis() + ".zip");
        } catch (Exception e) {
            // 响应还没开始写，临时包只能在这里清掉，否则会一直堆在系统临时目录里
            ResourceTransferService.deleteQuietly(tempZip);
            logger.severe("导出角色失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("导出角色失败: " + e.getMessage());
        }
    }

    /**
     * @api 导入角色
     * @endpoint POST /api/characters/import
     * @param file 由"导出角色"生成的 ZIP（characters.json 在包根目录）
     * @return 导入后的角色列表（ID 冲突的角色会被分配新 ID，不会覆盖本机已有角色）
     */
    @PostMapping("/characters/import")
    public List<MyCharacter> importCharacters(@RequestParam("file") MultipartFile file) {
        Path tempZip = null;
        try {
            logger.info("导入角色请求，文件: " + file.getOriginalFilename());
            tempZip = ResourceTransferService.saveUploadedZip(file, "characters_import_");
            return resourceTransferService.importCharacters(tempZip);
        } catch (IllegalArgumentException e) {
            // 资源包本身有问题（缺清单、包为空…）：交给 GlobalExceptionHandler 回 400，
            // 让前端能原样显示"这个包为什么不能用"，而不是一句 500
            throw e;
        } catch (Exception e) {
            logger.severe("导入角色失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("导入角色失败: " + e.getMessage());
        } finally {
            ResourceTransferService.deleteQuietly(tempZip);
        }
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
