package com.lbc_plot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 应用属性配置类
 *
 * 此类使用 Spring Boot 的 @ConfigurationProperties 注解将配置文件中的属性
 * 自动绑定到 Java 对象。配置前缀为 "app"，对应的配置文件属性如：
 * app.storage-location=xxx
 * app.render-threads=4
 * app.cache-enabled=true
 *
 * @author 项目维护者
 * @since 1.0
 */
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    /**
     * 存储根目录位置
     * 指定应用存储文件的基础目录路径
     * 如果设置，此路径会与 StorageConfig 中的相对路径拼接
     */
    private String storageLocation;

    /**
     * 渲染线程数量
     * 指定视频渲染时使用的线程数
     * 默认值为 4
     */
    private int renderThreads = 4;

    /**
     * 是否启用缓存
     * 控制应用是否启用缓存功能
     * 默认值为 true
     */
    private boolean cacheEnabled = true;

    /**
     * 获取存储根目录位置
     * @return 存储根目录路径
     */
    public String getStorageLocation() {
        return storageLocation;
    }

    /**
     * 设置存储根目录位置
     * @param storageLocation 存储根目录路径
     */
    public void setStorageLocation(String storageLocation) {
        this.storageLocation = storageLocation;
    }

    /**
     * 获取渲染线程数量
     * @return 渲染线程数
     */
    public int getRenderThreads() {
        return renderThreads;
    }

    /**
     * 设置渲染线程数量
     * @param renderThreads 渲染线程数
     */
    public void setRenderThreads(int renderThreads) {
        this.renderThreads = renderThreads;
    }

    /**
     * 获取缓存启用状态
     * @return true 如果启用缓存，false 否则
     */
    public boolean isCacheEnabled() {
        return cacheEnabled;
    }

    /**
     * 设置缓存启用状态
     * @param cacheEnabled 缓存启用状态
     */
    public void setCacheEnabled(boolean cacheEnabled) {
        this.cacheEnabled = cacheEnabled;
    }
}
