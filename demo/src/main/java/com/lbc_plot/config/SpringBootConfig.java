package com.lbc_plot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import javax.sql.DataSource;
import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.core.mapper.RowMapper;
import org.jdbi.v3.core.statement.SqlStatements;
import org.jdbi.v3.sqlobject.SqlObjectPlugin;

import com.lbc_plot.resource.dao.MyCharacterMapper;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.render.engine.FrameComposerService;

import org.springframework.jdbc.datasource.TransactionAwareDataSourceProxy;

/**
 * Spring Boot配置类
 */
@Configuration
public class SpringBootConfig {

    /**
     * 配置数据源
     */
    @Bean
    @ConfigurationProperties(prefix = "spring.datasource")
    public DataSource dataSource() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.sqlite.JDBC");
        dataSource.setUrl("jdbc:sqlite:./data/project.db");
        return dataSource;
    }

    /**
     * 配置Jdbi实例
     */
    @Bean
    public Jdbi jdbi(DataSource dataSource) {
        // 使用TransactionAwareDataSourceProxy确保与Spring事务管理兼容
        TransactionAwareDataSourceProxy proxyDataSource = new TransactionAwareDataSourceProxy(dataSource);

        Jdbi jdbi = Jdbi.create(proxyDataSource);

        // 安装SQL Object插件
        jdbi.installPlugin(new SqlObjectPlugin());

        // 注册自定义映射器
        jdbi.registerRowMapper(MyCharacter.class, new MyCharacterMapper());

        // 配置SQL语句选项
        jdbi.getConfig(SqlStatements.class)
                .setUnusedBindingAllowed(false);

        return jdbi;
    }

    /**
     * 配置FrameComposerService实例
     */
    @Bean
    public FrameComposerService frameComposerService() {
        return new FrameComposerService();
    }
}