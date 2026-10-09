package com.lbc_plot.config;

import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 兼容用的 Spring 配置类。
 *
 * <p>历史上这里也有一份 {@code main}，与 {@code com.lbc_plot.MainApplication} 重复，而且那份
 * <em>没有</em>注入 {@code lbc.datasource.url} 默认属性（见 {@code MainApplication}），
 * 于是从不同入口启动就可能拿到不同的数据库/素材目录。现在启动逻辑只保留一处：
 * {@code com.lbc_plot.MainApplication#main}。
 *
 * <p>本类保留 {@code @SpringBootApplication} 仅用于组件扫描与测试引导
 * （{@code @SpringBootTest(classes = Application.class)}）。
 *
 * @author 项目维护者
 * @since 1.0
 */
@SpringBootApplication(scanBasePackages = "com.lbc_plot")
public class Application {
}
