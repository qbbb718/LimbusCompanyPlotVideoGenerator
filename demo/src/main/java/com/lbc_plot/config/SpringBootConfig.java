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

import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.resource.dao.BackgroundDAO;
import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.dao.MyCharacterMapper;
import com.lbc_plot.resource.dao.PortraitDAO;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.service.BackgroundService;
import com.lbc_plot.resource.service.CharacterService;
import com.lbc_plot.render.engine.FrameComposerService;
import com.lbc_plot.render.service.impl.BackgroundServiceImpl;
import com.lbc_plot.render.service.impl.CharacterServiceImpl;

import org.springframework.jdbc.datasource.TransactionAwareDataSourceProxy;

/**
 * Spring Boot配置类
 */
@Configuration
public class SpringBootConfig {

    /**
     * 配置数据源。
     *
     * <p>SQLite 连接串统一取自 {@link DatabaseConfig#getDatabaseUrl()}（由 {@link RuntimePaths}
     * 解析成绝对路径），不再在这里写死 {@code jdbc:sqlite:./data/project.db}。
     *
     * <p>旧实现写死相对路径，而 {@code application.yml} 里又是另一个相对路径，导致同一个进程
     * 通过不同数据访问层可能打开<strong>不同的库文件</strong>，且都随 JVM 工作目录漂移。
     *
     * <p>注意：这里显式 setUrl 之后，{@code @ConfigurationProperties(prefix = "spring.datasource")}
     * 仍会用 yml/环境里的值覆盖，而 yml 的 {@code spring.datasource.url} 又是
     * {@code ${lbc.datasource.url}}（默认值即本方法选用的同一个绝对路径），因此两条路径最终一致。
     */
    @Bean
    @ConfigurationProperties(prefix = "spring.datasource")
    public DataSource dataSource() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.sqlite.JDBC");
        dataSource.setUrl(DatabaseConfig.getDatabaseUrl());
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

    /**
     * 配置角色服务实例
     */
    @Bean
    public CharacterService characterService(Jdbi jdbi) {
        return new CharacterServiceImpl(jdbi.onDemand(CharacterDAO.class), jdbi.onDemand(PortraitDAO.class));
    }

    /**
     * 配置背景服务实例
     */
    @Bean
    public BackgroundService backgroundService(Jdbi jdbi) {
        return new BackgroundServiceImpl(jdbi.onDemand(BackgroundDAO.class));
    }
}