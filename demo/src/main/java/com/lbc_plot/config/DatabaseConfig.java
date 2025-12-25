package com.lbc_plot.config;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

import org.springframework.context.annotation.Configuration;



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
    
    public static String getDatabaseUrl() {
        // 提供默认值是个好习惯
        return props.getProperty("database.url", "jdbc:sqlite:./data/project.db");
    }
    
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