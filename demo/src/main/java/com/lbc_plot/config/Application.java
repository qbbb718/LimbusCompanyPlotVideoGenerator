package com.lbc_plot.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * LimbusCompany Plot Video Generator 主应用程序类
 *
 * Spring Boot应用的主入口点，负责：
 * - 启动Spring容器和所有配置
 * - 初始化音频系统
 * - 启动应用逻辑
 *
 * 应用使用 @SpringBootApplication 注解，自动扫描 com.lbc_plot 包下的组件。
 *
 * @author 项目维护者
 * @since 1.0
 */
@SpringBootApplication(scanBasePackages = "com.lbc_plot")
public class Application {

    /**
     * 应用程序主方法
     *
     * @param args 命令行参数
     */
    public static void main(String[] args) {
        try {
            // 启动Spring Boot应用
            ConfigurableApplicationContext context = SpringApplication.run(Application.class, args);

            // 初始化音频系统
            AudioAppConfig.initializeAudioSystem();

            // 启动GUI或处理逻辑
            startApplication();

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * 启动应用程序逻辑
     * 此方法在Spring容器启动后调用，用于初始化应用特定的逻辑
     */
    private static void startApplication() {
        // 你的应用程序逻辑
        // 这里可以添加启动时需要执行的逻辑
    }
}