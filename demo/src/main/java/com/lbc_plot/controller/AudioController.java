package com.lbc_plot.controller;

import java.util.List;
import java.util.ArrayList;

import org.springframework.beans.factory.annotation.Autowired;
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
public class AudioController {
    
    @Autowired
    private Jdbi jdbi;

    /**
     * 获取所有音频
     */
    @GetMapping("/audios")
    public List<Audio> getAudios() {
        try {
            return jdbi.withExtension(AudioDAO.class, dao -> dao.getAllAudios());
        } catch (Exception e) {
            System.err.println("获取音频失败: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * 添加音频
     */
    @PostMapping("/audios")
    public Audio addAudio(@RequestBody Audio audio) {
        try {
            jdbi.useExtension(AudioDAO.class, dao -> dao.addAudio(audio));
            return audio;
        } catch (Exception e) {
            System.err.println("添加音频失败: " + e.getMessage());
            throw new RuntimeException("添加音频失败: " + e.getMessage());
        }
    }

    /**
     * 更新音频
     */
    @PutMapping("/audios/{id}")
    public Audio updateAudio(@PathVariable String id, @RequestBody Audio audio) {
        try {
            audio.setUuid(id);
            jdbi.useExtension(AudioDAO.class, dao -> dao.updateAudio(audio));
            return audio;
        } catch (Exception e) {
            System.err.println("更新音频失败: " + e.getMessage());
            throw new RuntimeException("更新音频失败: " + e.getMessage());
        }
    }

    /**
     * 删除音频
     */
    @DeleteMapping("/audios/{id}")
    public void deleteAudio(@PathVariable String id) {
        try {
            jdbi.useExtension(AudioDAO.class, dao -> dao.deleteAudio(id));
        } catch (Exception e) {
            System.err.println("删除音频失败: " + e.getMessage());
            throw new RuntimeException("删除音频失败: " + e.getMessage());
        }
    }
}
