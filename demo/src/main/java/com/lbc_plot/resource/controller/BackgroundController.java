package com.lbc_plot.resource.controller;

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

import com.lbc_plot.resource.dao.BackgroundDAO;
import com.lbc_plot.resource.model.Background;
import com.lbc_plot.resource.service.StorageService;

import org.jdbi.v3.core.Jdbi;

import com.lbc_plot.config.AppConfig;

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
public class BackgroundController {

    private static final Logger logger = LoggerFactory.getLogger(BackgroundController.class);

    @Autowired
    private Jdbi jdbi;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private StorageService storageService;

    @Autowired
    private AppConfig appConfig;

    /**
     * 获取所有背景
     */
    @GetMapping("/backgrounds")
    public List<Background> getBackgrounds() {
        logger.info("获取所有背景");
        return jdbi.withExtension(BackgroundDAO.class, BackgroundDAO::getAllBackgrounds);
    }

    /**
     * 获取单个背景
     */
    @GetMapping("/backgrounds/{id}")
    public Background getBackground(@PathVariable String id) {
        logger.info("获取背景: " + id);
        Background background = jdbi.withExtension(BackgroundDAO.class, dao -> dao.getById(id));
        if (background == null) {
            logger.warn("背景不存在: " + id);
            throw new RuntimeException("背景不存在: " + id);
        }
        return background;
    }

    // 背景原图和缩略图均通过 Spring 静态资源映射 /assets/** 直接访问
    // (WebMvcConfig 已配置 file:assets/ + classpath:assets/)，无需单独的 controller 端点。
    // 原 GET /backgrounds/{filename:.+} 与 GET /backgrounds/{id} 存在 Spring MVC 路由歧义
    // (Ambiguous handler methods)，已移除，统一走 /assets/backgrounds/xxx。

