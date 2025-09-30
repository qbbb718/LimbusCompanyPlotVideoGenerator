package com.lbc_plot.model.storage;

import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.lbc_plot.util.io.ImageReader;

import java.awt.image.BufferedImage;

public class Background {
    private String uuid; // 唯一id（保证换源后能直接替换
    private String path; // 文件存储路径
    @JsonIgnore
    private BufferedImage image; // 读入的图像，初始为null
    
    /**
     * 构造函数
     * 路径从bg开始
     */
    public Background(String path) {
        uuid = UUID.randomUUID().toString();
        this.path = path;
        this.image = null; // 初始时image为null，实现懒加载
    }

    public Background(String uuid, String path) {
        this.uuid = uuid;
        this.path = path;
        this.image = null; // 初始时image为null，实现懒加载
    }
    
    /**
     * 懒加载获取图像
     * 如果image未读入，则从文件读取；如果已读入，直接返回
     * @return 读取的BufferedImage对象
     */
    public BufferedImage getImage() {
        if (image == null) {
            loadImage();
        }
        return image;
    }
    
    /**
     * 加载图像（私有方法，只在需要时调用）
     */
    private void loadImage() {
        try {
            System.out.println("正在懒加载背景图像: " + path);
            image = ImageReader.readBackGround(path);
            if (image == null) {
                System.err.println("无法加载背景图像: " + path);
                // 可以设置一个默认图像或抛出异常
            }
        } catch (Exception e) {
            System.err.println("加载背景图像时发生错误: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * 手动重新加载图像（如果需要刷新）
     */
    public void reloadImage() {
        image = null; // 设置为null，下次getImage()时会重新加载
        getImage();   // 立即重新加载
    }
    
    /**
     * 释放图像资源（节省内存）
     */
    public void releaseImage() {
        image = null;
        System.gc(); // 建议垃圾回收，但不是强制性的
    }
    
    /**
     * 检查图像是否已加载
     * @return 如果图像已加载返回true，否则返回false
     */
    public boolean isImageLoaded() {
        return image != null;
    }
    
    // Getter和Setter方法
    public String getUuid() {
        return uuid;
    }
    
    public void setUuid(String uuid) {
        this.uuid = uuid;
    }
    
    public String getPath() {
        return path;
    }
    
    public void setPath(String path) {
        this.path = path;
        // 路径改变时，需要重新加载图像
        image = null;
    }
    
    /**
     * 获取图像宽度（懒加载版本）
     */
    public int getWidth() {
        BufferedImage img = getImage();
        return img != null ? img.getWidth() : 0;
    }
    
    /**
     * 获取图像高度（懒加载版本）
     */
    public int getHeight() {
        BufferedImage img = getImage();
        return img != null ? img.getHeight() : 0;
    }
    
    @Override
    public String toString() {
        return "Background{" +
                "uuid='" + uuid + '\'' +
                ", path='" + path + '\'' +
                ", loaded=" + isImageLoaded() +
                '}';
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Background that = (Background) o;
        return uuid.equals(that.uuid);
    }
    
    @Override
    public int hashCode() {
        return uuid.hashCode();
    }
}