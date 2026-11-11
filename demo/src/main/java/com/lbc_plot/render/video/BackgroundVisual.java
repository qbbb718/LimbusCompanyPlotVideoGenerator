package com.lbc_plot.render.video;

import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.io.IOException;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.lbc_plot.resource.model.Background;

/**
 * 背景可视化元素
 * 封装背景图像及其显示属性
 *
 * <p>坐标与缩放的语义（与前端「剧情编辑 → 背景」面板一致）：
 * <ul>
 *   <li>{@code scale}：以「等比铺满 1080p 设计画布」为 1.0 的基准缩放。
 *       1.0 时与加缩放功能之前的全屏背景一致（16:9 背景逐像素相同），
 *       2.0 表示背景在长宽两个方向都放大到 2 倍；</li>
 *   <li>{@code posX / posY}：背景中心相对画布中心的偏移（设计画布像素，0,0 = 居中）。
 *       不设上下限 —— 放大后把偏移调到超过半个画布 + 半个背景尺寸，就能把背景完全移出画面。</li>
 * </ul>
 * 具体绘制区域由 {@link #getDrawBounds(int, int)} 统一计算，渲染器只负责按这个矩形贴图，
 * 保证"预览 / 成片 / 不同输出分辨率"用的是同一套换算。
 *
 * <p>「压暗」（{@link #isDim()}）是这张背景自己的开关，只压它自己的像素：
 * 画在它上面的立绘、临时图片、UI 与台词都不受影响。
 *
 * <p><b>层级（z-order）</b>：一条记录里多张背景之间的前后关系由 {@code Record.bg} 列表的
 * <b>数组顺序</b>决定——<b>首项在画面最前，末项在最底层</b>。这与「立绘」「临时图片」用的是
 * 同一套约定（渲染时倒序遍历：末尾先画、首项后画，见
 * {@code RenderOfImage#renderFullScreenBackground}）。前端「剧情编辑 → 背景」列表按数组顺序显示，
 * 所以列表越靠上，画面里越靠前；上移 / 下移就是与前一项 / 后一项交换。
 *
 * <p>这里<b>不额外存 z 字段</b>：数组顺序本身就是层级（与 {@code chars} / {@code tempImages} 一致），
 * 保存 / 加载、预览、播放、导出都直接复用这个顺序，不需要迁移旧数据。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BackgroundVisual extends VisualElement {
    @JsonProperty
    private Background background;
    @JsonIgnore
    private BufferedImage bgImage;
    @JsonProperty
    private int posX;
    @JsonProperty
    private int posY;
    @JsonProperty
    private float scale = 1.0f;
    @JsonProperty
    private boolean visible = true;
    /**
     * 是否压暗（剧情编辑 → 背景 → 压暗）。
     *
     * <p>与立绘 / 临时图片的「压暗」是**同一个口径**：把 RGB 往黑色方向压、
     * alpha 原样保留（{@code ImageDarkener.darkenImage(image, DIM_OPACITY)}），
     * 前端 DOM 场景层对应的 CSS 是 {@code .preview-scene-item.dim { filter: brightness(0.5) }}。
     *
     * <p>缺省 false：旧工程 / 旧记录没有这个字段时行为与加压暗之前逐像素一致。
     * 只影响这一张背景，画在它上面的立绘、临时图片与 UI 都不受影响。
     */
    @JsonProperty
    private boolean dim;

    /**
     * 缩放上下限：与前端滑杆一致，同时防止异常数值生成超大 / 零尺寸中间图。
     *
     * <p>上限比立绘/临时图片的 3.0 大：背景要能「铺满画面」，
     * 9:16 的竖图要盖住 16:9 取景框约需 3.16 倍，卡在 3.0 会差 100 多像素铺不满。
     * 前端对应 constant 是 visualCoordinates.MAX_BACKGROUND_SCALE。
     *
     * <p>公开成常量是为了让测试/诊断直接引用"契约值"，而不是在断言里再抄一遍数字
     * （历史上这两个数字各改过一次，测试里写死的 3.0 就这样漂了）。
     */
    public static final float MIN_SCALE = 0.1f;
    public static final float MAX_SCALE = 4.0f;

    /**
     * 压暗时叠加的黑色不透明度：0.5 = 压暗一半。
     *
     * <p>与「立绘压暗」「临时图片压暗」以及前端 {@code .preview-scene-item.dim} 的
     * {@code brightness(0.5)} 是同一个数值。公开成常量是为了让测试/前端直接引用契约值，
     * 而不是在三个地方各写一遍 0.5。
     */
    public static final float DIM_OPACITY = 0.5f;

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

    public BackgroundVisual() {
        // 初始化默认值
        this.posX = 0;
        this.posY = 0;
        this.scale = 1.0f;
        this.visible = true;
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

    /** 是否压暗（缺省 false，见 {@link #DIM_OPACITY}） */
    public boolean isDim() {
        return dim;
    }

    /**
     * 计算背景在画布上的实际绘制区域（左上角 + 宽高，已包含 scale 与 posX/posY）。
     *
     * <p>步骤：
     * <ol>
     *   <li>把画布按 scale 放大成目标框（1.0 → 画布大小），</li>
     *   <li>原图等比缩放后「完整放进」目标框（与旧的全屏渲染一样 keepAspectRatio，
     *       16:9 背景在 scale=1 时正好铺满 1920×1080，逐像素与旧行为一致），</li>
     *   <li>以画布中心为基准加 posX/posY 偏移。</li>
     * </ol>
     * 返回 null 表示图像还没加载出来，调用方跳过即可。
     *
     * @param canvasWidth  设计画布宽度（正常为 1920）
     * @param canvasHeight 设计画布高度（正常为 1080）
     */
    @JsonIgnore
    public Rectangle getDrawBounds(int canvasWidth, int canvasHeight) {
        BufferedImage image = getBgImage();
        if (image == null || canvasWidth <= 0 || canvasHeight <= 0) {
            return null;
        }

        float safeScale = (Float.isFinite(scale) && scale > 0)
                ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
                : 1.0f;
        int targetWidth = Math.max(1, Math.round(canvasWidth * safeScale));
        int targetHeight = Math.max(1, Math.round(canvasHeight * safeScale));

        float fit = Math.min((float) targetWidth / image.getWidth(),
                (float) targetHeight / image.getHeight());
        int drawWidth = Math.max(1, Math.round(image.getWidth() * fit));
        int drawHeight = Math.max(1, Math.round(image.getHeight() * fit));

        int x = Math.round((canvasWidth - drawWidth) / 2.0f) + posX;
        int y = Math.round((canvasHeight - drawHeight) / 2.0f) + posY;
        return new Rectangle(x, y, drawWidth, drawHeight);
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

    public void setDim(boolean dim) {
        this.dim = dim;
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
    @JsonIgnore
    public String getImageInfo() {
        if (bgImage == null) {
            return "No image loaded";
        }
        return String.format("Image: %dx%d, Scale: %.2f, Position: (%d, %d)",
                bgImage.getWidth(), bgImage.getHeight(), scale, posX, posY);
    }

    @Override
    public String toString() {
        return String.format("BackgroundVisual{background=%s, visible=%s, position=(%d,%d), scale=%.2f, dim=%s}",
                background != null ? background.getPath() : "null",
                visible, posX, posY, scale, dim);
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
        copy.dim = this.dim;
        copy.bgImage = this.bgImage; // BufferedImage通常是不可变的，可以共享引用
        return copy;
    }
}