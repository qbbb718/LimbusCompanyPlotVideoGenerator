package com.lbc_plot.main;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

import com.lbc_plot.config.AppConfig;

/**
 * LimbusCompany Plot Video Generator 主应用程序
 */
@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        try {
            // 启动Spring Boot应用
            ConfigurableApplicationContext context = SpringApplication.run(Application.class, args);

            // 初始化音频系统
            AppConfig.initializeAudioSystem();

            // 启动GUI或处理逻辑
            startApplication();

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static void startApplication() {
        // 你的应用程序逻辑
        // 这里可以添加启动时需要执行的逻辑
    }
}