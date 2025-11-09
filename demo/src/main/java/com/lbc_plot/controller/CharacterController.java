package com.lbc_plot.controller;

import java.util.List;
import java.util.ArrayList;
import java.util.logging.Logger;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.file.Paths;
import java.nio.file.Files;
import javax.imageio.ImageIO;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

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
import com.lbc_plot.util.ColorUtils;
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

    // 资源文件夹路径
    private static final String CHARACTERS_DIR = "resources/characters";
    private static final String PORTRAITS_DIR = "resources/portraits";

    @Autowired
    private Jdbi jdbi;
    
    /**
     * 获取角色名片图片
     */
    @GetMapping("/character-card/{characterId}")
    public ResponseEntity<Resource> getCharacterCard(@PathVariable String characterId) {
        logger.info("请求获取角色名片图片，角色ID: " + characterId);
        try {
            // 从缓存中获取名片图片
            MyCharacter character = jdbi.withExtension(CharacterDAO.class, dao -> 
                dao.findById(characterId).orElse(null));
            
            logger.info("获取到的角色信息: " + (character != null ? 
                "ID=" + character.getCharacterID() + 
                ", 名称=" + character.getCharacterName() + 
                ", 名片路径=" + character.getCharacterCardImagePath() : "null"));
            
            if (character == null) {
                logger.warning("角色不存在，ID: " + characterId);
                return ResponseEntity.notFound().build();
            }
            
            BufferedImage cardImage = CharacterCardImageCache.getCharacterCardImage(character);
            if (cardImage == null) {
                return ResponseEntity.notFound().build();
            }
            
            // 将BufferedImage转换为字节数组
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(cardImage, "PNG", baos);
            byte[] imageBytes = baos.toByteArray();
            
            logger.info("成功生成名片图片，大小: " + imageBytes.length + " 字节");
            return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .body(new ByteArrayResource(imageBytes));
        } catch (Exception e) {
            logger.severe("获取角色名片图片失败: " + e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

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
                        dao.updateCardImagePath(character.getCharacterID(), cardImagePath);
                        logger.info("名片图片路径已保存到数据库");
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
            logger.info("立绘详细信息:");
            logger.info("- 图片路径: " + portrait.getImagePath());
            logger.info("- 情绪: " + portrait.getEmotionName());
            logger.info("- 面部位置: X=" + portrait.getFaceX() + ", Y=" + portrait.getFaceY());
            logger.info("- 调整位置: X=" + portrait.getAdjX() + ", Y=" + portrait.getAdjY());
            logger.info("- 长度: " + portrait.getLength());
            portrait.setCharacterID(characterId);

            // 确保立绘目录存在
            File portraitDir = new File(PORTRAITS_DIR);
            if (!portraitDir.exists()) {
                portraitDir.mkdirs();
                logger.info("创建立绘目录: " + portraitDir.getAbsolutePath());
            }

            // 在addPortrait方法中，删除重复的代码块并修正括号匹配
            if (portrait.getImagePath() != null && !portrait.getImagePath().isEmpty()) {
                // 检查是否是base64编码的图像
                if (portrait.getImagePath().startsWith("data:image/")) {
                    try {
                        // 处理base64编码的图像
                        String base64Data = portrait.getImagePath().substring(portrait.getImagePath().indexOf(",") + 1);
                        byte[] imageBytes = java.util.Base64.getDecoder().decode(base64Data);

                        // 创建临时文件
                        String tempFileName = "temp_" + portrait.getPortraitID() + ".png";
                        File tempFile = new File(PORTRAITS_DIR, tempFileName);
                        java.io.FileOutputStream fos = new java.io.FileOutputStream(tempFile);
                        fos.write(imageBytes);
                        fos.close();

                        // 更新imagePath为临时文件路径
                        portrait.setImagePath(tempFile.getAbsolutePath());

                        // 创建缩略图
                        String thumbnailPath = createThumbnail(portrait, tempFile);
                        portrait.setThumbnailPath(thumbnailPath);
                        logger.info("从base64创建缩略图: " + thumbnailPath);
                    } catch (Exception e) {
                        logger.severe("处理base64图像失败: " + e.getMessage());
                        e.printStackTrace();
                    }
                } else {
                    // 处理普通文件路径
                    String imagePath = portrait.getImagePath();
                    logger.info("处理立绘路径: " + imagePath);

                    // 如果只有文件名，尝试在resources目录中查找
                    if (!imagePath.contains("/") && !imagePath.contains("\\")) {
                        logger.info("检测到只有文件名，尝试在resources/portraits目录中查找: " + imagePath);
                        // 只有文件名，尝试在resources/portraits目录中查找
                        File portraitFile = new File(PORTRAITS_DIR, imagePath);
                        logger.info("查找文件: " + portraitFile.getAbsolutePath());
                        if (portraitFile.exists()) {
                            portrait.setImagePath(portraitFile.getAbsolutePath());

                            // 创建缩略图
                            String thumbnailPath = createThumbnail(portrait, portraitFile);
                            portrait.setThumbnailPath(thumbnailPath);
                            logger.info("从文件名创建缩略图: " + thumbnailPath);
                        } else {
                            logger.warning("在resources/portraits目录中找不到文件: " + imagePath);
                        }
                    }
                    // 检查是否是相对路径（从resource文件夹开始）
                    else if (!imagePath.startsWith("/") && !imagePath.startsWith(":\\")) {
                        logger.info("检测到相对路径: " + imagePath);
                        // 如果是相对路径，构建绝对路径
                        // 获取resources目录的绝对路径
                        // 如果路径以文件名开始（不包含路径分隔符），则假设是characters文件夹下的文件
                        if (!imagePath.contains("/") && !imagePath.contains("\\")) {
                            logger.info("检测到只有文件名，尝试在resources/portraits目录中查找: " + imagePath);
                            // 只有文件名，尝试在resources/portraits目录中查找
                            File portraitFile = new File(PORTRAITS_DIR, imagePath);
                            if (portraitFile.exists()) {
                                portrait.setImagePath(portraitFile.getAbsolutePath());

                                // 创建缩略图
                                String thumbnailPath = createThumbnail(portrait, portraitFile);
                                portrait.setThumbnailPath(thumbnailPath);
                                logger.info("从文件名创建缩略图: " + thumbnailPath);
                            } else {
                                // 尝试在classpath中查找
                                String resourcePath = "assets/characters/" + imagePath;
                                logger.info("尝试从classpath加载资源: " + resourcePath);
                                InputStream is = getClass().getClassLoader().getResourceAsStream(resourcePath);
                                if (is != null) {
                                    is.close();
                                    logger.info("在classpath中找到资源: " + resourcePath);
                                    // 使用classpath资源创建临时文件
                                    File tempFile = File.createTempFile("portrait_", "_" + portrait.getPortName());
                                    try (InputStream resourceStream = getClass().getClassLoader()
                                            .getResourceAsStream(resourcePath)) {
                                        Files.copy(resourceStream, tempFile.toPath(),
                                                java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                        portrait.setImagePath(tempFile.getAbsolutePath());

                                        // 创建缩略图
                                        String thumbnailPath = createThumbnail(portrait, tempFile);
                                        portrait.setThumbnailPath(thumbnailPath);
                                        logger.info("从classpath资源创建缩略图: " + thumbnailPath);
                                    }
                                } else {
                                    logger.warning("在classpath中未找到资源: " + resourcePath);
                                }
                            }
                        }
                        // 如果路径包含characters，但不包含resources前缀
                        else if (imagePath.startsWith("characters/") || imagePath.startsWith("characters\\")) {
                            logger.info("路径包含characters前缀，添加resources/assets前缀: " + imagePath);
                            // 添加resources/assets前缀
                            String normalizedPath = imagePath.replace("\\", "/");
                            String fullPath = "resources/assets/" + normalizedPath;

                            // 尝试在classpath中查找
                            String resourcePath = fullPath.substring("resources/".length());
                            logger.info("尝试从classpath加载资源: " + resourcePath);
                            InputStream is = getClass().getClassLoader().getResourceAsStream(resourcePath);
                            if (is != null) {
                                is.close();
                                logger.info("在classpath中找到资源: " + resourcePath);
                                // 使用classpath资源创建临时文件
                                File tempFile = File.createTempFile("portrait_", "_" + portrait.getPortName());
                                try (InputStream resourceStream = getClass().getClassLoader()
                                        .getResourceAsStream(resourcePath)) {
                                    Files.copy(resourceStream, tempFile.toPath(),
                                            java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                    portrait.setImagePath(tempFile.getAbsolutePath());

                                    // 创建缩略图
                                    String thumbnailPath = createThumbnail(portrait, tempFile);
                                    portrait.setThumbnailPath(thumbnailPath);
                                    logger.info("从classpath资源创建缩略图: " + thumbnailPath);
                                }
                            } else {
                                logger.warning("在classpath中未找到资源: " + resourcePath);
                            }
                        }
                        // 如果路径已经包含"resources/"或"resources\"，直接使用
                        else if (imagePath.startsWith("resources/") || imagePath.startsWith("resources\\")) {
                            logger.info("路径包含resources前缀，直接使用: " + imagePath);
                            // 将Windows路径转换为标准路径
                            String normalizedPath = imagePath.replace("\\", "/");
                            // 直接使用相对路径
                            File fullFile = new File(normalizedPath);

                            // 如果是resources/assets/characters路径，尝试在classpath中查找
                            if (normalizedPath.startsWith("resources/assets/characters/")) {
                                String resourcePath = normalizedPath.substring("resources/".length());
                                logger.info("尝试从classpath加载资源: " + resourcePath);
                                try (InputStream is = getClass().getClassLoader().getResourceAsStream(resourcePath)) {
                                    if (is != null) {
                                        logger.info("在classpath中找到资源: " + resourcePath);
                                        // 使用classpath资源创建临时文件
                                        File tempFile = File.createTempFile("portrait_", "_" + portrait.getPortName());
                                        Files.copy(is, tempFile.toPath(),
                                                java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                        portrait.setImagePath(tempFile.getAbsolutePath());

                                        // 创建缩略图
                                        String thumbnailPath = createThumbnail(portrait, tempFile);
                                        portrait.setThumbnailPath(thumbnailPath);
                                        logger.info("从classpath资源创建缩略图: " + thumbnailPath);
                                    } else {
                                        logger.warning("在classpath中未找到资源: " + resourcePath);
                                    }

                                }
                                if (fullFile.exists()) {
                                    portrait.setImagePath(fullFile.getAbsolutePath());

                                    // 创建缩略图
                                    String thumbnailPath = createThumbnail(portrait, fullFile);
                                    portrait.setThumbnailPath(thumbnailPath);
                                    logger.info("从相对路径创建缩略图: " + thumbnailPath);
                                } else {
                                    logger.warning("文件不存在: " + fullFile.getAbsolutePath());
                                }
                            } else {
                                // 获取resources目录的绝对路径
                                logger.info("路径不包含resources/前缀，尝试获取resources目录");
                                String resourcePath = getClass().getClassLoader().getResource("").getPath();
                                if (resourcePath.startsWith("file:")) {
                                    resourcePath = resourcePath.substring(5); // 移除"file:"前缀
                                }
                                logger.info("获取到resources目录: " + resourcePath);

                                // 构建完整的文件路径
                                File resourceFile = new File(resourcePath, imagePath);
                                logger.info("构建完整文件路径: " + resourceFile.getAbsolutePath());
                                if (resourceFile.exists()) {
                                    portrait.setImagePath(resourceFile.getAbsolutePath());

                                    // 创建缩略图
                                    String thumbnailPath = createThumbnail(portrait, resourceFile);
                                    portrait.setThumbnailPath(thumbnailPath);
                                    logger.info("从绝对路径创建缩略图: " + thumbnailPath);
                                } else {
                                    logger.warning("文件不存在: " + resourceFile.getAbsolutePath());
                                }
                            }
                        } else {
                            // 处理绝对路径
                            logger.info("检测到绝对路径: " + imagePath);
                            File sourceImage = new File(imagePath);
                            if (sourceImage.exists()) {
                                // 创建缩略图
                                String thumbnailPath = createThumbnail(portrait, sourceImage);
                                portrait.setThumbnailPath(thumbnailPath);
                                logger.info("创建缩略图: " + thumbnailPath);
                            } else {
                                logger.warning("图片文件不存在: " + imagePath);
                            }
                        }
                    }
                }
            } else {
                // 即使imagePath为空，也要保存立绘信息
                logger.info("立绘图片路径为空，仅保存立绘元数据");
                // 设置默认缩略图路径
                portrait.setThumbnailPath("");
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
            logger.info("立绘详细信息:");
            logger.info("- 立绘ID: " + portraitId);
            logger.info("- 角色ID: " + characterId);
            logger.info("- 图片路径: " + portrait.getImagePath());
            logger.info("- 情绪: " + portrait.getEmotionName());
            logger.info("- 面部位置: X=" + portrait.getFaceX() + ", Y=" + portrait.getFaceY());
            logger.info("- 调整位置: X=" + portrait.getAdjX() + ", Y=" + portrait.getAdjY());
            logger.info("- 长度: " + portrait.getLength());
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
     * 设置默认立绘
     */
    @PutMapping("/characters/{characterId}/portraits/{portraitId}/default")
    public List<Portrait> setDefaultPortrait(@PathVariable String characterId, @PathVariable String portraitId) {
        try {
            logger.info("设置默认立绘: 角色ID=" + characterId + ", 立绘ID=" + portraitId);
            
            // 获取角色的所有立绘
            List<Portrait> portraits = jdbi.withExtension(PortraitDAO.class, dao -> dao.findByCharacterId(characterId));
            
            // 找到要设为默认的立绘
            Portrait defaultPortrait = null;
            List<Portrait> otherPortraits = new ArrayList<>();
            
            for (Portrait portrait : portraits) {
                if (portrait.getPortraitID().equals(portraitId)) {
                    defaultPortrait = portrait;
                } else {
                    otherPortraits.add(portrait);
                }
            }
            
            if (defaultPortrait == null) {
                throw new RuntimeException("找不到指定的立绘: " + portraitId);
            }
            
            // 创建新的立绘顺序，默认立绘在前
            List<Portrait> newOrder = new ArrayList<>();
            newOrder.add(defaultPortrait);
            newOrder.addAll(otherPortraits);
            
            // 更新数据库中立绘的顺序
            jdbi.useExtension(PortraitDAO.class, dao -> {
                // 先删除所有立绘关联
                dao.deleteCharacterPortraits(characterId);
                // 按新顺序重新保存立绘关联
                dao.saveCharacterPortraits(characterId, newOrder);
            });
            
            logger.info("成功设置默认立绘: " + portraitId);
            return newOrder;
        } catch (Exception e) {
            logger.severe("设置默认立绘失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("设置默认立绘失败: " + e.getMessage());
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