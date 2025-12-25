package com.lbc_plot.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.relational.core.dialect.Dialect;
import org.springframework.data.relational.core.dialect.SqlServerDialect;

/**
 * SQLite方言配置类
 */
@Configuration
public class SqliteDialectConfig {

    @Bean("sqliteDialect")
    @Primary
    public Dialect jdbcDialect() {
        // 由于Spring Data JDBC没有内置SQLite方言，我们使用SqlServerDialect作为临时解决方案
        return SqlServerDialect.INSTANCE;
    }
}
