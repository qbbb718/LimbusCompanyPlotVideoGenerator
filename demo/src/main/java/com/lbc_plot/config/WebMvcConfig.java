package com.lbc_plot.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.lbc_plot.config.ProjectConfig;

/**
 * Web MVC配置类
 *
 * 配置Spring MVC的静态资源处理和视图解析。
 * 主要负责：
 * - 静态资源（如图片、CSS、JS文件）的URL映射
 * - 资源缓存策略设置
 * - 资源文件的位置配置
 *
 * @author 项目维护者
 * @since 1.0
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Autowired
    private AppConfig appConfig;

    /**
     * 配置静态资源处理器
     *
     * 将URL路径映射到实际的文件系统位置：
     * - /assets/** -> classpath:/assets/ 和配置的assets路径
     *
     * 说明：角色名片图片由 CharacterCardController 动态生成返回（不再用静态资源映射），
     * 名片磁盘缓存与立绘缩略图都存在 {characters}/{拼音}/{characterThumbnailsSubdir}/ 下，
     * 通过 /assets/** 映射即可访问。
     *
     * 所有资源设置1小时缓存期。
     *
     * @param registry 资源处理器注册表
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 映射assets目录下的所有资源
        registry.addResourceHandler("/assets/**")
                .addResourceLocations("classpath:/assets/", "file:" + appConfig.getAssets().getPath() + "/")
                .setCachePeriod(3600)
                .resourceChain(true);
    }
}
