package com.lbc_plot.config;

import org.springframework.beans.factory.InitializingBean;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;

/**
 * 存储配置类
 * 管理文件存储相关的配置参数
 */
@Configuration
@PropertySource("classpath:storage.properties")
public class StorageConfig implements InitializingBean {

    @Autowired
    private AppProperties appProperties;

    // 背景图片存储目录（相对于应用程序根目录）
    @Value("${storage.backgrounds.dir:assets/backgrounds}")
    private String backgroundsDir;

    // 缩略图存储目录（相对于应用程序根目录）
    @Value("${storage.thumbnails.dir:assets/thumbnails}")
    private String thumbnailsDir;

    // 是否启用文件版本控制（文件名中包含哈希值）
    @Value("${storage.enable.versioning:true}")
    private boolean enableVersioning;

    // 最大文件大小（MB）
    @Value("${storage.max.file.size:10}")
    private int maxFileSize;

    // 支持的图片格式
    @Value("${storage.supported.formats:jpg,jpeg,png,gif,bmp}")
    private String supportedFormats;

    // 是否生成缩略图
    @Value("${storage.generate.thumbnails:true}")
    private boolean generateThumbnails;

    // 缩略图宽度
    @Value("${storage.thumbnail.width:200}")
    private int thumbnailWidth;

    // 缩略图高度
    @Value("${storage.thumbnail.height:200}")
    private int thumbnailHeight;

    @Override
    public void afterPropertiesSet() {
        String base = appProperties != null ? appProperties.getStorageLocation() : null;
        if (base != null && !base.isEmpty()) {
            if (!base.endsWith("/")) {
                base = base + "/";
            }
            // 如果 AppProperties 指定了根存储路径，则在原有相对路径前拼接
            if (backgroundsDir != null && !backgroundsDir.startsWith(base)) {
                backgroundsDir = base + backgroundsDir;
            }
            if (thumbnailsDir != null && !thumbnailsDir.startsWith(base)) {
                thumbnailsDir = base + thumbnailsDir;
            }
        }
    }

    // Getters
    public String getBackgroundsDir() {
        return backgroundsDir;
    }

    public String getThumbnailsDir() {
        return thumbnailsDir;
    }

    public boolean isEnableVersioning() {
        return enableVersioning;
    }

    public int getMaxFileSize() {
        return maxFileSize;
    }

    public String getSupportedFormats() {
        return supportedFormats;
    }

    public boolean isGenerateThumbnails() {
        return generateThumbnails;
    }

    public int getThumbnailWidth() {
        return thumbnailWidth;
    }

    public int getThumbnailHeight() {
        return thumbnailHeight;
    }
}
