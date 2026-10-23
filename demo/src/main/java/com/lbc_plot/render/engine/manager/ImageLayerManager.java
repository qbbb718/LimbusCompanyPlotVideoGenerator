package com.lbc_plot.render.engine.manager;

import java.awt.AlphaComposite;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
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
        BufferedImage image = ImageReader.readResourceImage(resourcePath);
        if (image == null) {
            logger.error("无法读取图片资源: {}", resourcePath);
            throw new IOException("图片资源不存在: " + resourcePath);
        }

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

        addImageLayer(image, x, y);

        logger.debug("添加图层完成: {}, 位置({},{}), 尺寸{}x{}",
                resourcePath, x, y, image.getWidth(), image.getHeight());
    }

    /**
     * 添加已加载的BufferedImage图层
     * 
     * @param image BufferedImage变量
     * @param x     左上角x坐标
     * @param x     左上角y坐标
     */
    public void addImageLayerScaled(BufferedImage image, int x, int y, float scale) {
        if (image == null) {
            return;
        }
        // 缩放为 1（且值合法）时没必要复制一张同尺寸的副本
        if (Math.abs(scale - 1.0f) < 1e-4f) {
            addImageLayer(image, x, y);
            return;
        }
        BufferedImage scaledImage = RenderQualityUtils.scaleImageHighQuality(image, scale);
        addImageLayer(scaledImage, x, y);
    }

    public void addImageLayerResized(BufferedImage image, int x, int y, int targetWidth, int targetHeight,
            boolean keepAspectRatio) {
        BufferedImage scaledImage = RenderQualityUtils.scaleImageHighQuality(image, targetWidth, targetHeight,
                keepAspectRatio);
        addImageLayer(scaledImage, x, y);
    }

    /**
     * 添加一个**带仿射变换与透明度**的图像图层（立绘 / 临时图片的移动动画用）。
     *
     * <p>变换的坐标系是「合成画布」的坐标系，作用在**图像自身的像素坐标**上：
     * {@code transform} 把原图 (0,0) 映射到它在画布上的位置，并附带旋转/缩放。
     * 调用方负责把"缩放 + 平移"也编进同一个 {@link AffineTransform} 里（见
     * {@code RenderOfImage.renderSingleCharacter}）——**不要**先 {@code drawImage} 再 {@code g.rotate}，
     * 那会变成"绕画布原点旋转"，是最经典的实现事故。
     *
     * <p>刻意**不让画布变大**：变换后的包围盒不该撑大画布（合成画布尺寸由
     * {@code FrameComposerService#setOutputSize} 锁定，超出部分就地裁掉）。
     *
     * @param image     已经预缩放好的图（缩放由调用方做，可走 {@code SpriteImageCache}）
     * @param transform 原图像素 → 画布像素的完整变换；null 时退回普通贴图（便于调用方统一入口）
     * @param alpha     不透明度 0~1
     */
    public void addImageLayerTransformed(BufferedImage image, AffineTransform transform, float alpha) {
        if (image == null) {
            return;
        }
        if (transform == null) {
            addImageLayer(image, 0, 0);
            return;
        }
        LayerInfo layer = new LayerInfo(image, 0, 0, image.getWidth(), image.getHeight(), -1, -1,
                image.getWidth(), image.getHeight(), transform, alpha);
        layers.add(layer);
        logger.debug("添加变换图层: alpha={}, 变换={}", alpha, transform);
    }

    /**
     * 把图像直接「画到」目标矩形里：合成时由 {@link #drawSingleLayer} 用双三次插值一次性缩放，
     * 不生成缩放后的中间副本。
     *
     * <p>背景这类「原图很大、放大后更大」的图层用它，可以省掉一张与目标同尺寸的中间图
     * （4K 背景放大 2 倍时是 74MB），也省掉一次整幅写入。
     */
    public void addImageLayerIntoRect(BufferedImage image, int x, int y, int targetWidth, int targetHeight) {
        if (image == null) {
            return;
        }
        int safeWidth = Math.max(1, targetWidth);
        int safeHeight = Math.max(1, targetHeight);
        LayerInfo layer = new LayerInfo(image, x, y, safeWidth, safeHeight, -1, -1, safeWidth, safeHeight);
        layers.add(layer);
        growCanvasTo(x + safeWidth, y + safeHeight);
    }

    public void addImageLayer(BufferedImage image, int x, int y) {
        int finalWidth = image.getWidth();
        int finalHeight = image.getHeight();

        LayerInfo layer = new LayerInfo(image, x, y, finalWidth, finalHeight, -1, -1, finalWidth, finalHeight);
        layers.add(layer);

        // 未锁定画布尺寸时才让图层撑大画布（固定尺寸下由合成阶段 clip 裁掉超出部分）
        growCanvasTo(x + finalWidth, y + finalHeight);

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
     *
     * <p>整块像素用 {@link java.util.Arrays#fill} 填：旧实现逐像素 {@code setRGB} 填 1920×1080
     * 要 30ms 以上，而每渲染一张预览图/一帧静态层至少要填一次全屏底色。
     */
    private BufferedImage createSolidColorImage(int rgb, int alpha, int width, int height) {
        int safeWidth = Math.max(1, width);
        int safeHeight = Math.max(1, height);
        BufferedImage image = new BufferedImage(safeWidth, safeHeight, BufferedImage.TYPE_INT_ARGB);

        // 组合颜色和透明度
        int argb = (alpha << 24) | (rgb & 0x00FFFFFF);

        java.awt.image.DataBuffer buffer = image.getRaster().getDataBuffer();
        if (buffer instanceof java.awt.image.DataBufferInt) {
            java.util.Arrays.fill(((java.awt.image.DataBufferInt) buffer).getData(), argb);
            return image;
        }
        // 理论上不会走到这里（刚创建的 INT_ARGB），保留逐像素兜底
        for (int y = 0; y < safeHeight; y++) {
            for (int x = 0; x < safeWidth; x++) {
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
        if (layer.transform != null) {
            // 有变换：用**子 Graphics** 承载变换，避免污染后续图层的图形状态
            Graphics2D g = (Graphics2D) g2d.create();
            try {
                g.transform(layer.transform);
                if (layer.alpha < 1f) {
                    g.setComposite(AlphaComposite.SrcOver.derive(clampAlpha(layer.alpha)));
                }
                g.drawImage(layer.image, 0, 0, null);
            } finally {
                g.dispose();
            }
        } else if (layer.originalWidth == layer.targetWidth && layer.originalHeight == layer.targetHeight) {
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

    private static float clampAlpha(float alpha) {
        if (!Float.isFinite(alpha)) {
            return 1f;
        }
        return Math.min(1f, Math.max(0f, alpha));
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
        /** 原图像素 → 画布像素的完整变换；非 null 时忽略 x/y/尺寸，改用变换绘制（动画图层） */
        final AffineTransform transform;
        /** 不透明度 0~1（仅变换图层使用） */
        final float alpha;

        LayerInfo(BufferedImage image, int x, int y, int targetWidth, int targetHeight,
                float scaleX, float scaleY, int explicitWidth, int explicitHeight) {
            this(image, x, y, targetWidth, targetHeight, scaleX, scaleY, explicitWidth, explicitHeight, null, 1f);
        }

        LayerInfo(BufferedImage image, int x, int y, int targetWidth, int targetHeight,
                float scaleX, float scaleY, int explicitWidth, int explicitHeight,
                AffineTransform transform, float alpha) {
            this.image = image;
            this.x = x;
            this.y = y;
            this.originalWidth = image.getWidth();
            this.originalHeight = image.getHeight();
            this.targetWidth = targetWidth;
            this.targetHeight = targetHeight;
            this.scaleX = scaleX;
            this.scaleY = scaleY;
            this.transform = transform;
            this.alpha = alpha;
        }
    }

}