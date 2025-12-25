package com.lbc_plot.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.multipart.MultipartFile;

import com.lbc_plot.model.storage.Background;
import com.lbc_plot.DAO.BackgroundDAO;
import com.lbc_plot.service.StorageService;
import org.jdbi.v3.core.Jdbi;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import java.util.ArrayList;

/**
 * 背景资源API控制器
 * 使用成熟的存储服务处理文件上传和访问
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = { "http://localhost:3000", "http://127.0.0.1:3000" })
public class BackgroundController {

    private static final Logger logger = LoggerFactory.getLogger(BackgroundController.class);

    @Autowired
    private Jdbi jdbi;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private StorageService storageService;

    /**
     * 获取所有背景
     */
    @GetMapping("/backgrounds")
    public List<Background> getBackgrounds() {
        logger.info("获取所有背景");
        return jdbi.withExtension(BackgroundDAO.class, BackgroundDAO::getAllBackgrounds);
    }

    /**
     * 获取背景资源
     */
    @GetMapping("/backgrounds/{filename:.+}")
    public ResponseEntity<Resource> getBackgroundResource(@PathVariable String filename) {
        logger.info("获取背景资源: " + filename);

        // 构建资源路径
        String resourcePath = "assets/backgrounds/" + filename;
        Resource resource = storageService.getResource(resourcePath);

        // 检查资源是否存在
        if (!resource.exists() || !resource.isReadable()) {
            logger.warn("背景资源不存在或不可读: " + resourcePath);
            return ResponseEntity.notFound().build();
        }

        // 确定内容类型
        String contentType = "application/octet-stream";
        try {
            contentType = resource.getURL().openConnection().getContentType();
        } catch (IOException e) {
            logger.warn("无法确定内容类型: " + e.getMessage());
        }

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
                .body(resource);
    }

    /**
     * 获取背景缩略图
     */
    @GetMapping("/backgrounds/thumbnails/{filename:.+}")
    public ResponseEntity<Resource> getBackgroundThumbnail(@PathVariable String filename) {
        logger.info("获取背景缩略图: " + filename);

        // 构建资源路径
        String resourcePath = "assets/thumbnails/" + filename;
        Resource resource = storageService.getResource(resourcePath);

        // 检查资源是否存在
        if (!resource.exists() || !resource.isReadable()) {
            logger.warn("背景缩略图不存在或不可读: " + resourcePath);
            return ResponseEntity.notFound().build();
        }

        // 确定内容类型
        String contentType = "application/octet-stream";
        try {
            contentType = resource.getURL().openConnection().getContentType();
        } catch (IOException e) {
            logger.warn("无法确定内容类型: " + e.getMessage());
        }

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
                .body(resource);
    }

    /**
     * 上传背景文件
     */
    @PostMapping("/backgrounds/upload")
    public Background uploadBackground(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "name", required = false) String name,
            @RequestParam(value = "tags", required = false) String tags) {
        try {
            logger.info("上传背景文件: " + file.getOriginalFilename());

            // 上传文件并获取相对路径
            String filePath = storageService.uploadBackgroundFile(file, name);

            // 如果没有提供名称，使用原文件名（不带扩展名）
            if (name == null || name.trim().isEmpty()) {
                String originalFilename = file.getOriginalFilename();
                name = originalFilename.substring(0, originalFilename.lastIndexOf("."));
            }

            // 创建背景对象
            Background background = new Background(
                    UUID.randomUUID().toString(),
                    filePath,
                    name,
                    null // 缩略图路径由存储服务处理
            );

            // 处理标签
            if (tags != null && !tags.trim().isEmpty()) {
                String[] tagArray = tags.split(",");
                List<String> tagList = new ArrayList<>();
                for (String tag : tagArray) {
                    String trimmedTag = tag.trim();
                    if (!trimmedTag.isEmpty()) {
                        tagList.add(trimmedTag);
                    }
                }
                // 这里需要设置标签，但Background类目前没有setTags方法
                // 可能需要修改Background类或使用其他方式存储标签
            }

            // 保存到数据库
            return saveBackgroundToDatabase(background);
        } catch (IOException e) {
            logger.error("上传背景文件失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("上传背景文件失败: " + e.getMessage());
        } catch (Exception e) {
            logger.error("处理上传背景时发生错误: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("处理上传背景时发生错误: " + e.getMessage());
        }
    }

    /**
     * 添加背景
     */
    @PostMapping("/backgrounds")
    public Background addBackground(@RequestBody Background background) {
        try {
            logger.info("添加新背景: " + background.getName());
            logger.info("背景对象详细信息: UUID=" + background.getUuid() +
                    ", 名称=" + background.getName() +
                    ", 路径=" + background.getPath() +
                    ", 缩略图路径=" + background.getThumbnailPath());

            // 验证背景文件是否存在
            if (background.getPath() != null && !background.getPath().isEmpty()) {
                boolean exists = storageService.resourceExists(background.getPath());
                if (!exists) {
                    logger.warn("背景资源不存在: " + background.getPath());
                } else {
                    logger.info("背景资源存在: " + background.getPath());
                }
            }

            // 保存到数据库
            return saveBackgroundToDatabase(background);
        } catch (Exception e) {
            logger.error("添加背景失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("添加背景失败: " + e.getMessage());
        }
    }

    /**
     * 更新背景
     */
    @PutMapping("/backgrounds/{id}")
    public Background updateBackground(@PathVariable String id, @RequestBody Background background) {
        try {
            logger.info("更新背景: " + background.getName());
            logger.info("更新前背景对象详细信息: UUID=" + background.getUuid() +
                    ", 名称=" + background.getName() +
                    ", 路径=" + background.getPath() +
                    ", 缩略图路径=" + background.getThumbnailPath());

            // 处理blob缩略图URL
            if (background.getThumbnailPath() != null && background.getThumbnailPath().startsWith("blob:")) {
                logger.warn("检测到blob缩略图URL，当前版本不支持处理，将清空缩略图路径");
                background.setThumbnailPath(null);
            }

            // 验证背景文件是否存在
            if (background.getPath() != null && !background.getPath().isEmpty()) {
                boolean exists = storageService.resourceExists(background.getPath());
                if (!exists) {
                    logger.warn("背景资源不存在: " + background.getPath());
                } else {
                    logger.info("背景资源存在: " + background.getPath());
                }
            }

            logger.info("准备保存到数据库的背景对象: UUID=" + background.getUuid() +
                    ", 名称=" + background.getName() +
                    ", 路径=" + background.getPath() +
                    ", 缩略图路径=" + background.getThumbnailPath());

            // 保存到数据库
            return saveBackgroundToDatabase(background);
        } catch (Exception e) {
            logger.error("更新背景失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("更新背景失败: " + e.getMessage());
        }
    }

    /**
     * 删除背景
     */
    @DeleteMapping("/backgrounds/{id}")
    public void deleteBackground(@PathVariable String id,
            @RequestParam(required = false, defaultValue = "false") boolean deleteFile) {
        try {
            logger.info("删除背景: " + id);

            // 获取背景信息
            Background background = jdbi.withExtension(BackgroundDAO.class, dao -> dao.getById(id));
            if (background == null) {
                logger.warn("背景不存在: " + id);
                return;
            }

            // 从数据库删除
            jdbi.useExtension(BackgroundDAO.class, dao -> dao.delete(id));
            logger.info("背景已从数据库删除: " + id);

            // 如果需要，删除文件
            if (deleteFile && background.getPath() != null && !background.getPath().isEmpty()) {
                try {
                    // 尝试从资源中删除
                    Resource resource = storageService.getResource(background.getPath());
                    if (resource.exists()) {
                        File file = resource.getFile();
                        if (file.delete()) {
                            logger.info("背景文件已删除: " + background.getPath());
                        } else {
                            logger.warn("无法删除背景文件: " + background.getPath());
                        }
                    }
                } catch (IOException e) {
                    logger.warn("删除背景文件时出错: " + e.getMessage());
                }
            }
        } catch (Exception e) {
            logger.error("删除背景失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("删除背景失败: " + e.getMessage());
        }
    }

    /**
     * 将背景保存到数据库的通用方法
     */
    private Background saveBackgroundToDatabase(Background background) {
        try {
            logger.info("保存背景到数据库: " + background.getName());
            logger.info("背景对象详细信息: UUID=" + background.getUuid() +
                    ", 名称=" + background.getName() +
                    ", 路径=" + background.getPath() +
                    ", 缩略图路径=" + background.getThumbnailPath());

            return jdbi.withExtension(BackgroundDAO.class, dao -> {
                // 先检查是否已存在
                Background existingBg = dao.getById(background.getUuid());
                if (existingBg != null) {
                    // 更新现有记录
                    boolean updateResult = dao.updateBackground(background);
                    if (updateResult) {
                        logger.info("背景已更新到数据库");
                        return dao.getById(background.getUuid());
                    } else {
                        logger.warn("更新背景到数据库失败");
                        return existingBg;
                    }
                } else {
                    // 添加新记录
                    dao.addBackground(background);
                    logger.info("背景已添加到数据库");
                    return dao.getById(background.getUuid());
                }
            });
        } catch (Exception e) {
            logger.error("保存背景到数据库失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("保存背景到数据库失败: " + e.getMessage());
        }
    }
}
