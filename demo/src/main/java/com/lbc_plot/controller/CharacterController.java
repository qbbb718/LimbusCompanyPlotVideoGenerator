package com.lbc_plot.controller;

import java.util.List;
import java.util.ArrayList;
import java.util.logging.Logger;
import java.awt.Color;
import java.io.File;
import java.nio.file.Paths;
import java.nio.file.Files;

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
import com.lbc_plot.util.ColorUtils;
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

    // 资源文件夹路径
    private static final String CHARACTERS_DIR = "resources/characters";
    private static final String PORTRAITS_DIR = "resources/portraits";

    @Autowired
    private Jdbi jdbi;

    /**
     * 获取所有角色
     */
    @GetMapping("/characters")
    public List<MyCharacter> getCharacters() {
        try {
            logger.info("获取所有角色");
            List<MyCharacter> characters = jdbi.withExtension(CharacterDAO.class, dao -> dao.getAllCharacters());
            logger.info("成功获取 " + characters.size() + " 个角色");
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
            
            // 使用事务更新角色
            jdbi.inTransaction(handle -> {
                CharacterDAO dao = handle.attach(CharacterDAO.class);
                boolean updated = dao.update(character);
                if (!updated) {
                    // 如果更新失败，可能是角色不存在，尝试添加
                    logger.warning("角色更新失败，可能是角色不存在，尝试添加新角色");
                    dao.addCharacter(character);
                }
                return null;
            });
            
            logger.info("数据库更新操作完成");
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
     * 添加立绘
     */
    @PostMapping("/characters/{characterId}/portraits")
    public Portrait addPortrait(@PathVariable String characterId, @RequestBody Portrait portrait) {
        try {
            logger.info("为角色 " + characterId + " 添加立绘: " + portrait.getPortName());
            portrait.setCharacterID(characterId);

            // 确保立绘目录存在
            File portraitDir = new File(PORTRAITS_DIR);
            if (!portraitDir.exists()) {
                portraitDir.mkdirs();
                logger.info("创建立绘目录: " + portraitDir.getAbsolutePath());
            }

            // 处理图片裁剪和缩略图
            if (portrait.getImagePath() != null && !portrait.getImagePath().isEmpty()) {
                File sourceImage = new File(portrait.getImagePath());
                if (sourceImage.exists()) {
                    // 创建缩略图
                    String thumbnailPath = createThumbnail(portrait, sourceImage);
                    portrait.setThumbnailPath(thumbnailPath);
                    logger.info("创建缩略图: " + thumbnailPath);
                }
            }

            jdbi.useExtension(PortraitDAO.class, dao -> dao.addPortrait(portrait));
            logger.info("成功添加立绘: " + portrait.getPortName());
            return portrait;
        } catch (Exception e) {
            logger.severe("添加立绘失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("添加立绘失败: " + e.getMessage());
        }
    }

    /**
     * 创建缩略图
     */
    private String createThumbnail(Portrait portrait, File sourceImage) {
        try {
            // 创建缩略图文件名
            String sourceName = sourceImage.getName();
            String nameWithoutExt = sourceName.contains(".") ? sourceName.substring(0, sourceName.lastIndexOf('.'))
                    : sourceName;
            String thumbnailName = nameWithoutExt + "_thumb.jpg";
            File thumbnailFile = new File(sourceImage.getParentFile(), thumbnailName);

            // 如果缩略图已存在，直接返回路径
            if (thumbnailFile.exists()) {
                return thumbnailFile.getAbsolutePath();
            }

            // 使用JavaCV创建缩略图
            // 这里应该实现实际的缩略图创建逻辑
            // 简化实现，直接复制原图
            Files.copy(sourceImage.toPath(), thumbnailFile.toPath());

            return thumbnailFile.getAbsolutePath();
        } catch (Exception e) {
            logger.warning("创建缩略图失败: " + e.getMessage());
            return sourceImage.getAbsolutePath(); // 失败时返回原图路径
        }
    }

    /**
     * 更新立绘
     */
    @PutMapping("/characters/{characterId}/portraits/{portraitId}")
    public Portrait updatePortrait(@PathVariable String characterId, @PathVariable String portraitId,
            @RequestBody Portrait portrait) {
        try {
            logger.info("更新立绘: " + portrait.getPortName());
            portrait.setCharacterID(characterId);
            portrait.setPortraitID(portraitId);

            // 处理图片裁剪和缩略图
            if (portrait.getImagePath() != null && !portrait.getImagePath().isEmpty()) {
                File sourceImage = new File(portrait.getImagePath());
                if (sourceImage.exists()) {
                    // 创建缩略图
                    String thumbnailPath = createThumbnail(portrait, sourceImage);
                    portrait.setThumbnailPath(thumbnailPath);
                    logger.info("创建缩略图: " + thumbnailPath);
                }
            }

            jdbi.useExtension(PortraitDAO.class, dao -> dao.updatePortrait(portrait));
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
    public void deletePortrait(@PathVariable String characterId, @PathVariable String portraitId) {
        try {
            logger.info("删除立绘: " + portraitId);

            // 先获取立绘信息，以便删除文件
            Portrait portrait = jdbi.withExtension(PortraitDAO.class, dao -> dao.getById(portraitId));
            if (portrait != null && portrait.getImagePath() != null) {
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

            jdbi.useExtension(PortraitDAO.class, dao -> dao.deletePortrait(portraitId));
            logger.info("成功删除立绘: " + portraitId);
        } catch (Exception e) {
            logger.severe("删除立绘失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("删除立绘失败: " + e.getMessage());
        }
    }

    /**
     * 递归删除目录
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