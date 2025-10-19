package helpers;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import javax.sql.DataSource;

import java.sql.ResultSet;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.sqlite.SQLiteDataSource;

import com.lbc_plot.util.db.SQLiteDatabaseManager;


/**
 * SQLite测试数据库连接管理（使用内存数据库）
 */
public class SQLiteTestDatabaseManager {
    private static final Logger logger = LoggerFactory.getLogger(SQLiteTestDatabaseManager.class);
    
    // 使用内存数据库
    private static final String DB_URL = "jdbc:sqlite::memory:";
    private Connection connection;
    // 添加连接状态追踪
    private boolean connectionActive = true;
    
    private static SQLiteDataSource dataSource;
    private static Connection singleConnection; // 保留原单连接模式

    
    public SQLiteTestDatabaseManager() {
        logger.info("创建SQLite测试数据库管理器");
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
    
    private void initializeDatabase() {
        logger.debug("开始初始化测试数据库");
        try {
            // 先检查驱动
            checkDriver();
            
            // 创建内存数据库连接
            logger.debug("创建内存数据库连接: {}", DB_URL);
            connection = DriverManager.getConnection(DB_URL);
            logger.info("内存数据库连接创建成功");
            
            // 创建表结构
            createTables();
            
            logger.info("测试数据库初始化完成");
            
        } catch (Exception e) {
            logger.error("测试数据库初始化失败", e);
            throw new RuntimeException("测试数据库初始化失败", e);
        }
    }
    
    private void checkDriver() {
        try {
            logger.debug("检查SQLite JDBC驱动");
            Class.forName("org.sqlite.JDBC");
            logger.debug("SQLite JDBC驱动加载成功");
        } catch (ClassNotFoundException e) {
            logger.error("找不到SQLite JDBC驱动，请添加依赖", e);
            throw new RuntimeException("找不到SQLite JDBC驱动，请添加依赖", e);
        }
    }
    
    
    private void createTables() {
        logger.info("开始创建数据库表结构");
        
        InputStream inputStream = getClass().getClassLoader()
                .getResourceAsStream("db/initial_schema.sql");

        if (inputStream == null) {
            logger.error("找不到数据库初始化文件: db/initial_schema.sql (请确认该文件已在 classpath 中)");
            throw new RuntimeException("找不到数据库初始化文件: db/initial_schema.sql");
        }

        logger.debug("读取数据库初始化文件成功");
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream))) {
            
            StringBuilder sqlBuilder = new StringBuilder();
            String line;
            int lineCount = 0;
            while ((line = reader.readLine()) != null) {
                sqlBuilder.append(line).append("\n");
                lineCount++;
            }
            
            String fullSql = sqlBuilder.toString();
            logger.debug("读取SQL文件完成: {}行, {}字符", lineCount, fullSql.length());
            
            // 分割SQL语句
            List<String> sqlStatements = splitSqlScript(fullSql);
            logger.debug("解析出 {} 条SQL语句", sqlStatements.size());
            
            // 分离CREATE TABLE和CREATE INDEX语句
            List<String> createTableStatements = new ArrayList<>();
            List<String> createIndexStatements = new ArrayList<>();
            List<String> otherStatements = new ArrayList<>();
            
            for (String sql : sqlStatements) {
                sql = sql.trim();
                if (sql.isEmpty() || sql.startsWith("--")) {
                    continue;
                }
                
                String upperSql = sql.toUpperCase();
                if (upperSql.startsWith("CREATE TABLE")) {
                    createTableStatements.add(sql);
                } else if (upperSql.startsWith("CREATE INDEX")) {
                    createIndexStatements.add(sql);
                } else {
                    otherStatements.add(sql);
                    logger.warn("发现不支持的SQL语句类型: {}", 
                        upperSql.substring(0, Math.min(40, upperSql.length())) + "...");
                }
            }
            
            logger.info("分类完成: {}个CREATE TABLE, {}个CREATE INDEX, {}个其他语句",
                createTableStatements.size(), createIndexStatements.size(), otherStatements.size());
            
            // 分阶段执行SQL
            try (Statement stmt = connection.createStatement()) {
                
                // 第一阶段：执行所有CREATE TABLE语句
                logger.info("开始执行CREATE TABLE语句");
                for (int i = 0; i < createTableStatements.size(); i++) {
                    String sql = createTableStatements.get(i);
                    String tableName = extractTableName(sql);
                    
                    logger.debug("执行CREATE TABLE[{}]: {}", i + 1, 
                        tableName != null ? tableName : "未知表");
                    
                    stmt.execute(sql);
                    logger.info("创建表成功: {}", tableName != null ? tableName : "表" + (i + 1));
                }
                
                // 第二阶段：执行所有CREATE INDEX语句
                logger.info("开始执行CREATE INDEX语句");
                for (int i = 0; i < createIndexStatements.size(); i++) {
                    String sql = createIndexStatements.get(i);
                    
                    logger.debug("执行CREATE INDEX[{}]: {}", i + 1,
                        sql.substring(0, Math.min(50, sql.length())) + "...");
                    
                    stmt.execute(sql);
                    logger.info("创建索引成功: 索引{}", i + 1);
                }
                
                // 第三阶段：尝试执行其他语句（如果有）
                if (!otherStatements.isEmpty()) {
                    logger.warn("尝试执行 {} 个其他类型语句", otherStatements.size());
                    for (String sql : otherStatements) {
                        try {
                            stmt.execute(sql);
                            logger.info("执行其他语句成功");
                        } catch (SQLException e) {
                            logger.warn("执行其他语句失败: {}", e.getMessage());
                        }
                    }
                }
                
            }
            
            logger.info("SQL执行完成: 共执行 {} 个表, {} 个索引",
                createTableStatements.size(), createIndexStatements.size());
            
            // 验证表是否创建成功
            verifyTablesCreated();
            
        } catch (IOException e) {
            logger.error("读取数据库初始化文件失败", e);
            throw new RuntimeException("创建测试表失败: 文件读取错误", e);
        } catch (SQLException e) {
            logger.error("执行SQL语句失败", e);
            throw new RuntimeException("创建测试表失败: SQL执行错误", e);
        }
    }


    /**
     * 验证必要的表是否创建成功
     */
    private void verifyTablesCreated() {
        logger.info("验证表创建情况");
        
        // 检查必须存在的表
        String[] requiredTables = {"characters", "portraits"};
        
        for (String table : requiredTables) {
            boolean exists = tableExists(table);
            logger.info("表 {} 存在: {}", table, exists);
            
            if (!exists) {
                logger.warn("重要表 {} 未创建成功", table);
            }
        }
        
        // 列出所有表
        listAllTables();
    }

    /**
     * 改进的表名提取方法
     */
    private String extractTableName(String sql) {
        try {
            String upperSql = sql.toUpperCase().trim();
            
            // 移除CREATE TABLE IF NOT EXISTS
            String workingSql = upperSql
                .replace("CREATE TABLE", "")
                .replace("IF NOT EXISTS", "")
                .trim();
            
            // 找到第一个空格或左括号
            int endIndex = workingSql.length();
            int spaceIndex = workingSql.indexOf(' ');
            int parenIndex = workingSql.indexOf('(');
            
            if (spaceIndex > 0 && spaceIndex < endIndex) {
                endIndex = spaceIndex;
            }
            if (parenIndex > 0 && parenIndex < endIndex) {
                endIndex = parenIndex;
            }
            
            if (endIndex < workingSql.length()) {
                String tableName = workingSql.substring(0, endIndex).trim();
                // 移除可能的引号
                tableName = tableName.replace("`", "").replace("\"", "").replace("'", "");
                return tableName;
            }
            
        } catch (Exception e) {
            logger.warn("提取表名失败: {}", e.getMessage());
        }
        return null;
    }


    /**
     * 诊断方法：详细检查数据库状态
     */
    public void diagnose() {
        logger.info("=== 数据库诊断 ===");
        
        try {
            // 检查连接状态
            logger.info("连接状态: {}", connection.isClosed() ? "已关闭" : "已连接");
            
            // 列出所有数据库对象
            try (var rs = connection.getMetaData().getTables(null, null, "%", null)) {
                logger.info("数据库中的表:");
                int count = 0;
                while (rs.next()) {
                    String name = rs.getString("TABLE_NAME");
                    String type = rs.getString("TABLE_TYPE");
                    logger.info(" - {} ({})", name, type);
                    count++;
                }
                if (count == 0) {
                    logger.warn("数据库中没有任何表");
                }
            }
            
            // 检查SQLite系统表
            try (Statement stmt = connection.createStatement();
                ResultSet rs = stmt.executeQuery("SELECT name FROM sqlite_master WHERE type='table'")) {
                
                logger.info("sqlite_master中的表:");
                int count = 0;
                while (rs.next()) {
                    String name = rs.getString("name");
                    logger.info(" - {}", name);
                    count++;
                }
                if (count == 0) {
                    logger.error("sqlite_master中没有任何表，说明数据库完全为空");
                }
            }
            
        } catch (SQLException e) {
            logger.error("诊断失败", e);
        }
    }

    
    public Connection getConnection() {
        logger.debug("请求获取数据库连接");
        
        try {
            if (!connectionActive) {
                throw new IllegalStateException("管理器已关闭，无法获取连接");
            }

            if (connection == null || connection.isClosed()) {
                logger.warn("连接不可用，重新创建");
                connection = DriverManager.getConnection(DB_URL);
                logger.info("新连接已创建: {}", connection.hashCode());
            } else {
                logger.debug("使用现有连接: {}", connection.hashCode());
            }
            return connection;
        } catch (SQLException e) {
            logger.error("获取测试数据库连接失败", e);
            throw new RuntimeException("获取测试数据库连接失败", e);
        }
    }
    
    public void closeConnection() {
        logger.debug("关闭数据库连接");
        try {
            if (connection != null && !connection.isClosed()) {
                connection.close();
                logger.info("数据库连接关闭成功");
            } else {
                logger.debug("连接已关闭或为null，无需操作");
            }
            this.connectionActive = false;
        } catch (SQLException e) {
            logger.warn("关闭测试数据库连接失败: {}", e.getMessage());
        } finally {
            connection = null;
        }
    }
    
    /**
     * 清空所有表数据（但保留表结构）
     */
    public void clearAllData() {
        logger.info("清空所有表数据");
        try (Statement stmt = connection.createStatement()) {
            // 禁用外键约束以便清空数据
            stmt.execute("PRAGMA foreign_keys = OFF");
            logger.debug("外键约束已禁用");
            
            // 获取所有用户表
            var rs = stmt.executeQuery(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            
            int clearedTables = 0;
            while (rs.next()) {
                String tableName = rs.getString("name");
                try {
                    stmt.execute("DELETE FROM " + tableName);
                    logger.debug("清空表: {}", tableName);
                    clearedTables++;
                } catch (SQLException e) {
                    logger.warn("清空表 {} 失败: {}", tableName, e.getMessage());
                }
            }
            
            // 启用外键约束
            stmt.execute("PRAGMA foreign_keys = ON");
            logger.debug("外键约束已启用");
            
            logger.info("数据清空完成: 共清空 {} 个表", clearedTables);
            
        } catch (SQLException e) {
            logger.error("清空测试数据失败", e);
            throw new RuntimeException("清空测试数据失败", e);
        }
    }
    
    /**
     * 完全重置数据库
     */
    public void resetDatabase() {
        logger.info("重置数据库");
        closeConnection();
        initializeDatabase();
    }
    
    /**
     * 检查表是否存在
     */
    public boolean tableExists(String tableName) {
        logger.debug("检查表是否存在: {}", tableName);
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery(
                 "SELECT 1 FROM sqlite_master WHERE type='table' AND name = '" + tableName + "'")) {
            
            boolean exists = rs.next();
            logger.debug("表 {} 存在: {}", tableName, exists);
            return exists;
            
        } catch (SQLException e) {
            logger.warn("检查表存在失败: {}", e.getMessage());
            return false;
        }
    }
    
    /**
     * 列出所有表
     */
    public void listAllTables() {
        logger.info("列出所有表");
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery(
                 "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view')")) {
            
            int tableCount = 0;
            while (rs.next()) {
                String name = rs.getString("name");
                String type = rs.getString("type");
                logger.info(" - {} ({})", name, type);
                tableCount++;
            }
            
            logger.info("共发现 {} 个表/视图", tableCount);
            
        } catch (SQLException e) {
            logger.warn("列出表失败: {}", e.getMessage());
        }
    }
    
    /**
     * 获取数据库信息
     */
    public void printDatabaseInfo() {
        try {
            logger.info("=== 数据库信息 ===");
            logger.info("URL: {}", connection.getMetaData().getURL());
            logger.info("Database: {}", connection.getCatalog());
            logger.info("Readonly: {}", connection.isReadOnly());
            logger.info("Closed: {}", connection.isClosed());
            
        } catch (SQLException e) {
            logger.warn("获取数据库信息失败: {}", e.getMessage());
        }
    }

    /**
     * 改进的SQL脚本分割方法，能够处理字符串和注释中的分号
     * @param script 整个SQL脚本内容
     * @return 分割后的SQL语句列表
     */
    private List<String> splitSqlScript(String script) {
        List<String> statements = new ArrayList<>();
        StringBuilder currentStatement = new StringBuilder();
        boolean inSingleQuote = false; // 是否在单引号字符串中
        boolean inDoubleQuote = false; // 是否在双引号字符串中
        boolean inLineComment = false; // 是否在单行注释中 (--)
        boolean inBlockComment = false; // 是否在多行注释中 (/* ... */)
        char prevChar = '\0'; // 上一个字符，用于判断转义

        for (int i = 0; i < script.length(); i++) {
            char c = script.charAt(i);

            // 处理块注释开始 (/*)
            if (!inSingleQuote && !inDoubleQuote && !inLineComment && !inBlockComment &&
                c == '/' && i + 1 < script.length() && script.charAt(i + 1) == '*') {
                inBlockComment = true;
                i++; // 跳过 '*'，并且不将 "/*" 添加到 currentStatement
                continue;
            }
            // 处理块注释结束 (*/)
            if (inBlockComment && c == '*' && i + 1 < script.length() && script.charAt(i + 1) == '/') {
                inBlockComment = false;
                i++; // 跳过 '/'，并且不将 "*/" 添加到 currentStatement
                continue;
            }
            // 处理单行注释开始 (--)
            if (!inSingleQuote && !inDoubleQuote && !inLineComment && !inBlockComment &&
                c == '-' && i + 1 < script.length() && script.charAt(i + 1) == '-') {
                inLineComment = true;
                i++; // 跳过第二个 '-'，并且不将 "--" 添加到 currentStatement
                continue;
            }
            // 处理单行注释结束 (换行符)
            if (inLineComment) {
                if (c == '\n' || c == '\r') {
                    inLineComment = false; // 注释结束，遇到换行符才结束单行注释模式
                }
                continue; // 在单行注释模式下，跳过所有字符，不添加到 currentStatement
            }
            // 如果在块注释中，跳过所有字符
            if (inBlockComment) {
                continue;
            }
            // 处理单引号字符串
            if (!inLineComment && !inBlockComment && c == '\'' && !inDoubleQuote) {
                if (!inSingleQuote) {
                    inSingleQuote = true;
                } else if (prevChar != '\\') { // 考虑转义情况，如 '\''
                    inSingleQuote = false;
                }
            }
            // 处理双引号字符串 (SQLite支持)
            if (!inLineComment && !inBlockComment && c == '"' && !inSingleQuote) {
                if (!inDoubleQuote) {
                    inDoubleQuote = true;
                } else if (prevChar != '\\') { // 考虑转义情况
                    inDoubleQuote = false;
                }
            }

            // 如果当前字符是分号，且不在字符串、行注释或块注释中，则分割语句
            if (c == ';' && !inSingleQuote && !inDoubleQuote && !inLineComment && !inBlockComment) {
                String statement = currentStatement.toString().trim();
                if (!statement.isEmpty()) {
                    statements.add(statement);
                }
                currentStatement.setLength(0); // 清空当前语句缓冲区
            } else {
                // 将字符添加到当前语句缓冲区
                currentStatement.append(c);
            }

            prevChar = c; // 更新前一个字符
        }

        // 处理最后一个语句（可能没有以分号结尾）
        String finalStatement = currentStatement.toString().trim();
        if (!finalStatement.isEmpty()) {
            statements.add(finalStatement);
        }

        return statements;
    }

        /**
     * 检查表中是否存在符合条件的记录
     * @param tableName 表名
     * @param columnName 字段名
     * @param value 预期值（支持String/Number/Boolean）
     * @return 是否存在记录
     */
    public boolean recordExists(String tableName, String columnName, Object value) {
        logger.debug("检查记录存在性: {}.{} = {}", tableName, columnName, value);
        
        String sql;
        if (value instanceof String) {
            sql = String.format("SELECT 1 FROM %s WHERE %s = '%s'", tableName, columnName, value);
        } else if (value instanceof Number || value instanceof Boolean) {
            sql = String.format("SELECT 1 FROM %s WHERE %s = %s", tableName, columnName, value);
        } else {
            throw new IllegalArgumentException("不支持的值类型: " + value.getClass());
        }

        try (Statement stmt = connection.createStatement();
            ResultSet rs = stmt.executeQuery(sql)) {
            boolean exists = rs.next();
            logger.debug("记录存在性检查结果: {}", exists);
            return exists;
        } catch (SQLException e) {
            logger.error("记录存在性检查失败: {}", sql, e);
            throw new RuntimeException("数据库查询失败", e);
        }
    }
    
}