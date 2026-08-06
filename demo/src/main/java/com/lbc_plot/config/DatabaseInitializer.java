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

    // helper to log which database file is being used
    private void logDatabaseUrl() {
        try {
            String url = jdbcTemplate.getDataSource().getConnection().getMetaData().getURL();
            logger.info("使用的数据库 URL: {}", url);
        } catch (Exception e) {
            logger.warn("无法获取数据库 URL", e);
        }
    }

    @Override
    public void run(String... args) throws Exception {
        logger.info("开始初始化数据库...");

        try {
            // log which database we're connected to
            logDatabaseUrl();

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
                    logger.info("所有必要的表都已存在，检查是否需要更新表结构...");

                    // 检查characters表是否有character_card_image_path列
                    try {
                        Integer columnCount = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('characters') WHERE name='character_card_image_path'",
                                Integer.class);

                        if (columnCount != null && columnCount == 0) {
                            logger.info("characters表缺少character_card_image_path列，正在添加...");
                            jdbcTemplate.execute("ALTER TABLE characters ADD COLUMN character_card_image_path TEXT");
                            logger.info("成功添加character_card_image_path列");
                        } else {
                            logger.info("characters表已包含character_card_image_path列");
                        }
                    } catch (Exception e) {
                        logger.error("检查或添加character_card_image_path列时出错: " + e.getMessage(), e);
                    }

                    // 检查characters表是否有folder_name列（用于角色拼音子目录）
                    try {
                        Integer columnCount = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('characters') WHERE name='folder_name'",
                                Integer.class);

                        if (columnCount != null && columnCount == 0) {
                            logger.info("characters表缺少folder_name列，正在添加...");
                            jdbcTemplate.execute("ALTER TABLE characters ADD COLUMN folder_name TEXT");
                            logger.info("成功添加folder_name列");
                        } else {
                            logger.info("characters表已包含folder_name列");
                        }
                    } catch (Exception e) {
                        logger.error("检查或添加folder_name列时出错: " + e.getMessage(), e);
                    }

                    // 检查backgrounds表是否有thumbnail_path列
                    try {
                        Integer columnCount = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('backgrounds') WHERE name='thumbnail_path'",
                                Integer.class);

                        if (columnCount != null && columnCount == 0) {
                            logger.info("backgrounds表缺少thumbnail_path列，正在添加...");
                            jdbcTemplate.execute("ALTER TABLE backgrounds ADD COLUMN thumbnail_path TEXT");
                            logger.info("成功添加thumbnail_path列");
                        } else {
                            logger.info("backgrounds表已包含thumbnail_path列");
                        }
                    } catch (Exception e) {
                        logger.error("检查或添加thumbnail_path列时出错: " + e.getMessage(), e);
                    }

                    logger.info("表结构检查完成");

                    // 额外检查 audios 表结构是否符合新 schema
                    try {
                        // migrate to new column names if necessary
                        Integer cnt;

                        cnt = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('audios') WHERE name='uuid'", Integer.class);
                        if (cnt != null && cnt == 0) {
                            logger.info("audios 表缺少 uuid 列，尝试迁移旧结构");
                            jdbcTemplate.execute("ALTER TABLE audios ADD COLUMN uuid TEXT");
                            jdbcTemplate.execute("UPDATE audios SET uuid = audio_id");
                            logger.info("已添加 uuid 列并复制旧 audio_id 值");
                        }
                        cnt = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('audios') WHERE name='name'", Integer.class);
                        if (cnt != null && cnt == 0) {
                            logger.info("audios 表缺少 name 列，复制 display_name");
                            jdbcTemplate.execute("ALTER TABLE audios ADD COLUMN name TEXT");
                            jdbcTemplate.execute("UPDATE audios SET name = display_name");
                        }
                        cnt = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('audios') WHERE name='path'", Integer.class);
                        if (cnt != null && cnt == 0) {
                            logger.info("audios 表缺少 path 列，复制 file_path");
                            jdbcTemplate.execute("ALTER TABLE audios ADD COLUMN path TEXT");
                            jdbcTemplate.execute("UPDATE audios SET path = file_path");
                        }
                        cnt = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('audios') WHERE name='type'", Integer.class);
                        if (cnt != null && cnt == 0) {
                            logger.info("audios 表缺少 type 列，添加空列");
                            jdbcTemplate.execute("ALTER TABLE audios ADD COLUMN type TEXT");
                        }
                        cnt = jdbcTemplate.queryForObject(
                                "SELECT count(*) FROM pragma_table_info('audios') WHERE name='tags'", Integer.class);
                        if (cnt != null && cnt == 0) {
                            logger.info("audios 表缺少 tags 列，添加空列");
                            jdbcTemplate.execute("ALTER TABLE audios ADD COLUMN tags TEXT");
                        }
                    } catch (Exception e) {
                        logger.warn("检查 audios 表结构时出错", e);
                    }
                }
            }
        } catch (Exception e) {
            logger.error("数据库初始化失败: {}", e.getMessage(), e);
            throw e;
        }
    }
}
