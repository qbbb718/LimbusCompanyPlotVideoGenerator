package com.lbc_plot.config;

import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.core.mapper.RowMapper;
import org.jdbi.v3.core.statement.SqlStatements;
import org.jdbi.v3.sqlobject.SqlObjectPlugin;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.TransactionAwareDataSourceProxy;

import javax.sql.DataSource;
import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.DAO.mappers.MyCharacterMapper;

/**
 * JDBI配置类
 */
@Configuration
public class JdbiConfig {

    /**
     * 配置JDBI实例
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
}