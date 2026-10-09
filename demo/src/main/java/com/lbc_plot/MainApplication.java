package com.lbc_plot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.nio.file.Path;
import java.util.Map;

import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.config.DatabaseConfig;

/**
 * 主应用程序类
 */
@SpringBootApplication
public class MainApplication {

    private static final Logger logger = LoggerFactory.getLogger(MainApplication.class);

    public static void main(String[] args) {
        // 清理历史遗留的数据库文件（见方法说明）
        cleanupLegacyDatabase();
        // 数据目录固定在 RuntimePaths 解析出的数据根目录下，不再依赖 JVM 工作目录
        ensureDataDirectoryExists();

        logResolvedPaths();
        // 数据库等路径由 RuntimePathsEnvironmentPostProcessor 注入 Spring 环境，
        // 因此这里不需要（也不应该）再依赖某个入口方法去设置属性。
        SpringApplication.run(MainApplication.class, args);
    }

    /**
     * 启动时打印各数据目录的解析结果，便于确认"素材到底读的是哪个目录"。
     *
     * <p>这类信息过去只能靠猜：同一份配置在不同工作目录下会指向不同位置，
     * 排障时无法一眼看出实际生效的路径。
     */
    private static void logResolvedPaths() {
        Map<String, String> paths = RuntimePaths.describe();
        logger.info("数据根目录: {}", paths.get("dataRoot"));
        logger.info("素材目录: {} (存在={})", paths.get("assetsDir"),
                new File(RuntimePaths.getAssetsDir().toString()).isDirectory());
        logger.info("数据库: {}", DatabaseConfig.getDatabaseUrl());
        String override = paths.get("override");
        if (override != null && !override.isEmpty()) {
            logger.info("数据根目录已被覆盖: {}", override);
        }
    }

    /**
     * 删除 JVM 工作目录下的历史遗留数据库文件。
     *
     * <p>早期版本的数据库放在"工作目录/project.db"。现在的库位于
     * {@code {dataRoot}/data/project.db}，所以工作目录下若还存在 {@code project.db}，
     * 那就是无人使用的历史文件，可以安全清理。
     *
     * <p>这里显式判断：只有当它与真正使用的库不是同一个文件时才删除，避免误删现役数据库。
     */
    private static void cleanupLegacyDatabase() {
        try {
            File legacyDb = new File("project.db").getAbsoluteFile();
            Path currentDb = RuntimePaths.getDataDir().resolve("project.db").toAbsolutePath().normalize();

            if (!legacyDb.exists()) {
                return;
            }
            if (legacyDb.toPath().toAbsolutePath().normalize().equals(currentDb)) {
                // 工作目录恰好就是数据目录，这个文件正是现役数据库，绝不能删
                return;
            }
            boolean deleted = legacyDb.delete();
            if (deleted) {
                logger.info("已删除历史遗留数据库文件: {}", legacyDb.getAbsolutePath());
            } else {
                logger.warn("无法删除历史遗留数据库文件: {}", legacyDb.getAbsolutePath());
            }
        } catch (Exception e) {
            logger.warn("清理历史遗留数据库时发生错误", e);
        }
    }

    /**
     * 确保数据库目录存在（{@code {dataRoot}/data}）。
     */
    private static void ensureDataDirectoryExists() {
        try {
            File dataDir = RuntimePaths.getDataDir().toFile();
            if (!dataDir.exists()) {
                boolean created = dataDir.mkdirs();
                if (created) {
                    logger.info("数据库目录已创建: {}", dataDir.getAbsolutePath());
                } else if (!dataDir.isDirectory()) {
                    logger.error("无法创建数据库目录: {}", dataDir.getAbsolutePath());
                }
            }
        } catch (Exception e) {
            logger.error("检查数据库目录时出错", e);
        }
    }
}
