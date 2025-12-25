package com.lbc_plot.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC配置类，用于处理静态资源映射
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 映射assets目录下的所有资源
        registry.addResourceHandler("/assets/**")
                .addResourceLocations("classpath:/assets/", "file:./src/main/resources/assets/")
                .setCachePeriod(3600)
                .resourceChain(true);

        // 映射名片图片资源
        registry.addResourceHandler("/api/character-card/**")
                .addResourceLocations("file:./src/main/resources/assets/thumbnails/character_cards/")
                .setCachePeriod(3600)
                .resourceChain(true);
    }
}
