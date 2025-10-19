package com.lbc_plot.core.Composer.contract;

import java.awt.image.BufferedImage;
import java.io.IOException;

public interface ImageLayerInterface {
    void addLayer(String resourcePath, int x, int y) throws IOException;
    void addLayerScaled(String resourcePath, int x, int y, float scale) throws IOException;
    void addLayerScaled(String resourcePath, int x, int y, float scaleX, float scaleY) throws IOException;
    void addLayerResized(String resourcePath, int x, int y, int targetWidth, int targetHeight) throws IOException;
    
    void addImageLayer(BufferedImage image, int x, int y);
    void addImageLayerScaled(BufferedImage image, int x, int y, float scale);
    void addImageLayerResized(BufferedImage image, int x, int y, int targetWidth, int targetHeight, boolean keepAspectRatio);

    // 纯色
    void addSolidColorLayer(int rgb, int x, int y, int width, int height);
    void addSolidColorLayer(int rgb, int alpha, int x, int y, int width, int height);
    void addFullScreenMask(int alpha);
    void addFullScreenMask(int rgb, int alpha);
}