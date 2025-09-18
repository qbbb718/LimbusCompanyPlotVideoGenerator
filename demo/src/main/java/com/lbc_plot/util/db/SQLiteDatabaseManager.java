package com.lbc_plot.util.db;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

import com.lbc_plot.config.DatabaseConfig;

/**
 * SQLite数据库连接管理
 */
public class SQLiteDatabaseManager {
    // 修改数据库路径指向resources/db目录
    private static final String DB_URL = DatabaseConfig.getDatabaseUrl();
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
        try (InputStream inputStream = SQLiteDatabaseManager.class.getClassLoader()
                .getResourceAsStream("db/initial_schema.sql");
             BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream))) {
            
            StringBuilder sqlBuilder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sqlBuilder.append(line).append("\n");
            }
            
            String sql = sqlBuilder.toString();
            try (var stmt = connection.createStatement()) {
                stmt.execute(sql);
            }
        } catch (IOException | SQLException e) {
            throw new RuntimeException("创建表失败: " + e.getMessage(), e);
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