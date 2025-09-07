package com.lbc_plot.model.video;

import java.awt.image.BufferedImage;
import java.io.IOException;

import com.lbc_plot.model.repository.Background;

import java.awt.image.BufferedImage;

/**
 * 背景可视化元素
 * 封装背景图像及其显示属性
 */
public class BackgroundVisual extends VisualElement {
    private Background background;
    private BufferedImage bgImage;
    private int posX;
    private int posY;
    private float scale = 1.0f;
    private boolean visible = true;

    /**
     * 构造函数
     */
    public BackgroundVisual(Background background) {
        if (background == null) {
            throw new IllegalArgumentException("Background cannot be null");
        }
        this.background = background;
        this.bgImage = background.getImage();
    }

    /**
     * 带位置参数的构造函数
     */
    public BackgroundVisual(Background background, int posX, int posY) {
        this(background);
        this.posX = posX;
        this.posY = posY;
    }

    /**
     * 带位置和缩放参数的构造函数
     */
    public BackgroundVisual(Background background, int posX, int posY, float scale) {
        this(background, posX, posY);
        this.scale = scale;
    }

    // Getter 方法
    public Background getBackground() {
        return background;
    }

    public BufferedImage getBgImage() {
        if (bgImage == null && background != null) {
            bgImage = background.getImage();
        }
        return bgImage;
    }

    public int getPosX() {
        return posX;
    }

    public int getPosY() {
        return posY;
    }

    public float getScale() {
        return scale;
    }

    public boolean isVisible() {
        return visible;
    }

    public int getScaledWidth() {
        if (bgImage == null) return 0;
        return (int) (bgImage.getWidth() * scale);
    }

    public int getScaledHeight() {
        if (bgImage == null) return 0;
        return (int) (bgImage.getHeight() * scale);
    }

    // Setter 方法
    public void setBackground(Background background) {
        if (background == null) {
            throw new IllegalArgumentException("Background cannot be null");
        }
        this.background = background;
        this.bgImage = background.getImage(); // 更新图像引用
    }

    public void setBgImage(BufferedImage bgImage) {
        this.bgImage = bgImage;
    }

    public void setPosX(int posX) {
        this.posX = posX;
    }

    public void setPosY(int posY) {
        this.posY = posY;
    }

    public void setPosition(int posX, int posY) {
        this.posX = posX;
        this.posY = posY;
    }

    public void setScale(float scale) {
        if (scale <= 0) {
            throw new IllegalArgumentException("Scale must be greater than 0");
        }
        this.scale = scale;
    }

    public void setVisible(boolean visible) {
        this.visible = visible;
    }

    /**
     * 重新加载背景图像
     */
    public void reloadImage() throws IOException {
        if (background != null) {
            this.bgImage = background.getImage();
        }
    }

    /**
     * 检查图像是否有效
     */
    public boolean hasValidImage() {
        return bgImage != null && bgImage.getWidth() > 0 && bgImage.getHeight() > 0;
    }

    /**
     * 获取图像信息字符串（用于调试）
     */
    public String getImageInfo() {
        if (bgImage == null) {
            return "No image loaded";
        }
        return String.format("Image: %dx%d, Scale: %.2f, Position: (%d, %d)",
                bgImage.getWidth(), bgImage.getHeight(), scale, posX, posY);
    }

    @Override
    public String toString() {
        return String.format("BackgroundVisual{background=%s, visible=%s, position=(%d,%d), scale=%.2f}",
                background != null ? background.getPath() : "null",
                visible, posX, posY, scale);
    }

    /**
     * 创建深拷贝（如果需要）
     */
    public BackgroundVisual copy() {
        BackgroundVisual copy = new BackgroundVisual(this.background);
        copy.posX = this.posX;
        copy.posY = this.posY;
        copy.scale = this.scale;
        copy.visible = this.visible;
        copy.bgImage = this.bgImage; // BufferedImage通常是不可变的，可以共享引用
        return copy;
    }
}