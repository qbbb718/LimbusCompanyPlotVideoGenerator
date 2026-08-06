package com.lbc_plot.render.engine.manager;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.common.util.RenderQualityUtils;
import com.lbc_plot.common.util.io.ImageReader;
import com.lbc_plot.render.engine.contract.ImageLayerInterface;

/**
 * 图像图层处理工具
 */
public class ImageLayerManager extends BaseLayerManager implements ImageLayerInterface {
    private final List<LayerInfo> layers = new ArrayList<>();

    /**
     * 添加图层 - 原样叠加
     * 
     * @param resourcePath 素材路径
     * @param x            X坐标
     * @param y            Y坐标
     * @throws IOException 读取失败时抛出
     */
    public void addLayer(String resourcePath, int x, int y) throws IOException {
        addLayer(resourcePath, x, y, 1.0f, 1.0f, -1, -1);
    }

    /**
     * 添加图层 - 百分比缩放
     * 
     * @param resourcePath 素材路径
     * @param x            X坐标
     * @param y            Y坐标
     * @param scale        缩放比例 (0.0-1.0)
     * @throws IOException 读取失败时抛出
     */
    public void addLayerScaled(String resourcePath, int x, int y, float scale) throws IOException {
        addLayer(resourcePath, x, y, scale, scale, -1, -1);
    }

    /**
     * 添加图层 - 分别指定宽高缩放比例
     * 
     * @param resourcePath 素材路径
     * @param x            X坐标
     * @param y            Y坐标
     * @param scaleX       水平缩放比例
     * @param scaleY       垂直缩放比例
     * @throws IOException 读取失败时抛出
     */
    public void addLayerScaled(String resourcePath, int x, int y, float scaleX, float scaleY) throws IOException {
        addLayer(resourcePath, x, y, scaleX, scaleY, -1, -1);
    }

    /**
     * 添加图层 - 缩放到指定像素尺寸
     * 
     * @param resourcePath 素材路径
     * @param x            X坐标
     * @param y            Y坐标
     * @param targetWidth  目标宽度(像素)
     * @param targetHeight 目标高度(像素)
     * @throws IOException 读取失败时抛出
     */
    public void addLayerResized(String resourcePath, int x, int y, int targetWidth, int targetHeight)
            throws IOException {
        addLayer(resourcePath, x, y, 1.0f, 1.0f, targetWidth, targetHeight);
    }

    /**
     * 核心添加图层方法
     */
    private void addLayer(String resourcePath, int x, int y, float scaleX, float scaleY, int targetWidth,
            int targetHeight) throws IOException {
        long startTime = System.currentTimeMillis();

        BufferedImage image = ImageReader.readResourceImage(resourcePath);
        if (image == null) {
            logger.error("无法读取图片资源: {}", resourcePath);
            throw new IOException("图片资源不存在: " + resourcePath);
        }

        // 计算最终尺寸
        int finalWidth = image.getWidth();
        int finalHeight = image.getHeight();

        if (targetWidth > 0 && targetHeight > 0) {
            // 指定像素尺寸
            image = RenderQualityUtils.scaleImageHighQuality(image, targetWidth, targetHeight);
            logger.debug("图层缩放: {} -> {}x{} 像素", resourcePath, targetWidth, targetHeight);
        } else if (scaleX != 1.0f || scaleY != 1.0f) {
            // 百分比缩放
            image = RenderQualityUtils.scaleImageHighQuality(image, scaleX, false);
            logger.debug("图层缩放: {} -> {:.0f}% x {:.0f}%",
                    resourcePath, scaleX * 100, scaleY * 100);
        }

        LayerInfo layer = new LayerInfo(image, x, y, finalWidth, finalHeight, -1, -1, finalWidth, finalHeight);
        layers.add(layer);

        long duration = System.currentTimeMillis() - startTime;
        logger.debug("添加图层完成: {}, 位置({},{}), 尺寸{}x{}, 耗时{}ms",
                resourcePath, x, y, finalWidth, finalHeight, duration);
    }

    /**
     * 添加已加载的BufferedImage图层
     * 
     * @param image BufferedImage变量
     * @param x     左上角x坐标
     * @param x     左上角y坐标
     */
    public void addImageLayerScaled(BufferedImage image, int x, int y, float scale) {
        BufferedImage scaledImage = RenderQualityUtils.scaleImageHighQuality(image, scale);
        addImageLayer(scaledImage, x, y);
    }

    public void addImageLayerResized(BufferedImage image, int x, int y, int targetWidth, int targetHeight,
            boolean keepAspectRatio) {
        BufferedImage scaledImage = RenderQualityUtils.scaleImageHighQuality(image, targetWidth, targetHeight,
                keepAspectRatio);
        addImageLayer(scaledImage, x, y);
    }

