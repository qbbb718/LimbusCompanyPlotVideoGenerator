package com.lbc_plot.render.video.anim;

/**
 * @module 情绪动画（序列帧）几何内核
 * 算「情绪动画该画在立绘的哪个位置、多大」——纯算术，不碰图像、不碰文件。
 *
 * <h2>为什么单独立一个类</h2>
 * 位置算错不会有异常，只会"动画跑到画面角落/大小不对"，而这正是最难靠肉眼发现的错误。
 * 所以把它抽成双端共享的纯函数：Java 端出片用它、前端预览用它、夹具测试同时喂两边
 * （见 {@code animation-fixtures.json} 的 {@code emotionPlacement} 段）。
 *
 * <h2>坐标空间：1080p 场景画布，不是成片坐标</h2>
 * 本类返回的矩形与 {@code CharacterVisual.getPosX()/getPosY()} 同一空间——也就是
 * **剧情模式缩到 0.8 之前**的 1920×1080 场景画布。因为情绪动画画在
 * {@code RenderOfImage.renderCharacters()} 里（紧跟父立绘之后），下游的
 * camera / 0.8 缩放 / 边框遮罩 / 场景裁剪会**自动**作用到它身上，不需要手算。
 *
 * <blockquote>
 * 旧设计稿 {@code docs/情绪动画设计.md} §5.2 里那套"手算 0.8 与 (192,108) 偏移"的公式
 * **已整节作废**（见 {@code docs/立绘动画设计.md} 附录 A）：手算一次，就是双端各错一次的来源。
 * </blockquote>
 *
 * <h2>锚点：脸框中心，与裁剪框和用户缩放都无关</h2>
 * 由 {@code CharacterVisual.updatePos()} 可推出（推导见
 * {@code docs/情绪动画设计.md} 附录 B）：
 * <pre>faceCenter = 立绘矩形左上角 + (faceX + length/2) · renderScale</pre>
 * 而对脸框中心本身有 {@code faceCenter = anchor + length/2 · baseScale = anchor + 91.5}，
 * 与 faceX/faceY/length、用户缩放**全部抵消**。用哪个式子都行，这里用前一个——
 * 因为它只依赖"立绘矩形左上角"这一个已经被双端验证过的量（{@code characterWorldRect}），
 * 不必再抄一遍 {@code updatePos()} 的内部公式。
 */
public final class EmotionAnimPlacement {

    /**
     * 脸框中心相对矩形左上角的偏移 = {@code (face + length/2) · renderScale}。
     *
     * @param face         裁剪框在该轴上的起点（faceX 或 faceY）
     * @param length       裁剪框边长（正方形）
     * @param renderScale  立绘最终缩放（含用户缩放）
     */
    public static double faceOffset(double face, double length, double renderScale) {
        double halfLength = length / 2d;
        return (face + halfLength) * renderScale;
    }

    /**
     * 头部方框在场景里的边长（像素）。
     *
     * <p>立绘的裁剪框 {@code length} 会被缩放成恒定的
     * {@code DEFAULT_CHARACTER_HEAD_LENGTH = 183}，所以头部方框的边长恒为
     * {@code length · renderScale = 183 · 用户缩放}——**与角色身高、站位、裁剪框大小无关**。
     * 这就是"相对头部区域"能被跨角色复用的根本原因，也是偏移量的长度单位。
     *
     * @param length      裁剪框边长（{@code Portrait.length}）
     * @param renderScale 立绘最终缩放（含用户缩放）
     */
    public static double headSize(double length, double renderScale) {
        double safeLength = length > 0 ? length : 1d;
        double safeScale = Double.isFinite(renderScale) && renderScale > 0 ? renderScale : 1d;
        return safeLength * safeScale;
    }

    /**
     * 情绪动画的绘制矩形（**未套立绘移动动画之前**的场景画布坐标）。
     *
     * <p>素材以**画布中心**对齐到脸框中心（v1 不做每素材自定义锚点），再叠加用户给的偏移与缩放。
     * 尺寸乘 {@code userScale}：用户把立绘放大 2 倍时，贴脸的特效必须跟着变大，
     * 否则会出现"人物放大了、汗滴还是原来那么小"。
     *
     * <p><b>偏移的单位是头部长度</b>（见 {@link #headSize}）：{@code offsetY = -0.3} 表示
     * "脸框中心往上 0.3 个头宽"，换任何一个角色都是同一个相对位置。
     *
     * @param faceCenterX 脸框中心 X（场景画布坐标）
     * @param faceCenterY 脸框中心 Y
     * @param headSize    头部方框边长（{@link #headSize}）
     * @param canvasWidth  素材画布宽（px）
     * @param canvasHeight 素材画布高（px）
     * @param scale        素材缩放倍率（1 = 原始尺寸）
     * @param userScale    立绘的用户缩放（{@code CharacterVisual.getUserScale()}）
     * @param offsetX      相对脸框中心的偏移，**单位 = 头部长度**，+ 向右
     * @param offsetY      同上，+ 向下
     */
    public static Rect spriteRect(double faceCenterX, double faceCenterY, double headSize,
            double canvasWidth, double canvasHeight, double scale, double userScale,
            double offsetX, double offsetY) {
        double safeCanvasWidth = Math.max(1d, canvasWidth);
        double safeCanvasHeight = Math.max(1d, canvasHeight);
        double safeScale = Double.isFinite(scale) && scale > 0 ? scale : 1d;
        double safeUserScale = Double.isFinite(userScale) && userScale > 0 ? userScale : 1d;
        double head = Double.isFinite(headSize) && headSize > 0 ? headSize : 1d;
        double factor = safeScale * safeUserScale;
        double width = safeCanvasWidth * factor;
        double height = safeCanvasHeight * factor;
        // 偏移 × 头宽：头部方框跨角色恒定，所以这个乘法把"相对位置"换算成场景像素
        double x = faceCenterX + (Double.isFinite(offsetX) ? offsetX : 0d) * head - width / 2d;
        double y = faceCenterY + (Double.isFinite(offsetY) ? offsetY : 0d) * head - height / 2d;
        return new Rect(x, y, width, height);
    }

    /**
     * 一个矩形（场景画布坐标；可以带小数，绘制时再取整）。
     */
    public record Rect(double x, double y, double w, double h) {
        /** 中心点 X */
        public double centerX() {
            return x + w / 2d;
        }

        /** 中心点 Y */
        public double centerY() {
            return y + h / 2d;
        }
    }
}
