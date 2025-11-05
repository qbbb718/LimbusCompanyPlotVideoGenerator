package com.lbc_plot.controller;

import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.logging.Logger;
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
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.model.storage.Audio;
import com.lbc_plot.DAO.AudioDAO;
import org.jdbi.v3.core.Jdbi;

/**
 * 音频资源API控制器
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = {"http://localhost:3000", "http://127.0.0.1:3000"})
public class AudioController {

    private static final Logger logger = Logger.getLogger(AudioController.class.getName());

    // 资源文件夹路径
    private static final String AUDIOS_DIR = "resources/audios";

    @Autowired
    private Jdbi jdbi;

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
                File audioFile = new File(audio.getPath());
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
                File audioFile = new File(audio.getPath());
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
                File audioFile = new File(audio.getPath());
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
