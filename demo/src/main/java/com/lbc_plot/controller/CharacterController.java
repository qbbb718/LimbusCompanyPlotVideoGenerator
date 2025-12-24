package com.lbc_plot.controller;

import java.util.List;
import java.util.ArrayList;
import java.util.logging.Logger;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.DAO.CharacterMapper;
import com.lbc_plot.util.CharacterCardImageCache;
import com.lbc_plot.config.ProjectConfig;
import org.jdbi.v3.core.Jdbi;

/**
 * 角色API控制器
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = { "http://localhost:3000", "http://127.0.0.1:3000" })
public class CharacterController {

    private static final Logger logger = Logger.getLogger(CharacterController.class.getName());

    // 资源文件夹路径 - 使用绝对路径确保正确访问
    private static final String CHARACTERS_DIR = System.getProperty("user.dir") + "/resources/characters";

    @Autowired
    private Jdbi jdbi;

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

            // 确保角色目录存在
            File characterDir = new File(CHARACTERS_DIR, character.getCharacterID());
            if (!characterDir.exists()) {
                characterDir.mkdirs();
                logger.info("创建角色目录: " + characterDir.getAbsolutePath());
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

            // 生成名片图片
            logger.info("开始生成名片图片，角色ID: " + character.getCharacterID() +
                    ", 角色名称: " + character.getCharacterName());
            try {
                BufferedImage cardImage = CharacterCardImageCache.getCharacterCardImage(character);
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
                    CharacterCardImageCache.clearCache(character.getCharacterID());
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

            // 生成名片图片
            logger.info("开始生成名片图片，角色ID: " + character.getCharacterID() +
                ", 角色名称: " + character.getCharacterName());
            try {
                BufferedImage cardImage = CharacterCardImageCache.getCharacterCardImage(character);
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
                        CharacterCardImageCache.clearCache(character.getCharacterID());
                        logger.info("已清除名片缓存，角色ID: " + character.getCharacterID());
                    }
                } else {
                    logger.warning("名片图片生成失败");
                }
            } catch (Exception e) {
                logger.severe( "生成名片图片时出错: " + e.getMessage() );
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

            // 如果需要删除文件
            if (deleteFiles) {
                File characterDir = new File(CHARACTERS_DIR, id);
                if (characterDir.exists()) {
                    deleteDirectory(characterDir);
                    logger.info("已删除角色目录: " + characterDir.getAbsolutePath());
                }

                // 删除立绘文件
                jdbi.withExtension(PortraitDAO.class, dao -> {
                    List<Portrait> portraits = dao.findByCharacterId(id);
                    for (Portrait portrait : portraits) {
                        File portraitFile = new File(portrait.getImagePath());
                        if (portraitFile.exists()) {
                            portraitFile.delete();
                            logger.info("已删除立绘文件: " + portraitFile.getAbsolutePath());
                        }

                        // 删除缩略图
                        if (portrait.getThumbnailPath() != null && !portrait.getThumbnailPath().isEmpty()) {
                            File thumbnailFile = new File(portrait.getThumbnailPath());
                            if (thumbnailFile.exists()) {
                                thumbnailFile.delete();
                                logger.info("已删除缩略图文件: " + thumbnailFile.getAbsolutePath());
                            }
                        }
                    }
                    return portraits;
                });
            }

            jdbi.useExtension(CharacterDAO.class, dao -> dao.deleteCharacter(id, deleteFiles));
            logger.info("成功删除角色: " + id);
        } catch (Exception e) {
            logger.severe("删除角色失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("删除角色失败: " + e.getMessage());
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
