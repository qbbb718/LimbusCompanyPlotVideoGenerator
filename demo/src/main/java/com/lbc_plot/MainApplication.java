package com.lbc_plot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.nio.file.Path;
import java.util.Map;

import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.common.util.io.NativeLibraryBootstrap;
import com.lbc_plot.common.util.io.WebpSelfCheck;
import com.lbc_plot.config.DatabaseConfig;

/**
 * 主应用程序类
 */
@SpringBootApplication
public class MainApplication {

    private static final Logger logger = LoggerFactory.getLogger(MainApplication.class);

    public static void main(String[] args) {
        // 安装包自检入口：不进 Spring、不碰用户数据，只验证「打包后的 jar 能不能解码 WebP 立绘」。
        // 必须用 `java -jar` 跑（扁平 classpath 永远看不出问题），说明见 WebpSelfCheck。
        String selfCheck = selfCheckTarget(args);
        if (selfCheck != null) {
            System.exit(WebpSelfCheck.run(selfCheck));
        }

        // 清理历史遗留的数据库文件（见方法说明）
        cleanupLegacyDatabase();
        // 数据目录固定在 RuntimePaths 解析出的数据根目录下，不再依赖 JVM 工作目录
        ensureDataDirectoryExists();

        logResolvedPaths();
        // FFmpeg 原生库（JavaCV/JavaCPP）必须在渲染之前确认可用：
        // 失败时 JVM 会缓存“类初始化失败”，之后所有 WebP 立绘读取都只会报
        // NoClassDefFoundError，根因被掩盖。这里主动预热，把原因写进启动日志。
        NativeLibraryBootstrap.warmUp();
        // 数据库等路径由 RuntimePathsEnvironmentPostProcessor 注入 Spring 环境，
        // 因此这里不需要（也不应该）再依赖某个入口方法去设置属性。
        SpringApplication.run(MainApplication.class, args);
    }

    /**
     * 取出 {@code --self-check=<目标>} 参数。
     *
     * <p>支持两种写法：{@code --self-check=webp} 与 {@code --self-check webp}。
     * 参数不存在或值不是 {@code webp} 时返回 {@code null}（正常启动流程）。
     *
     * <p>包级可见（不是 private）是为了让单元测试直接验参数解析，不需要真的起一个进程。
     *
     * @param args 命令行参数
     * @return 自检目标；没有自检请求时为 {@code null}
     */
    static String selfCheckTarget(String[] args) {
        if (args == null) {
            return null;
        }
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if (arg == null) {
                continue;
            }
            if (arg.startsWith("--self-check=")) {
                String value = arg.substring("--self-check=".length()).trim();
                return value.isEmpty() ? null : value;
            }
            if ("--self-check".equals(arg) && i + 1 < args.length) {
                String value = args[i + 1] == null ? "" : args[i + 1].trim();
                return value.isEmpty() ? null : value;
            }
        }
        return null;
    }

    /**
     * 启动完成后打印版本号。
     *
     * <p>版本号来自 {@code application.yml} 的 {@code app.version}，该值由
     * {@code scripts/version.mjs} 与 package.json / pom.xml 一起同步（单一真源），
     * 所以日志里的版本号就是本次运行的真实版本，而不是某个构建残留值。
     *
     * <p>写成 {@code @Bean ApplicationRunner} 而不是自定义组件：版本号在配置类里注入，
     * 与 {@code /api/health} 读的是同一个属性，改一处即可，不需要额外注册扫描路径。
     */
    @Bean
    ApplicationRunner versionLogger(@Value("${app.version:unknown}") String appVersion) {
        return args -> logger.info("LimbusCompany Plot Video Generator 后端版本: {}", appVersion);
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
