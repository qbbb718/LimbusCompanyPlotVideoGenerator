package com.lbc_plot.plot.controller;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.lbc_plot.common.util.RuntimePaths;

/**
 * 临时图片控制器
 *
 * 处理 NPC、道具等非角色管理图片的上传/删除。
 * 文件存储在 ./projects/temp/images/ 下，
 * 通过 WebMvcConfig 的 /projects/** 静态映射对外访问。
 */
@RestController
@RequestMapping("/api")
public class TempImageController {

    private static final Logger logger = LoggerFactory.getLogger(TempImageController.class);

    private static final String TEMP_IMAGES_DIR = RuntimePaths.toPortableString(
            RuntimePaths.getTempDir().resolve("images")) + "/";
    private static final long MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

    /**
     * 上传临时图片
     *
     * @param file 图片文件（MultipartFile）
     * @return { uuid, imagePath, url }
     */
    @PostMapping("/temp-images/upload")
    public ResponseEntity<Map<String, String>> uploadTempImage(@RequestParam("file") MultipartFile file) {
        Map<String, String> result = new HashMap<>();

        try {
            // 校验文件
            if (file.isEmpty()) {
                result.put("error", "文件为空");
                return ResponseEntity.badRequest().body(result);
            }
            if (file.getSize() > MAX_FILE_SIZE) {
                result.put("error", "文件过大，最大支持 50MB");
                return ResponseEntity.badRequest().body(result);
            }

            String contentType = file.getContentType();
            if (contentType == null || !contentType.startsWith("image/")) {
                result.put("error", "仅支持图片文件");
                return ResponseEntity.badRequest().body(result);
            }

            // 确保目录存在
            File dir = new File(TEMP_IMAGES_DIR);
            if (!dir.exists()) {
                dir.mkdirs();
                logger.info("创建临时图片目录: {}", dir.getAbsolutePath());
            }

            // 生成唯一文件名
            String originalName = file.getOriginalFilename();
            String ext = ".png";
            if (originalName != null && originalName.contains(".")) {
                ext = originalName.substring(originalName.lastIndexOf('.'));
                if (ext.length() > 5)
                    ext = ".png"; // 过长扩展名回退
            }
            String uuid = UUID.randomUUID().toString();
            String filename = uuid + ext;

            // 保存文件
            Path destPath = Paths.get(TEMP_IMAGES_DIR, filename);
            Files.copy(file.getInputStream(), destPath, StandardCopyOption.REPLACE_EXISTING);
            logger.info("临时图片已保存: {}", destPath.toAbsolutePath());

            // 相对路径（用于 Record 序列化）
            String relativePath = TEMP_IMAGES_DIR + filename; // e.g. "./projects/temp/images/uuid.png"
            // HTTP 可访问路径（通过 WebMvcConfig /projects/** 映射）
            String urlPath = "/projects/temp/images/" + filename;

            result.put("uuid", uuid);
            result.put("imagePath", relativePath);
            result.put("url", urlPath);
            return ResponseEntity.ok(result);

        } catch (IOException e) {
            logger.error("上传临时图片失败", e);
            result.put("error", "上传失败: " + e.getMessage());
            return ResponseEntity.internalServerError().body(result);
        }
    }

    /**
     * 删除临时图片文件
     *
     * @param uuid 图片的 UUID（文件名前缀）
     * @return { success: boolean }
     */
    @DeleteMapping("/temp-images/{uuid}")
    public ResponseEntity<Map<String, Boolean>> deleteTempImage(@PathVariable String uuid) {
        Map<String, Boolean> result = new HashMap<>();

        try {
            File dir = new File(TEMP_IMAGES_DIR);
            if (!dir.exists()) {
                result.put("success", true); // 目录不存在，视为已删除
                return ResponseEntity.ok(result);
            }

            // 查找匹配 uuid 的文件（扩展名可能不同）
            File[] files = dir.listFiles((d, name) -> name.startsWith(uuid));
            if (files != null) {
                for (File f : files) {
                    if (f.delete()) {
                        logger.info("已删除临时图片: {}", f.getAbsolutePath());
                    } else {
                        logger.warn("删除临时图片失败: {}", f.getAbsolutePath());
                    }
                }
            }

            result.put("success", true);
            return ResponseEntity.ok(result);

        } catch (Exception e) {
            logger.error("删除临时图片失败: uuid={}", uuid, e);
            result.put("success", false);
            return ResponseEntity.internalServerError().body(result);
        }
    }
}
