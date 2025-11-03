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

import com.lbc_plot.model.storage.Background;
import com.lbc_plot.DAO.BackgroundDAO;
import org.jdbi.v3.core.Jdbi;

/**
 * 背景资源API控制器
 */
@RestController
@RequestMapping("/api")
public class BackgroundController {
    
    @Autowired
    private Jdbi jdbi;

    /**
     * 获取所有背景
     */
    @GetMapping("/backgrounds")
    public List<Background> getBackgrounds() {
        try {
            return jdbi.withExtension(BackgroundDAO.class, dao -> dao.getAllBackgrounds());
        } catch (Exception e) {
            System.err.println("获取背景失败: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * 添加背景
     */
    @PostMapping("/backgrounds")
    public Background addBackground(@RequestBody Background background) {
        try {
            jdbi.useExtension(BackgroundDAO.class, dao -> dao.addBackground(background));
            return background;
        } catch (Exception e) {
            System.err.println("添加背景失败: " + e.getMessage());
            throw new RuntimeException("添加背景失败: " + e.getMessage());
        }
    }

    /**
     * 更新背景
     */
    @PutMapping("/backgrounds/{id}")
    public Background updateBackground(@PathVariable String id, @RequestBody Background background) {
        try {
            background.setUuid(id);
            jdbi.useExtension(BackgroundDAO.class, dao -> dao.updateBackground(background));
            return background;
        } catch (Exception e) {
            System.err.println("更新背景失败: " + e.getMessage());
            throw new RuntimeException("更新背景失败: " + e.getMessage());
        }
    }

    /**
     * 删除背景
     */
    @DeleteMapping("/backgrounds/{id}")
    public void deleteBackground(@PathVariable String id) {
        try {
            jdbi.useExtension(BackgroundDAO.class, dao -> dao.deleteBackground(id));
        } catch (Exception e) {
            System.err.println("删除背景失败: " + e.getMessage());
            throw new RuntimeException("删除背景失败: " + e.getMessage());
        }
    }
}
