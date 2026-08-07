package com.lbc_plot.render.video;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.UUID;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

/**
 * 临时图片视觉元素（路人、道具等非角色管理的素材）
 *
 * 与 CharacterVisual 类似但不依赖角色/立绘系统，直接引用用户上传的图片文件。
 * 图片文件存储在 ./projects/temp/images/ 下，通过 /projects/** 静态映射访问。
 */
@JsonDeserialize(builder = TempImageVisual.Builder.class)
public class TempImageVisual extends VisualElement {
    private static final Logger logger = LoggerFactory.getLogger(TempImageVisual.class);

    private String uuid;        // 唯一标识
    private String imagePath;   // 相对路径，形如 projects/temp/images/{uuid}.png
    private int posX;           // X 坐标
    private int posY;           // Y 坐标
    private float scale;        // 缩放比例（1.0 = 原尺寸）
    private boolean dim;        // 是否压暗

    @JsonIgnore
    private transient BufferedImage image; // 懒加载缓存

    // ---- 默认值 ----
    private static final int DEFAULT_POS_X = 0;
    private static final int DEFAULT_POS_Y = 0;
    private static final float DEFAULT_SCALE = 1.0f;
    private static final boolean DEFAULT_DIM = false;

    /**
     * 私有构造函数 — 仅通过 Builder 创建
     */
    private TempImageVisual(Builder builder) {
        this.uuid = (builder.uuid != null && !builder.uuid.isEmpty())
                ? builder.uuid
                : UUID.randomUUID().toString();
        this.imagePath = builder.imagePath;
        this.posX = builder.posX;
        this.posY = builder.posY;
        this.scale = builder.scale;
        this.dim = builder.dim;
    }

    // ---- 懒加载图像 ----
    @JsonIgnore
    public BufferedImage getImage() {
        if (image == null && imagePath != null && !imagePath.trim().isEmpty()) {
            try {
                // 去掉前导 /，从 JVM 工作目录解析
                String fsPath = imagePath.startsWith("/") ? imagePath.substring(1) : imagePath;
                File f = new File(fsPath);
                if (f.exists() && f.isFile()) {
                    image = ImageIO.read(f);
                }
                if (image == null) {
                    logger.warn("无法加载临时图片: {}", imagePath);
                }
            } catch (IOException e) {
                logger.error("加载临时图片失败: {}", imagePath, e);
            }
        }
        return image;
    }

    public void setImage(BufferedImage image) {
        this.image = image;
    }

    // ---- Getters & Setters ----

    public String getUuid() {
        return uuid;
    }

    public void setUuid(String uuid) {
        this.uuid = uuid;
    }

    public String getImagePath() {
        return imagePath;
    }

    public void setImagePath(String imagePath) {
        this.imagePath = imagePath;
        this.image = null; // 路径变更后清除缓存
    }

    public int getPosX() {
        return posX;
    }

    public void setPosX(int posX) {
        this.posX = posX;
    }

    public int getPosY() {
        return posY;
    }

    public void setPosY(int posY) {
        this.posY = posY;
    }

    public float getScale() {
        return scale;
    }

    public void setScale(float scale) {
        this.scale = scale;
    }

    public boolean isDim() {
        return dim;
    }

    public void setDim(boolean dim) {
        this.dim = dim;
    }

    @Override
    public String toString() {
        return "TempImageVisual{" +
                "uuid='" + uuid + '\'' +
                ", imagePath='" + imagePath + '\'' +
                ", posX=" + posX +
                ", posY=" + posY +
                ", scale=" + scale +
                ", dim=" + dim +
                '}';
    }

    // ================================================================
    // Builder
    // ================================================================

    public static class Builder {
        @JsonProperty
        private String uuid;

        @JsonProperty
        private String imagePath;

        @JsonProperty
        private int posX = DEFAULT_POS_X;

        @JsonProperty
        private int posY = DEFAULT_POS_Y;

        @JsonProperty
        private float scale = DEFAULT_SCALE;

        @JsonProperty
        private boolean dim = DEFAULT_DIM;

        /** 无参构造器（Jackson 反序列化必需） */
        public Builder() {
        }

        public Builder uuid(String uuid) {
            this.uuid = uuid;
            return this;
        }

        public Builder imagePath(String imagePath) {
            this.imagePath = imagePath;
            return this;
        }

        public Builder posX(int posX) {
            this.posX = posX;
            return this;
        }

        public Builder posY(int posY) {
            this.posY = posY;
            return this;
        }

        public Builder scale(float scale) {
            this.scale = scale;
            return this;
        }

        public Builder dim(boolean dim) {
            this.dim = dim;
            return this;
        }

        public TempImageVisual build() {
            return new TempImageVisual(this);
        }
    }
}
