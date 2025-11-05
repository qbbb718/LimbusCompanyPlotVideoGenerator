package com.lbc_plot.controller;

import java.util.List;
import java.util.ArrayList;
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

import com.lbc_plot.model.storage.Background;
import com.lbc_plot.DAO.BackgroundDAO;
import org.jdbi.v3.core.Jdbi;

/**
 * 背景资源API控制器
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = {"http://localhost:3000", "http://127.0.0.1:3000"})
public class BackgroundController {

    private static final Logger logger = Logger.getLogger(BackgroundController.class.getName());

    // 资源文件夹路径
    private static final String BACKGROUNDS_DIR = "resources/backgrounds";

    @Autowired
    private Jdbi jdbi;

    /**
     * 获取所有背景
     */
    @GetMapping("/backgrounds")
    public List<Background> getBackgrounds() {
        try {
            logger.info("获取所有背景");
            List<Background> backgrounds = jdbi.withExtension(BackgroundDAO.class, dao -> dao.getAllBackgrounds());
            logger.info("成功获取 " + backgrounds.size() + " 个背景");
            return backgrounds;
        } catch (Exception e) {
            logger.severe("获取背景失败: " + e.getMessage());
            e.printStackTrace();
            return new ArrayList<>();
        }
    }

    /**
     * 添加背景
     */
    @PostMapping("/backgrounds")
    public Background addBackground(@RequestBody Background background) {
        try {
            logger.info("添加新背景: " + background.getName());

            // 确保背景目录存在
            File backgroundsDir = new File(BACKGROUNDS_DIR);
            if (!backgroundsDir.exists()) {
                backgroundsDir.mkdirs();
                logger.info("创建背景目录: " + backgroundsDir.getAbsolutePath());
            }

            // 验证背景文件是否存在
            if (background.getPath() != null && !background.getPath().isEmpty()) {
                File backgroundFile = new File(background.getPath());
                if (!backgroundFile.exists()) {
                    logger.warning("背景文件不存在: " + backgroundFile.getAbsolutePath());
                }
            }

            jdbi.useExtension(BackgroundDAO.class, dao -> dao.addBackground(background));
            logger.info("成功添加背景: " + background.getName());
            return background;
        } catch (Exception e) {
            logger.severe("添加背景失败: " + e.getMessage());
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
            background.setUuid(id);

            // 验证背景文件是否存在
            if (background.getPath() != null && !background.getPath().isEmpty()) {
                File backgroundFile = new File(background.getPath());
                if (!backgroundFile.exists()) {
                    logger.warning("背景文件不存在: " + backgroundFile.getAbsolutePath());
                }
            }

            jdbi.useExtension(BackgroundDAO.class, dao -> dao.updateBackground(background));
            logger.info("成功更新背景: " + background.getName());
            return background;
        } catch (Exception e) {
            logger.severe("更新背景失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("更新背景失败: " + e.getMessage());
        }
    }

    /**
     * 删除背景
     */
    @DeleteMapping("/backgrounds/{id}")
    public void deleteBackground(@PathVariable String id) {
        try {
            logger.info("删除背景: " + id);

            // 先获取背景信息，以便删除文件
            Background background = jdbi.withExtension(BackgroundDAO.class, dao -> dao.getById(id));
            if (background != null && background.getPath() != null) {
                File backgroundFile = new File(background.getPath());
                if (backgroundFile.exists()) {
                    backgroundFile.delete();
                    logger.info("已删除背景文件: " + backgroundFile.getAbsolutePath());
                }
            }

            jdbi.useExtension(BackgroundDAO.class, dao -> dao.deleteBackground(id));
            logger.info("成功删除背景: " + id);
        } catch (Exception e) {
            logger.severe("删除背景失败: " + e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("删除背景失败: " + e.getMessage());
        }
    }
}
