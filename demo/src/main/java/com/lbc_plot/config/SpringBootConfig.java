package com.lbc_plot.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.core.mapper.RowMapper;
import org.jdbi.v3.core.statement.SqlStatements;
import org.jdbi.v3.sqlobject.SqlObjectPlugin;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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

    private static final Logger logger = LoggerFactory.getLogger(SpringBootConfig.class);

    /**
     * 配置数据源（带连接池）。
     *
     * <p>SQLite 连接串统一取自 {@link DatabaseConfig#getDatabaseUrl()}（由 {@link RuntimePaths}
     * 解析成绝对路径），不再在这里写死 {@code jdbc:sqlite:./data/project.db}。
     *
     * <p><b>为什么要用连接池</b>：以前这里是 {@link org.springframework.jdbc.datasource.DriverManagerDataSource}，
     * 它<b>每次 {@code getConnection()} 都新建一条物理连接</b>。而本项目里
     * {@code jdbi.withHandle/withExtension} 到处都是（{@code CharacterMapper} 甚至每映射一行角色
     * 就再开一条），于是在"取角色列表"这种纯读接口上会被建连开销拖慢。运行日志里
     * {@code GET /api/characters} 对 2 个角色 20/20 次都要 3~4 秒，就是这个原因。
     *
     * <p>SQLite 的特性决定了参数要保守：
     * <ul>
     *   <li>{@code maximumPoolSize} 取小值（8）：SQLite 同一时刻只允许一个写者，
     *       连接开太多只会互相等锁，不会更快；</li>
     *   <li>{@code busy_timeout} 显式设成 8 秒：并发写时让驱动等锁而不是立刻抛
     *       {@code SQLITE_BUSY}（默认值在旧驱动上是 3 秒左右）；</li>
     *   <li>{@code foreign_keys=on}：与建表脚本里的外键声明一致。</li>
     * </ul>
     *
     * <p>注意：这里不再加 {@code @ConfigurationProperties}，因为把 {@code spring.datasource.url}
     * 绑到 {@link HikariDataSource} 上并不成立（它认 {@code jdbcUrl}），容易造成
     * "yml 里改了却不生效"的误判。池参数从 {@code spring.datasource.hikari.*} 显式读取。
     */
    @Bean(destroyMethod = "close")
    public HikariDataSource dataSource(org.springframework.core.env.Environment environment) {
        HikariConfig config = new HikariConfig();
        config.setPoolName("lbc-sqlite-pool");
        config.setDriverClassName("org.sqlite.JDBC");
        config.setJdbcUrl(DatabaseConfig.getDatabaseUrl());

        config.setMaximumPoolSize(poolSize(environment));
        config.setMinimumIdle(1);
        config.setConnectionTimeout(environment.getProperty(
                "spring.datasource.hikari.connection-timeout", Long.class, 30_000L));
        config.setIdleTimeout(environment.getProperty(
                "spring.datasource.hikari.idle-timeout", Long.class, 600_000L));
        config.setMaxLifetime(environment.getProperty(
                "spring.datasource.hikari.max-lifetime", Long.class, 1_800_000L));

        // 交给 sqlite-jdbc 的连接属性（未知参数会被驱动忽略，不会导致启动失败）
        config.addDataSourceProperty("busy_timeout",
                environment.getProperty("spring.datasource.hikari.busy-timeout", "8000"));
        config.addDataSourceProperty("foreign_keys", "true");

        logger.info("SQLite 连接池: url={}, maxPoolSize={}", DatabaseConfig.getDatabaseUrl(),
                config.getMaximumPoolSize());
        return new HikariDataSource(config);
    }

    /**
     * 连接池大小：默认 8，可用 {@code spring.datasource.hikari.maximum-pool-size} 覆盖。
     *
     * <p>上限夹在 1~16：SQLite 写操作本来就串行，池子再大也没有收益，
     * 反而让"锁等待"更难排查。
     */
    private static int poolSize(org.springframework.core.env.Environment environment) {
        Integer configured = environment.getProperty(
                "spring.datasource.hikari.maximum-pool-size", Integer.class, 8);
        int size = configured == null ? 8 : configured;
        return Math.max(1, Math.min(16, size));
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