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
        // 确保数据库目录存在
        ensureDatabaseDirectoryExists();
        
        SpringApplication.run(MainApplication.class, args);
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