    /**
     * 上传背景缩略图（保存到 backgrounds/thumbnails/ 目录）
     */
    @PostMapping("/backgrounds/{id}/thumbnail")
    public Background uploadThumbnail(@PathVariable String id, @RequestParam("file") MultipartFile file) {
        try {
            logger.info("上传背景缩略图: " + id + ", 文件: " + file.getOriginalFilename());

            Background background = jdbi.withExtension(BackgroundDAO.class, dao -> dao.getById(id));
            if (background == null) {
                throw new RuntimeException("背景不存在: " + id);
            }

            // 上传缩略图文件，返回 /assets/backgrounds/thumbnails/xxx 路径
            String thumbnailUrlPath = storageService.uploadBackgroundThumbnail(file, id);
            background.setThumbnailPath(thumbnailUrlPath);
            return saveBackgroundToDatabase(background);
        } catch (Exception e) {
            logger.error("上传缩略图失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("上传缩略图失败: " + e.getMessage());
        }
    }

    /**
     * 上传背景文件
     * 返回保存后的文件名，供前端再调用 POST /backgrounds 或 PUT /backgrounds/{id} 存入 DB。
     * 如果未提供 name 参数，则使用原文件名 stem。
     */
    @PostMapping("/backgrounds/upload")
    public BackgroundUploadResponse uploadBackground(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "name", required = false) String name) {
        try {
            logger.info("上传背景文件: {}, name参数: {}", file.getOriginalFilename(), name);
            String filename = storageService.uploadBackgroundFile(file, name);

            // 原图访问 URL：/assets/backgrounds/{filename}
            String imageUrlPath = "/assets/backgrounds/" + filename;
            // 自动生成缩略图访问 URL：/assets/backgrounds/thumbnails/thumb_{filename}
            String thumbUrlPath = "/assets/backgrounds/thumbnails/thumb_" + filename;

            logger.info("背景上传完成，原图路径: {}, 缩略图路径: {}", imageUrlPath, thumbUrlPath);
            return new BackgroundUploadResponse(filename, imageUrlPath, thumbUrlPath);
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

    /** 上传背景文件响应：返回保存的文件名 + 可直接访问的 URL 路径 */
    public static class BackgroundUploadResponse {
        private final String filename;
        private final String imagePath;
        private final String autoThumbnailPath;

        public BackgroundUploadResponse(String filename, String imagePath, String autoThumbnailPath) {
            this.filename = filename;
            this.imagePath = imagePath;
            this.autoThumbnailPath = autoThumbnailPath;
        }

        public String getFilename() {
            return filename;
        }

        public String getImagePath() {
            return imagePath;
        }

        public String getAutoThumbnailPath() {
            return autoThumbnailPath;
        }
    }

    /**
     * 判断数据库中保存的 path / thumbnailPath 是否对应磁盘上存在的文件。
     * 支持多种前缀：无前缀、assets/、/assets/、./assets/
     */
    private boolean pathExistsOnDisk(String dbPath) {
        if (dbPath == null || dbPath.isEmpty())
            return false;
        String normalized = dbPath;
        if (normalized.startsWith("/assets/")) {
            normalized = normalized.substring("/assets/".length());
        } else if (normalized.startsWith("assets/")) {
            normalized = normalized.substring("assets/".length());
        } else if (normalized.startsWith("./assets/")) {
            normalized = normalized.substring("./assets/".length());
        }
        File f = new File(appConfig.getAssets().getPath(), normalized);
        boolean exists = f.exists() && f.isFile();
        logger.debug("路径判断: raw={} -> normalized={} -> disk={}, exists={}",
                dbPath, normalized, f.getAbsolutePath(), exists);
        return exists;
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

            // 验证背景文件是否存在（只记录日志，不阻塞保存）
            if (background.getPath() != null && !background.getPath().isEmpty()) {
                boolean exists = pathExistsOnDisk(background.getPath());
                if (!exists) {
                    logger.warn("背景资源不存在（磁盘找不到）: " + background.getPath());
                } else {
                    logger.info("背景资源存在: " + background.getPath());
                }
            }

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

            // 过滤掉前端临时的 blob: URL，防止 DB 存无效地址（用户若显式上传了缩略图则缩略图路径是 /assets/... 开头的真实 URL）
            if (background.getThumbnailPath() != null
                    && background.getThumbnailPath().startsWith("blob:")) {
                logger.warn("检测到临时 blob: 缩略图 URL，清空该字段以避免存入库中");
                background.setThumbnailPath(null);
            }

            // 验证背景文件存在性
            if (background.getPath() != null && !background.getPath().isEmpty()) {
                boolean exists = pathExistsOnDisk(background.getPath());
                if (!exists) {
                    logger.warn("背景资源不存在（磁盘找不到）: " + background.getPath());
                } else {
                    logger.info("背景资源存在: " + background.getPath());
                }
            }

            logger.info("准备保存到数据库的背景对象: UUID=" + background.getUuid() +
                    ", 名称=" + background.getName() +
                    ", 路径=" + background.getPath() +
                    ", 缩略图路径=" + background.getThumbnailPath());

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
            logger.info("删除背景: " + id + ", 删除文件: " + deleteFile);

            // 获取背景信息
            Background background = jdbi.withExtension(BackgroundDAO.class, dao -> dao.getById(id));
            if (background == null) {
                logger.warn("背景不存在: " + id);
                return;
            }

            // 从数据库删除
            jdbi.useExtension(BackgroundDAO.class, dao -> dao.delete(id));
            logger.info("背景已从数据库删除: " + id);

            // 如果需要，删除文件（原图 + 缩略图）
            if (deleteFile) {
                deleteDiskFileByPath(background.getPath(), "背景原图");
                deleteDiskFileByPath(background.getThumbnailPath(), "背景缩略图");
            }
        } catch (Exception e) {
            logger.error("删除背景失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("删除背景失败: " + e.getMessage());
        }
    }

    /**
     * 从磁盘删除一个资源文件（路径可带 /assets/ 前缀）
     */
    private void deleteDiskFileByPath(String dbPath, String fileKind) {
        if (dbPath == null || dbPath.isEmpty())
            return;
        try {
            // 规范化：去掉 /assets/ 或 assets/ 前缀后按 appConfig.assets.path 拼接
            String normalized = dbPath;
            if (normalized.startsWith("/assets/")) {
                normalized = normalized.substring("/assets/".length());
            } else if (normalized.startsWith("assets/")) {
                normalized = normalized.substring("assets/".length());
            } else if (normalized.startsWith("./assets/")) {
                normalized = normalized.substring("./assets/".length());
            }
            File file = new File(appConfig.getAssets().getPath(), normalized);
            if (file.exists()) {
                if (file.delete()) {
                    logger.info(fileKind + "已删除: " + file.getAbsolutePath());
                } else {
                    logger.warn("无法删除" + fileKind + ": " + file.getAbsolutePath());
                }
            } else {
                logger.info(fileKind + "磁盘不存在，跳过: " + file.getAbsolutePath());
            }
        } catch (Exception e) {
            logger.warn("删除" + fileKind + "时出错: " + e.getMessage());
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
