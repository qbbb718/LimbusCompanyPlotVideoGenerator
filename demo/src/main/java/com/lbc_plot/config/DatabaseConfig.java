package com.lbc_plot.config;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

import org.springframework.context.annotation.Configuration;

/**
 * 数据库配置管理类
 *
 * 此类负责从配置文件加载数据库相关的配置参数。
 * 配置从 classpath 下的 db/config/database.properties 文件加载。
 *
 * 如果配置文件不存在，会使用默认配置：
 * - database.url: jdbc:sqlite:./data/project.db
 * - connection.pool.size: 10
 *
 * @author 项目维护者
 * @since 1.0
 */
@Configuration
public class DatabaseConfig {
    // 不再继承AbstractJdbcConfiguration，避免自动方言检测
    private static final Properties props = new Properties();

    static {
        // 指定配置文件的路径
        String configFile = "db/config/database.properties";
        try (InputStream input = DatabaseConfig.class.getClassLoader().getResourceAsStream(configFile)) {
            if (input == null) {
                // 处理配置文件不存在的情况，可以回退到默认值或抛出更明确的异常
                System.err.println("警告: 配置文件 '" + configFile + "' 未找到，将使用默认配置。");
                // 这里可以设置一些默认属性，例如：
                props.setProperty("database.url", "jdbc:sqlite:./data/project.db");
                props.setProperty("connection.pool.size", "10");
            } else {
                props.load(input);
            }
        } catch (IOException e) {
            throw new RuntimeException("加载数据库配置文件 '" + configFile + "' 失败", e);
        }
    }

    /**
     * 获取数据库连接URL
     * @return 数据库URL，默认为 "jdbc:sqlite:./data/project.db"
     */
    public static String getDatabaseUrl() {
        // 提供默认值是个好习惯
        return props.getProperty("database.url", "jdbc:sqlite:./data/project.db");
    }

    /**
     * 获取连接池大小
     * @return 连接池大小，默认为 10
     */
    public static int getConnectionPoolSize() {
        // 更安全地解析整数，避免配置错误导致整个应用无法启动
        try {
            return Integer.parseInt(props.getProperty("connection.pool.size", "10"));
        } catch (NumberFormatException e) {
            System.err.println("配置项 'connection.pool.size' 格式错误，使用默认值 10");
            return 10;
        }
    }
}