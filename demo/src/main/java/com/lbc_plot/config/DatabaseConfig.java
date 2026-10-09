package com.lbc_plot.config;

import org.springframework.context.annotation.Configuration;

import com.lbc_plot.common.util.RuntimePaths;

/**
 * 数据库配置。
 *
 * <p>SQLite 库位置不再写死为相对路径 {@code ./data/project.db}：相对路径会让"打开哪个库"
 * 取决于 JVM 工作目录（安装版是用户数据目录，开发时是 {@code demo/}），同一个应用因此可能
 * 操作到两个不同的数据库。现在统一由 {@link RuntimePaths} 解析成绝对路径
 * {@code {dataRoot}/data/project.db}。
 *
 * <p>该路径通过 {@code SpringApplication#setDefaultProperties} 以 {@code lbc.datasource.url}
 * 注入（见 {@code MainApplication}），供 {@code application.yml} 的
 * {@code spring.datasource.url} 占位符使用；优先级低于命令行参数、环境变量与 yml，
 * 因此仍可用标准方式覆盖。
 *
 * <p>历史上这里还从 classpath 的 {@code db/config/database.properties} 读取
 * {@code database.url}，但那个文件只会把相对路径又写回来，与本类的目标冲突，已移除。
 *
 * @author 项目维护者
 * @since 1.0
 */
@Configuration
public class DatabaseConfig {

    /** 从 RuntimePaths 解析出的 SQLite JDBC URL（绝对路径）。 */
    public static String getDatabaseUrl() {
        return RuntimePaths.getDatabaseUrl();
    }
}
