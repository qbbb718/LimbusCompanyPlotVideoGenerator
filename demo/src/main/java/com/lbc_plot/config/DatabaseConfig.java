package com.lbc_plot.config;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

// DatabaseConfig.java
public class DatabaseConfig {
    private static final Properties props = new Properties();
    
    static {
        try (InputStream input = DatabaseConfig.class.getClassLoader()
                .getResourceAsStream("db/config/database.properties")) {
            props.load(input);
        } catch (IOException e) {
            throw new RuntimeException("加载数据库配置失败", e);
        }
    }
    
    public static String getDatabaseUrl() {
        return props.getProperty("database.url", "jdbc:sqlite:project.db");
    }
    
    public static int getConnectionPoolSize() {
        return Integer.parseInt(props.getProperty("connection.pool.size", "10"));
    }
}