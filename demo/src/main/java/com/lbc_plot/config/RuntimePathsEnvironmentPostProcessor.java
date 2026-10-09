package com.lbc_plot.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import com.lbc_plot.common.util.RuntimePaths;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 把运行时数据目录解析出的绝对路径注入 Spring 环境。
 *
 * <h2>为什么必须在这一层做</h2>
 * {@code application.yml} 里的 {@code spring.datasource.url: ${lbc.datasource.url}} 是在
 * <em>属性源解析阶段</em>求值的。仅仅在 {@code SpringApplication#setDefaultProperties} 或
 * 某个 {@code @Bean} 方法里给值是不够的：只要别处（例如 {@code application.properties}）
 * 又定义了一个 {@code spring.datasource.url}，占位符就可能以未解析的字符串形式被采用，
 * 最终报 {@code No suitable driver found for ${lbc.datasource.url}}。
 *
 * <p>{@link EnvironmentPostProcessor} 在环境准备好之后、任何 Bean 创建之前执行，
 * 且对<em>所有</em>启动入口都生效（{@code MainApplication}、{@code @SpringBootTest} 等），
 * 因此这里注入的值一定会被占位符看到，不必依赖某个特定的 main 方法。
 *
 * <p>注册位置：{@code src/main/resources/META-INF/spring.factories}。
 *
 * @author 项目维护者
 * @since 1.0
 */
public class RuntimePathsEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    /** 数据库 JDBC URL 的属性名，{@code application.yml} 通过它引用 */
    public static final String DATASOURCE_URL_PROPERTY = "lbc.datasource.url";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Map<String, Object> resolved = new LinkedHashMap<>();
        resolved.put(DATASOURCE_URL_PROPERTY, RuntimePaths.getDatabaseUrl());
        // 同时暴露数据根目录，便于日志/诊断读取（RuntimePaths 本身仍是唯一实现来源）
        resolved.put("lbc.data.root", RuntimePaths.toPortableString(RuntimePaths.getDataRoot()));

        environment.getPropertySources().addLast(
                new MapPropertySource("lbcRuntimePaths", resolved));
    }

    @Override
    public int getOrder() {
        // 尽早执行，确保在属性源解析引用该属性之前就位
        return Ordered.HIGHEST_PRECEDENCE + 10;
    }
}
