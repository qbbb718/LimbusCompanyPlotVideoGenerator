package com.lbc_plot.render.engine.contract;

import java.awt.image.BufferedImage;
import java.io.IOException;

public interface ImageLayerInterface {
    void addLayer(String resourcePath, int x, int y) throws IOException;

    void addLayerScaled(String resourcePath, int x, int y, float scale) throws IOException;

    void addLayerScaled(String resourcePath, int x, int y, float scaleX, float scaleY) throws IOException;

    void addLayerResized(String resourcePath, int x, int y, int targetWidth, int targetHeight) throws IOException;

    void addImageLayer(BufferedImage image, int x, int y);

    void addImageLayerScaled(BufferedImage image, int x, int y, float scale);

    void addImageLayerResized(BufferedImage image, int x, int y, int targetWidth, int targetHeight,
            boolean keepAspectRatio);

    /**
     * 直接把图像「画到指定像素矩形里」：不预先生成缩放后的副本，缩放留到合成时一次完成。
     *
     * <p>与 {@link #addImageLayerResized(BufferedImage, int, int, int, int, boolean)} 的差别只是
     * <strong>在哪里缩放</strong>：这个方法不分配中间图，适合背景这种「原图很大、目标尺寸也很大」
     * 的情况（4K 背景放大 2 倍时，预缩放会先分配一张 74MB 的中间图再贴上去）。
     * 插值方式仍是双三次，观感与预缩放一致。
     */
    void addImageLayerIntoRect(BufferedImage image, int x, int y, int targetWidth, int targetHeight);

    // 纯色
    void addSolidColorLayer(int rgb, int x, int y, int width, int height);

    void addSolidColorLayer(int rgb, int alpha, int x, int y, int width, int height);

    void addFullScreenMask(int alpha);

    void addFullScreenMask(int rgb, int alpha);
}