    public void addImageLayer(BufferedImage image, int x, int y) {
        int finalWidth = image.getWidth();
        int finalHeight = image.getHeight();

        LayerInfo layer = new LayerInfo(image, x, y, finalWidth, finalHeight, -1, -1, finalWidth, finalHeight);
        layers.add(layer);

        width = Math.max(width, x + finalWidth);
        height = Math.max(height, y + finalHeight);

        logger.debug("添加图像图层: 位置({},{}), 尺寸{}x{}", x, y, finalWidth, finalHeight);
    }

    /**
     * 添加纯色图层 - 默认不透明
     * 
     * @param rgb    颜色值 (16进制，如0xFF0000为红色)
     * @param x      X坐标
     * @param y      Y坐标
     * @param width  宽度
     * @param height 高度
     */
    public void addSolidColorLayer(int rgb, int x, int y, int width, int height) {
        addSolidColorLayer(rgb, 255, x, y, width, height);
    }

    /**
     * 添加纯色图层 - 指定透明度
     * 
     * @param rgb    颜色值 (16进制，如0xFF0000为红色)
     * @param alpha  透明度 (0-255, 0完全透明，255完全不透明)
     * @param x      X坐标
     * @param y      Y坐标
     * @param width  宽度
     * @param height 高度
     */
    public void addSolidColorLayer(int rgb, int alpha, int x, int y, int width, int height) {
        long startTime = System.currentTimeMillis();

        // 创建纯色图像
        BufferedImage colorImage = createSolidColorImage(rgb, alpha, width, height);

        // 使用现有的图像叠加方法
        addImageLayer(colorImage, x, y);

        long duration = System.currentTimeMillis() - startTime;
        logger.debug("添加纯色图层完成: 颜色#{}, 透明度{}, 位置({},{}), 尺寸{}x{}, 耗时{}ms",
                Integer.toHexString(rgb).toUpperCase(), alpha, x, y, width, height, duration);
    }

    /**
     * 添加全屏纯色遮罩 - 默认半透明黑色
     * 
     * @param alpha 透明度 (0-255)
     */
    public void addFullScreenMask(int alpha) {
        addSolidColorLayer(0x000000, alpha, 0, 0, this.width, this.height);
    }

    /**
     * 添加全屏纯色遮罩 - 指定颜色和透明度
     * 
     * @param rgb   颜色值
     * @param alpha 透明度
     */
    public void addFullScreenMask(int rgb, int alpha) {
        addSolidColorLayer(rgb, alpha, 0, 0, this.width, this.height);
    }

    /**
     * 创建纯色图像
     */
    private BufferedImage createSolidColorImage(int rgb, int alpha, int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);

        // 组合颜色和透明度
        int argb = (alpha << 24) | (rgb & 0x00FFFFFF);

        // 填充整个图像
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, argb);
            }
        }

        return image;
    }

    public void drawLayers(Graphics2D g2d) {
        for (int i = 0; i < layers.size(); i++) {
            LayerInfo layer = layers.get(i);
            drawSingleLayer(g2d, layer, i);
        }
    }

    /**
     * 绘制单个图层
     */
    private void drawSingleLayer(Graphics2D g2d, LayerInfo layer, int layerIndex) {
        if (layer.originalWidth == layer.targetWidth && layer.originalHeight == layer.targetHeight) {
            // 原样绘制
            g2d.drawImage(layer.image, layer.x, layer.y, null);
        } else {
            // 缩放绘制
            g2d.drawImage(layer.image, layer.x, layer.y, layer.targetWidth, layer.targetHeight, null);
        }

        if (logger.isTraceEnabled()) {
            logger.trace("绘制图层{}: 位置({},{}), 尺寸{}x{}",
                    layerIndex, layer.x, layer.y, layer.targetWidth, layer.targetHeight);
        }
    }

    /**
     * 高质量图像缩放
     */
    public static BufferedImage scaleImageHighQuality(BufferedImage original, int newWidth, int newHeight) {
        BufferedImage scaledImage = new BufferedImage(newWidth, newHeight, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2d = scaledImage.createGraphics();

        RenderQualityUtils.setupUltraQualityRendering(g2d);

        // 使用双三次插值进行高质量缩放
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                RenderingHints.VALUE_INTERPOLATION_BICUBIC);

        g2d.drawImage(original, 0, 0, newWidth, newHeight, null);
        g2d.dispose();

        return scaledImage;
    }

    public void clear() {
        layers.clear();
    }

    public int getLayerCount() {
        return layers.size();
    }

    /**
     * 内部类：图层信息
     */
    private static class LayerInfo {
        final BufferedImage image;
        final int x;
        final int y;
        final int originalWidth;
        final int originalHeight;
        final int targetWidth;
        final int targetHeight;
        final float scaleX;
        final float scaleY;

        LayerInfo(BufferedImage image, int x, int y, int targetWidth, int targetHeight,
                float scaleX, float scaleY, int explicitWidth, int explicitHeight) {
            this.image = image;
            this.x = x;
            this.y = y;
            this.originalWidth = image.getWidth();
            this.originalHeight = image.getHeight();
            this.targetWidth = targetWidth;
            this.targetHeight = targetHeight;
            this.scaleX = scaleX;
            this.scaleY = scaleY;
        }
    }

}