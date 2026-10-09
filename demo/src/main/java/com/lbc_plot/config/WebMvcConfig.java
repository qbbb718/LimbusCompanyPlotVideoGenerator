package com.lbc_plot.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.lbc_plot.common.util.RuntimePaths;

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
     * - /assets/**   -> 用户数据目录下的 assets（绝对路径，由 RuntimePaths 解析）
     * - /projects/** -> 用户数据目录下的 projects（临时素材）
     *
     * 说明：角色名片图片由 CharacterCardController 动态生成返回（不再用静态资源映射），
     * 名片磁盘缓存与立绘缩略图都存在 {characters}/{拼音}/{characterThumbnailsSubdir}/ 下，
     * 通过 /assets/** 映射即可访问。
     *
     * 注意：这里不再使用 {@code file:./assets/} 这类相对路径位置。相对路径会按 JVM 工作目录
     * 解析，导致开发模式（cwd=demo/）与安装版（cwd=用户数据目录）读到不同目录。
     *
     * 所有资源设置1小时缓存期。
     *
     * @param registry 资源处理器注册表
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // assets 根目录：优先使用 AppConfig 中已解析的路径，保证与写入端（StorageService 等）一致
        String assetsDir = appConfig.getAssets().getPath();
        if (assetsDir == null || assetsDir.isBlank()) {
            assetsDir = RuntimePaths.toPortableString(RuntimePaths.getAssetsDir());
        }

        registry.addResourceHandler("/assets/**")
                .addResourceLocations("classpath:/assets/", toFileLocation(assetsDir))
                .setCachePeriod(3600)
                .resourceChain(true);

        // 映射项目临时素材目录（NPC图片、道具等）
        registry.addResourceHandler("/projects/**")
                .addResourceLocations(toFileLocation(RuntimePaths.toPortableString(RuntimePaths.getProjectsDir())))
                .setCachePeriod(3600)
                .resourceChain(true);
    }

    /**
     * 把文件系统目录转成 Spring 资源位置。
     *
     * <p>必须做到三点，否则映射会静默失效或指向错误目录：
     * <ol>
     *   <li>使用绝对路径（相对路径会按 cwd 解析）；</li>
     *   <li>结尾保留 '/'，否则会被当成文件名而不是目录；</li>
     *   <li>Windows 盘符路径需要规范成 {@code file:/C:/.../} 形式。</li>
     * </ol>
     */
    private String toFileLocation(String dir) {
        String normalized = dir.replace('\\', '/');
        if (!normalized.startsWith("/")) {
            normalized = "/" + normalized;
        }
        if (!normalized.endsWith("/")) {
            normalized = normalized + "/";
        }
        return "file:" + normalized;
    }
}
