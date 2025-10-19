package com.lbc_plot.util.db;

import org.sqlite.SQLiteDataSource;
import javax.sql.DataSource;
import java.io.*;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import com.lbc_plot.config.DatabaseConfig;

/**
 * SQLite数据库连接管理（支持DataSource）
 */
public class SQLiteDatabaseManager {
    private static final String DB_URL = DatabaseConfig.getDatabaseUrl();
    private static SQLiteDataSource dataSource;
    private static Connection singleConnection; // 保留原单连接模式

    static {
        initializeDatabase();
    }

    // ==================== DataSource 支持 ====================
    /**
     * 获取DataSource实例（JDBI推荐使用）
     */
    public static DataSource getDataSource() {
        if (dataSource == null) {
            synchronized (SQLiteDatabaseManager.class) {
                if (dataSource == null) {
                    SQLiteDataSource ds = new SQLiteDataSource();
                    ds.setUrl(DB_URL);
                    dataSource = ds;
                }
            }
        }
        return dataSource;
    }

    // ==================== 原有单连接模式 ====================
    /**
     * 获取单一连接（兼容旧代码）
     */
    public static Connection getConnection() {
        try {
            if (singleConnection == null || singleConnection.isClosed()) {
                singleConnection = DriverManager.getConnection(DB_URL);
            }
            return singleConnection;
        } catch (SQLException e) {
            throw new RuntimeException("获取数据库连接失败", e);
        }
    }

    public static void closeConnection() {
        try {
            if (singleConnection != null && !singleConnection.isClosed()) {
                singleConnection.close();
            }
        } catch (SQLException e) {
            System.err.println("关闭数据库连接失败: " + e.getMessage());
        }
    }

    // ==================== 私有方法 ====================
    private static void initializeDatabase() {
        try {
            // 确保驱动已加载
            Class.forName("org.sqlite.JDBC");
            // 初始化单连接
            singleConnection = getConnection();
            // 初始化DataSource
            getDataSource();
            // 建表
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
            try (Connection conn = getConnection();
                 var stmt = conn.createStatement()) {
                stmt.execute(sql);
            }
        } catch (IOException | SQLException e) {
            throw new RuntimeException("创建表失败: " + e.getMessage(), e);
        }
    }
}