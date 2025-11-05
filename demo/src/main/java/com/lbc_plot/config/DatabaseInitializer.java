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
                String sqlScript = FileCopyUtils.copyToString(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8));

                // 执行SQL脚本
                jdbcTemplate.execute(sqlScript);

                logger.info("数据库表创建完成！");
            } else {
                logger.info("数据库已包含 {} 个表，跳过初始化", tableCount);
            }
        } catch (Exception e) {
            logger.error("数据库初始化失败: {}", e.getMessage(), e);
            throw e;
        }
    }
}