package com.lbc_plot.config;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 存储配置类（已迁移为 @ConfigurationProperties 绑定）
 * 管理文件存储相关的配置参数
 */
@Component
@ConfigurationProperties(prefix = "storage")
public class StorageConfig implements InitializingBean {

    @Autowired
    private AppProperties appProperties;

    // 背景图片存储目录（相对于应用程序根目录）
    private String backgroundsDir = "assets/backgrounds";

    // 缩略图存储目录（相对于应用程序根目录）
    private String thumbnailsDir = "assets/thumbnails";

    // 是否启用文件版本控制（文件名中包含哈希值）
    private boolean enableVersioning = true;

    // 最大文件大小（MB）
    private int maxFileSize = 10;

    // 支持的图片格式
    private String supportedFormats = "jpg,jpeg,png,gif,bmp";

    // 是否生成缩略图
    private boolean generateThumbnails = true;

    // 缩略图宽度
    private int thumbnailWidth = 200;

    // 缩略图高度
    private int thumbnailHeight = 200;

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

    // Getters & Setters
    public String getBackgroundsDir() {
        return backgroundsDir;
    }

    public void setBackgroundsDir(String backgroundsDir) {
        this.backgroundsDir = backgroundsDir;
    }

    public String getThumbnailsDir() {
        return thumbnailsDir;
    }

    public void setThumbnailsDir(String thumbnailsDir) {
        this.thumbnailsDir = thumbnailsDir;
    }

    public boolean isEnableVersioning() {
        return enableVersioning;
    }

    public void setEnableVersioning(boolean enableVersioning) {
        this.enableVersioning = enableVersioning;
    }

    public int getMaxFileSize() {
        return maxFileSize;
    }

    public void setMaxFileSize(int maxFileSize) {
        this.maxFileSize = maxFileSize;
    }

    public String getSupportedFormats() {
        return supportedFormats;
    }

    public void setSupportedFormats(String supportedFormats) {
        this.supportedFormats = supportedFormats;
    }

    public boolean isGenerateThumbnails() {
        return generateThumbnails;
    }

    public void setGenerateThumbnails(boolean generateThumbnails) {
        this.generateThumbnails = generateThumbnails;
    }

    public int getThumbnailWidth() {
        return thumbnailWidth;
    }

    public void setThumbnailWidth(int thumbnailWidth) {
        this.thumbnailWidth = thumbnailWidth;
    }

    public int getThumbnailHeight() {
        return thumbnailHeight;
    }

    public void setThumbnailHeight(int thumbnailHeight) {
        this.thumbnailHeight = thumbnailHeight;
    }
}
