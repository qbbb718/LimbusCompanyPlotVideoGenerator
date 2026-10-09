package com.lbc_plot.config;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 存储配置类（已迁移为 @ConfigurationProperties 绑定）
 * 管理文件存储相关的配置参数
 *
 * 此配置类负责管理应用中所有文件存储相关的设置，包括：
 * - 背景图片和缩略图的存储目录
 * - 文件版本控制策略
 * - 支持的文件格式和大小限制
 * - 缩略图生成参数
 *
 * 配置属性通过 application.yml 中的 storage.* 前缀进行绑定。
 *
 * @author 项目维护者
 * @since 1.0
 */
@Component
@ConfigurationProperties(prefix = "storage")
public class StorageConfig implements InitializingBean {

    @Autowired
    private AppConfig appConfig;

    /**
     * 背景图片存储目录（相对于应用程序根目录）
     * 默认值为 "assets/backgrounds"
     * 如果 AppProperties 中指定了 storageLocation，则会拼接为完整路径
     */
    private String backgroundsDir = "assets/backgrounds";

    /**
     * 缩略图存储目录（相对于应用程序根目录）
     * 默认值为 "assets/thumbnails"
     * 如果 AppProperties 中指定了 storageLocation，则会拼接为完整路径
     */
    private String thumbnailsDir = "assets/thumbnails";

    /**
     * 是否启用文件版本控制（文件名中包含哈希值）
     * 启用后，文件名会包含文件内容的MD5哈希值，用于避免缓存问题
     * 默认值为 true
     */
    private boolean enableVersioning = true;

    /**
     * 最大文件大小（MB）
     * 限制上传文件的最大大小
     * 默认值为 10MB
     */
    private int maxFileSize = 10;

    /**
     * 支持的图片格式
     * 用逗号分隔的格式列表
     *
     * <p>注意：默认 profile 下 application.yml 没有 storage 配置块，实际生效的就是这里的默认值；
     * 修改后请同步 application.yml / application-dev.yml / application-prod.yml。
     * 默认值里的 webp 依赖 {@code WebpImageDecoder}（FFmpeg/JavaCV 兜底）才能被读取，
     * 因为 JDK 自带 ImageIO 不支持 WebP。
     */
    private String supportedFormats = "jpg,jpeg,png,gif,bmp,webp";

    /**
     * 是否生成缩略图
     * 控制是否在上传图片时自动生成缩略图
     * 默认值为 true
     */
    private boolean generateThumbnails = true;

    /**
     * 缩略图宽度（像素）
     * 生成缩略图的宽度，高度会按比例缩放
     * 默认值为 200
     */
    private int thumbnailWidth = 200;

    /**
     * 缩略图高度（像素）
     * 生成缩略图的高度，宽度会按比例缩放
     * 默认值为 200
     */
    private int thumbnailHeight = 200;

    @Override
    public void afterPropertiesSet() {
        // 使用配置的资源路径
        if (appConfig != null) {
            backgroundsDir = appConfig.getAssets().getBackgrounds();
            thumbnailsDir = appConfig.getAssets().getThumbnails();
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
