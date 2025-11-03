package com.lbc_plot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import javax.sql.DataSource;
import org.jdbi.v3.core.Jdbi;
import com.lbc_plot.core.Composer.FrameComposerService;

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
        return Jdbi.create(dataSource);
    }
    
    /**
     * 配置FrameComposerService实例
     */
    @Bean
    public FrameComposerService frameComposerService() {
        return new FrameComposerService();
    }
}