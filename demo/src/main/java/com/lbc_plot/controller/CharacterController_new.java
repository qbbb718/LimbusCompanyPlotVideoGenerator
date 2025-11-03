package com.lbc_plot.controller;

import java.util.List;
import java.util.ArrayList;
import java.util.logging.Logger;
import java.io.File;
import java.nio.file.Paths;
import java.nio.file.Files;

import org.springframework.beans.factory.annotation.Autowired;
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
import org.jdbi.v3.core.Jdbi;

/**
 * 角色API控制器
 */
@RestController
@RequestMapping("/api")
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

            // 确保角色目录存在
            File characterDir = new File(CHARACTERS_DIR, character.getCharacterID());
            if (!characterDir.exists()) {
                characterDir.mkdirs();
                logger.info("创建角色目录: " + characterDir.getAbsolutePath());
            }

            jdbi.useExtension(CharacterDAO.class, dao -> dao.addCharacter(character));
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
            logger.info("更新角色: " + character.getCharacterName());
            character.setCharacterID(id);
            jdbi.useExtension(CharacterDAO.class, dao -> dao.updateCharacter(character));
            logger.info("成功更新角色: " + character.getCharacterName());
            return character;
        } catch (Exception e) {
            logger.severe("更新角色失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("更新角色失败: " + e.getMessage());
        }
    }

    /**
     * 删除角色
     */
    @DeleteMapping("/characters/{id}")
    public void deleteCharacter(@PathVariable String id, @RequestParam(required = false, defaultValue = "false") boolean deleteFiles) {
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
                    List<Portrait> portraits = dao.getByCharacterId(id);
                    for (Portrait portrait : portraits) {
                        File portraitFile = new File(portrait.getPath());
                        if (portraitFile.exists()) {
                            portraitFile.delete();
                            logger.info("已删除立绘文件: " + portraitFile.getAbsolutePath());
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
     * 更新立绘
     */
    @PutMapping("/characters/{characterId}/portraits/{portraitId}")
    public Portrait updatePortrait(@PathVariable String characterId, @PathVariable String portraitId, @RequestBody Portrait portrait) {
        try {
            logger.info("更新立绘: " + portrait.getPortName());
            portrait.setCharacterID(characterId);
            portrait.setPortraitID(portraitId);
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
            if (portrait != null && portrait.getPath() != null) {
                File portraitFile = new File(portrait.getPath());
                if (portraitFile.exists()) {
                    portraitFile.delete();
                    logger.info("已删除立绘文件: " + portraitFile.getAbsolutePath());
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
