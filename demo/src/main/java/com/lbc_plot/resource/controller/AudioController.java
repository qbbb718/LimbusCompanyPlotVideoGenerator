package com.lbc_plot.resource.controller;

import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.logging.Logger;
import java.io.File;
import java.nio.file.Paths;
import java.nio.file.Files;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
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

import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.resource.dao.AudioDAO;
import com.lbc_plot.resource.model.Audio;
import com.lbc_plot.resource.service.StorageService;

import org.jdbi.v3.core.Jdbi;

/**
 * 音频资源API控制器
 */
@RestController
@RequestMapping("/api")
public class AudioController {

    private static final Logger logger = Logger.getLogger(AudioController.class.getName());

    // 音频资源目录：运行时素材目录下的 audios（绝对路径，由 RuntimePaths 解析），
    // 不再写成 "resources/audios" 这种既不是仓库真实布局、也无法按 URL 前缀解析的相对路径。
    private static final String AUDIOS_DIR = RuntimePaths.toPortableString(RuntimePaths.getAudiosDir());

    /** 音频对外访问的 URL 前缀 */
    private static final String AUDIOS_URL_PREFIX = "/assets/audios/";

    @Autowired
    private Jdbi jdbi;

    @Autowired
    private StorageService storageService;

    /**
     * 上传音频文件。
     *
     * <p>仿照 {@code POST /api/backgrounds/upload} 的两步流程：先上传文件拿到真实落盘的
     * URL 路径，再调用 {@code POST /api/audios} 把该路径写入数据库。
     *
     * <p>之所以必须新增这个接口：音频此前只有元数据接口，前端只能把"浏览器里拿不到的本地
     * 绝对路径"或自身拼出来的 {@code /assets/audios/...} 直接当文件路径入库，文件从未落盘，
     * 播放与视频导出都取不到音频。
     *
     * @param file 音频文件
     * @param name 可选名称（不含扩展名）；为空时取原文件名
     * @return { filename, path, originalFilename }
     */
    @PostMapping("/audios/upload")
    public ResponseEntity<Map<String, String>> uploadAudio(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "name", required = false) String name) {
        try {
            long fileSizeBytes = file.getSize();
            logger.info("收到音频文件上传请求: 文件名=" + file.getOriginalFilename()
                    + ", 大小=" + fileSizeBytes + " bytes, name参数=" + name
                    + ", ContentType=" + file.getContentType());

            String filename = storageService.uploadAudioFile(file, name);
            String urlPath = AUDIOS_URL_PREFIX + filename;

            logger.info("音频上传完成, 落盘路径: " + urlPath);

            Map<String, String> result = new HashMap<>();
            result.put("filename", filename);
            result.put("path", urlPath);
            result.put("originalFilename", file.getOriginalFilename());
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            // 参数/格式问题属于用户可修正的错误，返回 400 而不是 500
            logger.warning("音频上传参数校验失败: " + e.getMessage());
            Map<String, String> error = new HashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        } catch (Exception e) {
            logger.severe("上传音频文件失败: " + e.getMessage());
            e.printStackTrace();
            Map<String, String> error = new HashMap<>();
            error.put("error", "上传音频文件失败: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    /**
     * 获取所有音频
     */
    @GetMapping("/audios")
    public List<Audio> getAudios() {
        try {
            logger.info("获取所有音频");
            List<Audio> audios = AudioDAO.getAllAudios();
            logger.info("成功获取 " + audios.size() + " 个音频");
            return audios;
        } catch (Exception e) {
            logger.severe("获取音频失败: " + e.getMessage());
            e.printStackTrace();
            return new ArrayList<>();
        }
    }

    /**
     * 添加音频
     */
    @PostMapping("/audios")
    public Audio addAudio(@RequestBody Audio audio) {
        try {
            logger.info("添加新音频: " + audio.getName());

            // 确保音频目录存在
            File audiosDir = new File(AUDIOS_DIR);
            if (!audiosDir.exists()) {
                audiosDir.mkdirs();
                logger.info("创建音频目录: " + audiosDir.getAbsolutePath());
            }

            // 验证音频文件是否存在
            if (audio.getPath() != null && !audio.getPath().isEmpty()) {
                File audioFile = resolveAudioFile(audio.getPath());
                if (!audioFile.exists()) {
                    logger.warning("音频文件不存在: " + audioFile.getAbsolutePath());
                }
            }

            AudioDAO.addAudio(audio);
            logger.info("成功添加音频: " + audio.getName());
            return audio;
        } catch (Exception e) {
            logger.severe("添加音频失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("添加音频失败: " + e.getMessage());
        }
    }

    /**
     * 更新音频
     */
    @PutMapping("/audios/{id}")
    public Audio updateAudio(@PathVariable String id, @RequestBody Audio audio) {
        try {
            logger.info("更新音频: " + audio.getName());
            audio.setUuid(id);

            // 验证音频文件是否存在
            if (audio.getPath() != null && !audio.getPath().isEmpty()) {
                File audioFile = resolveAudioFile(audio.getPath());
                if (!audioFile.exists()) {
                    logger.warning("音频文件不存在: " + audioFile.getAbsolutePath());
                }
            }

            AudioDAO.updateAudio(audio);
            logger.info("成功更新音频: " + audio.getName());
            return audio;
        } catch (Exception e) {
            logger.severe("更新音频失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("更新音频失败: " + e.getMessage());
        }
    }

    /**
     * 删除音频
     */
    @DeleteMapping("/audios/{id}")
    public void deleteAudio(@PathVariable String id) {
        try {
            logger.info("删除音频: " + id);

            // 先获取音频信息，以便删除文件
            Audio audio = AudioDAO.getById(id);
            if (audio != null && audio.getPath() != null) {
                File audioFile = resolveAudioFile(audio.getPath());
                if (audioFile.exists()) {
                    audioFile.delete();
                    logger.info("已删除音频文件: " + audioFile.getAbsolutePath());
                }
            }

            AudioDAO.deleteAudio(id);
            logger.info("成功删除音频: " + id);
        } catch (Exception e) {
            logger.severe("删除音频失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("删除音频失败: " + e.getMessage());
        }
    }

    /**
     * 获取音频文件
     */
    @GetMapping("/audios/{id}/file")
    public org.springframework.http.ResponseEntity<org.springframework.core.io.Resource> getAudioFile(
            @PathVariable String id) {
        try {
            logger.info("获取音频文件: " + id);

            // 获取音频信息
            Audio audio = AudioDAO.getById(id);
            if (audio == null || audio.getPath() == null) {
                logger.warning("音频不存在或路径为空: " + id);
                return org.springframework.http.ResponseEntity.notFound().build();
            }

            // 构建文件路径（兼容库中存的 URL 形式 /assets/audios/xxx.wav）
            java.nio.file.Path filePath = resolveAudioFile(audio.getPath()).toPath();
            if (!Files.exists(filePath)) {
                logger.warning("音频文件不存在: " + filePath.toAbsolutePath());
                return org.springframework.http.ResponseEntity.notFound().build();
            }

            // 创建资源
            org.springframework.core.io.Resource resource = new org.springframework.core.io.FileSystemResource(
                    filePath);

            // 确定内容类型
            String contentType = "audio/mpeg"; // 默认MP3
            try {
                String filename = audio.getPath().toLowerCase();
                if (filename.endsWith(".wav")) {
                    contentType = "audio/wav";
                } else if (filename.endsWith(".ogg")) {
                    contentType = "audio/ogg";
                } else if (filename.endsWith(".m4a")) {
                    contentType = "audio/mp4";
                }
            } catch (Exception e) {
                logger.warning("无法确定音频内容类型: " + e.getMessage());
            }

            return org.springframework.http.ResponseEntity.ok()
                    .contentType(org.springframework.http.MediaType.parseMediaType(contentType))
                    .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                            "inline; filename=\"" + audio.getName() + "\"")
                    .body(resource);
        } catch (Exception e) {
            logger.severe("获取音频文件失败: " + e.getMessage());
            e.printStackTrace();
            return org.springframework.http.ResponseEntity.internalServerError().build();
        }
    }

    /**
     * 把数据库中保存的音频路径解析为磁盘文件。
     *
     * <p>历史上音频表的 path 字段混用过三种形式，这里统一处理：
     * <ul>
     *   <li>URL 形式 {@code /assets/audios/xxx.wav} 或 {@code assets/audios/xxx.wav}
     *       —— 按运行时素材目录解析。此前直接 {@code new File(path)}，在 Windows 上会被
     *       当成盘符根目录 {@code C:\assets\audios\xxx.wav}，永远找不到文件；</li>
     *   <li>绝对路径 —— 原样使用；</li>
     *   <li>裸文件名 / 其它相对路径 —— 相对音频目录解析。</li>
     * </ul>
     */
    private static File resolveAudioFile(String path) {
        String normalized = path.replace('\\', '/').trim();

        if (normalized.startsWith("/assets/")) {
            normalized = normalized.substring("/assets/".length());
        } else if (normalized.startsWith("assets/")) {
            normalized = normalized.substring("assets/".length());
        }

        File candidate = new File(normalized);
        if (candidate.isAbsolute()) {
            return candidate;
        }
        return new File(RuntimePaths.getAssetsDir().toFile(), normalized);
    }

    /**
     * 初始化音频系统
     */
    @GetMapping("/init-audio")
    public Map<String, Object> initAudio() {
        try {
            logger.info("初始化音频系统");

            // 确保音频目录存在
            File audiosDir = new File(AUDIOS_DIR);
            if (!audiosDir.exists()) {
                audiosDir.mkdirs();
                logger.info("创建音频目录: " + audiosDir.getAbsolutePath());
            }

            Map<String, Object> response = new HashMap<>();
            response.put("status", "success");
            response.put("message", "音频系统初始化成功");

            logger.info("音频系统初始化成功");
            return response;
        } catch (Exception e) {
            logger.severe("初始化音频系统失败: " + e.getMessage());
            e.printStackTrace();

            Map<String, Object> response = new HashMap<>();
            response.put("status", "error");
            response.put("message", "音频系统初始化失败: " + e.getMessage());

            return response;
        }
    }
}
