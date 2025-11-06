package com.lbc_plot.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.FileCopyUtils;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * 数据库初始化器
 * 在应用启动时自动执行SQL脚本，创建必要的数据库表
 */
@Component
public class DatabaseInitializer implements CommandLineRunner {

    private static final Logger logger = LoggerFactory.getLogger(DatabaseInitializer.class);

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) throws Exception {
        logger.info("开始初始化数据库...");

        try {
            // 检查数据库中是否已有表
            Integer tableCount = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM sqlite_master WHERE type='table'", Integer.class);

            if (tableCount == null || tableCount == 0) {
                logger.info("数据库为空，开始创建表...");

                // 从类路径加载SQL脚本
                ClassPathResource resource = new ClassPathResource("db/init_database.sql");
                String sqlScript = FileCopyUtils
                        .copyToString(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8));

                // 记录SQL脚本内容
                logger.debug("执行SQL脚本:\n{}", sqlScript);

                // 分割SQL脚本为单独的语句
                String[] sqlStatements = sqlScript.split(";");

                // 逐个执行SQL语句并记录结果
                for (int i = 0; i < sqlStatements.length; i++) {
                    String statement = sqlStatements[i].trim();
                    if (!statement.isEmpty()) {
                        try {
                            logger.info("执行SQL语句 {}/{}: {}", i + 1, sqlStatements.length,
                                    statement.substring(0, Math.min(50, statement.length())));
                            jdbcTemplate.execute(statement);
                            logger.info("SQL语句执行成功");
                        } catch (Exception e) {
                            logger.error("SQL语句执行失败: {}", statement, e);
                            throw e;
                        }
                    }
                }
                logger.info("数据库表创建完成！");
            } else {
                logger.info("数据库已包含 {} 个表，检查是否缺少必要表...", tableCount);

                // 检查关键表是否存在
                String[] requiredTables = { "characters", "portraits", "backgrounds", "audios", "character_portraits" };
                boolean allTablesExist = true;

                for (String tableName : requiredTables) {
                    Integer count = jdbcTemplate.queryForObject(
                            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
                            Integer.class, tableName);

                    if (count == null || count == 0) {
                        logger.warn("表 {} 不存在，需要创建", tableName);
                        allTablesExist = false;
                    }
                }

                if (!allTablesExist) {
                    logger.info("缺少必要的表，执行初始化脚本...");

                    // 从类路径加载SQL脚本
                    ClassPathResource resource = new ClassPathResource("db/init_database.sql");
                    String sqlScript = FileCopyUtils
                            .copyToString(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8));

                    // 记录SQL脚本内容
                    logger.debug("执行SQL脚本:\n{}", sqlScript);

                    // 分割SQL脚本为单独的语句
                    String[] sqlStatements = sqlScript.split(";");

                    // 逐个执行SQL语句并记录结果
                    for (int i = 0; i < sqlStatements.length; i++) {
                        String statement = sqlStatements[i].trim();
                        if (!statement.isEmpty()) {
                            try {
                                logger.info("执行SQL语句 {}/{}: {}", i + 1, sqlStatements.length,
                                        statement.substring(0, Math.min(50, statement.length())));
                                jdbcTemplate.execute(statement);
                                logger.info("SQL语句执行成功");
                            } catch (Exception e) {
                                logger.error("SQL语句执行失败: {}", statement, e);
                                throw e;
                            }
                        }
                    }

                    logger.info("数据库表创建完成！");
                } else {
                    logger.info("所有必要的表都已存在，跳过初始化");
                }
            }
        } catch (Exception e) {
            logger.error("数据库初始化失败: {}", e.getMessage(), e);
            throw e;
        }
    }
}