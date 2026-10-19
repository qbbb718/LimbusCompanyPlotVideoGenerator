package com.lbc_plot.render.engine.manager;

import java.awt.Dimension;
import java.awt.image.BufferedImage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * BaseLayerManager.java - 基础图层管理
 *
 * <h2>画布尺寸的两种模式</h2>
 * <ul>
 *   <li><b>自适应（默认）</b>：不调用 {@link #setOutputSize} 时，画布会随着层层贴图自动撑大
 *       （取所有图层的右下边界）。旧代码依赖这个行为，保留不变。</li>
 *   <li><b>固定（{@link #setOutputSize} 之后）</b>：画布锁在调用方给的尺寸上，
 *       图层超出部分在合成时被裁掉。<b>渲染路径必须用这种模式</b>：素材坐标都是 1080p
 *       设计值，一张放大 2 倍的背景若把画布撑到 3840 宽，最后再"整幅缩放到输出分辨率"
 *       就会把画面压扁/错位——这正是历史 bug 的来源。</li>
 * </ul>
 */
public abstract class BaseLayerManager {
    protected static final Logger logger = LoggerFactory.getLogger(BaseLayerManager.class);
    protected static final int DEFAULT_WIDTH = 1920;
    protected static final int DEFAULT_HEIGHT = 1080;

    protected int width = DEFAULT_WIDTH;
    protected int height = DEFAULT_HEIGHT;

    /**
     * 画布尺寸是否已被调用方锁定。
     *
     * <p>{@code true} 时图层不再撑大画布（超出部分由合成时的 clip 裁掉）。
     */
    protected boolean fixedCanvasSize = false;

    public void setOutputSize(int width, int height) {
        applySize(width, height, true);
    }

    public void resetToDefaultSize() {
        applySize(DEFAULT_WIDTH, DEFAULT_HEIGHT, false);
    }

    public Dimension getCompositionSize() {
        return new Dimension(width, height);
    }

    /** 画布尺寸是否被锁定（固定尺寸）。 */
    public boolean isFixedCanvasSize() {
        return fixedCanvasSize;
    }

    /**
     * 设置画布尺寸。
     *
     * @param width       画布宽
     * @param height      画布高
     * @param fixedCanvas 是否锁定尺寸（锁定后图层不再撑大画布）
     */
    protected void applySize(int width, int height, boolean fixedCanvas) {
        this.width = Math.max(1, width);
        this.height = Math.max(1, height);
        this.fixedCanvasSize = fixedCanvas;
        logger.debug("设置输出尺寸: {}x{} (固定={})", this.width, this.height, fixedCanvas);
    }

    /**
     * 图层右下边界超出画布时撑大画布。
     *
     * <p>仅在<b>未锁定</b>尺寸时生效；锁定后多余部分由合成阶段的 clip 裁掉。
     *
     * @param right  图层右边界
     * @param bottom 图层下边界
     */
    protected void growCanvasTo(int right, int bottom) {
        if (fixedCanvasSize) {
            return;
        }
        width = Math.max(width, right);
        height = Math.max(height, bottom);
    }

    protected BufferedImage createTransparentImage() {
        return new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
    }

}
