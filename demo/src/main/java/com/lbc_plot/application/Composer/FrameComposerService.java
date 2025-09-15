package com.lbc_plot.application.Composer;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.IOException;

import com.lbc_plot.application.Composer.contract.CompositionInterface;
import com.lbc_plot.application.Composer.contract.ImageLayerInterface;
import com.lbc_plot.application.Composer.contract.TextLayerOperations;
import com.lbc_plot.application.Composer.manager.BaseLayerManager;
import com.lbc_plot.application.Composer.manager.ImageLayerManager;
import com.lbc_plot.application.Composer.manager.TextLayerManager;
import com.lbc_plot.util.RenderQualityUtils;

/**
 * 帧合成器服务 - 主协调类
 */
public class FrameComposerService extends BaseLayerManager
    implements ImageLayerInterface, TextLayerOperations, CompositionInterface {
    
    private final ImageLayerManager imageManager;
    private final TextLayerManager textManager;

    public FrameComposerService() {
        this.imageManager = new ImageLayerManager();
        this.textManager = new TextLayerManager();
        // 同步初始尺寸
        this.imageManager.setOutputSize(width, height);
        this.textManager.setOutputSize(width, height);
    }
    
    // 重写尺寸设置以确保同步
    @Override
    public void setOutputSize(int width, int height) {
        super.setOutputSize(width, height);
        imageManager.setOutputSize(width, height);
        textManager.setOutputSize(width, height);
    }
    
    @Override
    public void resetToDefaultSize() {
        super.resetToDefaultSize();
        imageManager.resetToDefaultSize();
        textManager.resetToDefaultSize();
    }
    
    // 委托图像操作方法
    @Override
    public void addLayer(String resourcePath, int x, int y) throws IOException {
        imageManager.addLayer(resourcePath, x, y);
    }
    
    @Override
    public void addLayerScaled(String resourcePath, int x, int y, float scale) throws IOException {
        imageManager.addLayerScaled(resourcePath, x, y, scale);
    }

    @Override
    public void addLayerScaled(String resourcePath, int x, int y, float scaleX, float scaleY) throws IOException {
        imageManager.addLayerScaled(resourcePath, x, y, scaleX, scaleY);
    }
    
    // 委托文字操作方法
    @Override
    public void addLocationText(String text) {
        textManager.addLocationText(text);
    }
    
    @Override
    public void addCharacterNameText(String text, Color color) {
        textManager.addCharacterNameText(text, color);
    }
    
    // 合成方法
    @Override
    public BufferedImage compose() {
        BufferedImage result = createTransparentImage();
        Graphics2D g2d = result.createGraphics();
        
        RenderQualityUtils.setupHighQualityRendering(g2d);
        g2d.setClip(0, 0, width, height);
        
        imageManager.drawLayers(g2d);
        textManager.drawTextLayers(g2d);
        
        g2d.dispose();
        logCompositionStats();
        return result;
    }
    
    @Override
    public void clearLayers() {
        imageManager.clear();
        textManager.clear();
        logger.debug("已清空所有图层和文字");
    }
    
    @Override
    public int getLayerCount() {
        return imageManager.getLayerCount() + textManager.getTextLayerCount();
    }
    
    private void logCompositionStats() {
        logger.info("合成完成: {}x{}, 图片图层{}, 文字图层{}", 
            width, height, imageManager.getLayerCount(), textManager.getTextLayerCount());
    }

    @Override
    public void addFactionText(String text) {
        textManager.addFactionText(text);
    }

    @Override
    public void addDialogueTextLeft(String text) {
        textManager.addDialogueTextLeft(text);
    }

    @Override
    public void addDialogueTextCenter(String text) {
        textManager.addDialogueTextCenter(text);
    }

    @Override
    public void addLayerResized(String resourcePath, int x, int y, int targetWidth, int targetHeight)
            throws IOException {
        imageManager.addLayerResized(resourcePath, x, y, targetWidth, targetHeight);
    }

    @Override
    public void addImageLayer(BufferedImage image, int x, int y) {
        imageManager.addImageLayer(image, x, y);
    }

    @Override
    public void addImageLayerScaled(BufferedImage image, int x, int y, float scale) {
        imageManager.addImageLayerScaled(image, x, y, scale);
    }

    @Override
    public void addImageLayerResized(BufferedImage image, int x, int y, int targetWidth, int targetHeight, boolean keepAspectRatio) {
        imageManager.addImageLayerResized(image, x, y, targetWidth, targetHeight, keepAspectRatio);
    }

    @Override
    public void addSolidColorLayer(int rgb, int x, int y, int width, int height) {
        imageManager.addSolidColorLayer(rgb, x, y, width, height);
    }

    @Override
    public void addSolidColorLayer(int rgb, int alpha, int x, int y, int width, int height) {
         imageManager.addSolidColorLayer(rgb, alpha, x, y, width, height);
    }

    @Override
    public void addFullScreenMask(int alpha) {
        imageManager.addFullScreenMask(alpha);
    }

    @Override
    public void addFullScreenMask(int rgb, int alpha) {
        imageManager.addFullScreenMask(rgb, alpha);
    }

    

}