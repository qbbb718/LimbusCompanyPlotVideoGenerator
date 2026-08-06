package com.lbc_plot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import javax.sql.DataSource;
import java.io.File;

/**
 * 主应用程序类
 */
@SpringBootApplication
public class MainApplication {

    private static final Logger logger = LoggerFactory.getLogger(MainApplication.class);

    public static void main(String[] args) {
        // 清理旧版数据库文件（project.db放在根目录）
        cleanupLegacyDatabase();
        // 确保数据目录存在并使用新的配置
        ensureDatabaseDirectoryExists();

        SpringApplication.run(MainApplication.class, args);
    }

    /**
     * 删除根目录下的旧数据库文件（无需保留旧数据）
     */
    private static void cleanupLegacyDatabase() {
        try {
            File oldDb = new File("project.db");
            if (oldDb.exists()) {
                boolean deleted = oldDb.delete();
                if (deleted) {
                    logger.info("已删除旧数据库文件: {}", oldDb.getAbsolutePath());
                } else {
                    logger.warn("无法删除旧数据库文件: {}", oldDb.getAbsolutePath());
                }
            }
        } catch (Exception e) {
            logger.warn("清理旧数据库时发生错误", e);
        }
    }

    /**
     * 确保数据库目录存在
     */
    private static void ensureDatabaseDirectoryExists() {
        try {
            // 数据库路径是 ./data/project.db
            File dataDir = new File("data");
            if (!dataDir.exists()) {
                boolean created = dataDir.mkdirs();
                if (created) {
                    logger.info("数据库目录已创建: {}", dataDir.getAbsolutePath());
                } else {
                    logger.error("无法创建数据库目录: {}", dataDir.getAbsolutePath());
                }
            } else {
                logger.info("数据库目录已存在: {}", dataDir.getAbsolutePath());
            }
        } catch (Exception e) {
            logger.error("检查数据库目录时出错", e);
        }
    }
}
