package com.lbc_plot.core.Composer.manager;

import java.awt.AlphaComposite;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * BaseLayerManager.java - 基础图层管理
 * @return
 */ 
public abstract class BaseLayerManager {
    protected static final Logger logger = LoggerFactory.getLogger(BaseLayerManager.class);
    protected static final int DEFAULT_WIDTH = 1920;
    protected static final int DEFAULT_HEIGHT = 1080;
    
    protected int width = DEFAULT_WIDTH;
    protected int height = DEFAULT_HEIGHT;
    
    public void setOutputSize(int width, int height) {
        this.width = width;
        this.height = height;
        logger.debug("设置输出尺寸: {}x{}", width, height);
    }
    
    public void resetToDefaultSize() {
        this.width = DEFAULT_WIDTH;
        this.height = DEFAULT_HEIGHT;
        logger.debug("重置为默认尺寸: {}x{}", DEFAULT_WIDTH, DEFAULT_HEIGHT);
    }
    
    public Dimension getCompositionSize() {
        return new Dimension(width, height);
    }
    
    protected BufferedImage createTransparentImage() {
        return new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
    }

}