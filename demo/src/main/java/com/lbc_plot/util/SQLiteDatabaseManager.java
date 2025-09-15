package com.lbc_plot.util;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

/**
 * SQLite数据库连接管理
 */
public class SQLiteDatabaseManager {
    private static final String DB_URL = "jdbc:sqlite:character.db";
    private static Connection connection;
    
    static {
        initializeDatabase();
    }
    
    private static void initializeDatabase() {
        try {
            Class.forName("org.sqlite.JDBC");
            connection = DriverManager.getConnection(DB_URL);
            createTables();
        } catch (Exception e) {
            throw new RuntimeException("数据库初始化失败", e);
        }
    }
    
    private static void createTables() {
        String sql = """
            -- 修改characters表，让character_id由数据库生成
            CREATE TABLE IF NOT EXISTS characters (
                character_id TEXT PRIMARY KEY,
                character_name TEXT NOT NULL,
                height INTEGER DEFAULT 170,
                color_bg TEXT,
                color_text TEXT,
                faction TEXT,
                created_time DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            """;
        
        try (var stmt = connection.createStatement()) {
            stmt.execute(sql);
        } catch (SQLException e) {
            throw new RuntimeException("创建表失败", e);
        }
    }
    
    public static Connection getConnection() {
        try {
            if (connection == null || connection.isClosed()) {
                connection = DriverManager.getConnection(DB_URL);
            }
            return connection;
        } catch (SQLException e) {
            throw new RuntimeException("获取数据库连接失败", e);
        }
    }
    
    public static void closeConnection() {
        try {
            if (connection != null && !connection.isClosed()) {
                connection.close();
            }
        } catch (SQLException e) {
            System.err.println("关闭数据库连接失败: " + e.getMessage());
        }
    }
}