package com.lbc_plot.render.video.anim;

/**
 * @module 情绪动画（序列帧）几何内核
 * 算「情绪动画该画在元素的哪个位置、多大」——纯算术，不碰图像、不碰文件。
 *
 * <h2>两种元素，同一个锚点概念</h2>
 * 本类同时服务立绘与临时图片，二者都用"头部区域中心 + 偏移 × 头部区域长度"的同一套公式
 * （{@link #spriteRect}），差别只在**头部区域怎么来**：
 * <ul>
 *   <li><b>立绘</b>：裁剪框 (faceX, faceY, length) 推导出的脸框（{@link #faceOffset} /
 *       {@link #headSize}）；</li>
 *   <li><b>临时图片</b>：没有裁剪框，按产品需求直接用图片显示区域定义正方形——
 *       边长 = 图片宽度 / 3、水平居中、上边缘贴合图片上边缘（{@link #tempImageHeadBox}）。</li>
 * </ul>
 * 所以同一份 {@code offsetX/offsetY/scale} 摆在两种元素上语义一致（单位都是"一个头部区域宽度"），
 * UI 与数据结构也可以完全复用。
 *
 * <h2>为什么单独立一个类</h2>
 * 位置算错不会有异常，只会"动画跑到画面角落/大小不对"，而这正是最难靠肉眼发现的错误。
 * 所以把它抽成双端共享的纯函数：Java 端出片用它、前端预览用它、夹具测试同时喂两边
 * （见 {@code animation-fixtures.json} 的 {@code emotionPlacement} 段）。
 *
 * <h2>坐标空间：1080p 场景画布，不是成片坐标</h2>
 * 本类返回的矩形与 {@code CharacterVisual.getPosX()/getPosY()}、
 * {@code TempImageVisual.getPosX()/getPosY()} 同一空间——也就是
 * **剧情模式缩到 0.8 之前**的 1920×1080 场景画布。因为情绪动画画在
 * {@code RenderOfImage.renderCharacters()} / {@code renderTempImages()} 里（紧跟父元素之后），
 * 下游的 camera / 0.8 缩放 / 边框遮罩 / 场景裁剪会**自动**作用到它身上，不需要手算。
 *
 * <blockquote>
 * 旧设计稿 {@code docs/情绪动画设计.md} §5.2 里那套"手算 0.8 与 (192,108) 偏移"的公式
 * **已整节作废**（见 {@code docs/立绘动画设计.md} 附录 A）：手算一次，就是双端各错一次的来源。
 * </blockquote>
 *
 * <h2>锚点：脸框中心 / 头部正方形中心，与裁剪框和用户缩放都无关</h2>
 * 由 {@code CharacterVisual.updatePos()} 可推出（推导见
 * {@code docs/情绪动画设计.md} 附录 B）：
 * <pre>faceCenter = 立绘矩形左上角 + (faceX + length/2) · renderScale</pre>
 * 而对脸框中心本身有 {@code faceCenter = anchor + length/2 · baseScale = anchor + 91.5}，
 * 与 faceX/faceY/length、用户缩放**全部抵消**。用哪个式子都行，这里用前一个——
 * 因为它只依赖"立绘矩形左上角"这一个已经被双端验证过的量（{@code characterWorldRect}），
 * 不必再抄一遍 {@code updatePos()} 的内部公式。
 *
 * <p>临时图片的头部正方形同理：中心只由图片显示矩形的左上角与宽度决定
 * （{@code (x + w/2, y + w/6)}），不依赖原图像素尺寸。
 */
public final class EmotionAnimPlacement {

    /** 临时图片头部正方形区域边长的分母：需求定义"图片宽度的三分之一" */
    public static final double TEMP_IMAGE_HEAD_WIDTH_DIVISOR = 3d;


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
     * 临时图片**头部正方形区域**的边长（场景像素）。
     *
     * <p>需求定义：边长 = 图片显示宽度 / 3。用**显示宽度**（原图宽 × {@code scale}，再过 camera）
     * 而不是原图像素：用户在「临时图片」里放大/缩小这张图时，头部区域必须跟着变大变小，
     * 否则"图变大了、特效还那么小"。
     *
     * @param imageWidth 图片显示矩形的宽度（场景画布坐标，已含 scale 与 camera zoom）
     */
    public static double tempImageHeadSize(double imageWidth) {
        double safeWidth = imageWidth > 0 ? imageWidth : 1d;
        return safeWidth / TEMP_IMAGE_HEAD_WIDTH_DIVISOR;
    }

    /**
     * 临时图片的**头部正方形区域**（场景画布坐标）：情绪动画在临时图片上的坐标基准。
     *
     * <p>与需求逐条对应：
     * <ol>
     *   <li>边长 {@code s = 图片宽度 / 3}（{@link #tempImageHeadSize}）；</li>
     *   <li>**水平居中**：{@code x = imageX + (imageWidth − s) / 2}；</li>
     *   <li>**顶部贴合**：{@code y = imageY}（正方形上边与图片上边缘对齐）。</li>
     * </ol>
     *
     * <p>它和立绘的"脸框"是同一个概念：情绪动画的素材中心对齐 {@link Rect#centerX()} /
     * {@link Rect#centerY()}，偏移以方框边长（= 一个头宽）为单位。
     *
     * <p>与前端 {@code previewLayout.tempImageHeadBox} 逐行对应，靠
     * {@code TempImageEmotionAnimPlacementTest} 对拍。
     *
     * @param imageX     图片显示矩形左上角 X（场景画布坐标，已过 camera）
     * @param imageY     图片显示矩形左上角 Y
     * @param imageWidth 图片显示宽度（已含 scale 与 camera zoom）
     */
    public static Rect tempImageHeadBox(double imageX, double imageY, double imageWidth) {
        double safeWidth = imageWidth > 0 ? imageWidth : 1d;
        double size = tempImageHeadSize(safeWidth);
        return new Rect(imageX + (safeWidth - size) / 2d, imageY, size, size);
    }

    /**
     * 临时图片的缩放兜底：非数字 / 非正按 1（与渲染端把 {@code scale} 直接交给
     * {@code RenderQualityUtils} 时的兜底一致）。
     *
     * <p>情绪动画的素材尺寸要乘它（图被放大 2 倍时贴头的特效也放大 2 倍），
     * 与立绘的 {@code CharacterVisual.getUserScale()} 对应。
     */
    public static double safeImageScale(double scale) {
        return Double.isFinite(scale) && scale > 0 ? scale : 1d;
    }

    /**
     * 情绪动画的绘制矩形（**未套元素自身移动动画之前**的场景画布坐标）。
     *
     * <p>素材以**画布中心**对齐到**头部区域中心**（v1 不做每素材自定义锚点），再叠加用户给的
     * 偏移与缩放。尺寸乘 {@code userScale}：用户把元素放大 2 倍时，贴头的特效必须跟着变大，
     * 否则会出现"人物放大了、汗滴还是原来那么小"。
     *
     * <p><b>偏移的单位是头部区域长度</b>：立绘用 {@link #headSize}（裁剪框边长 × renderScale），
     * 临时图片用 {@link #tempImageHeadSize}（图片显示宽度 / 3）。两边共享本方法，
     * 所以同一份摆放换任何元素都落在相同的相对位置。
     *
     * @param headCenterX 头部区域中心 X（场景画布坐标）
     * @param headCenterY 头部区域中心 Y
     * @param headSize    头部区域边长（{@link #headSize} / {@link #tempImageHeadSize}）
     * @param canvasWidth  素材画布宽（px）
     * @param canvasHeight 素材画布高（px）
     * @param scale        素材缩放倍率（1 = 原始尺寸）
     * @param userScale    元素的用户缩放（立绘 {@code CharacterVisual.getUserScale()}、
     *                     临时图片 {@code TempImageVisual.getScale()}）
     * @param offsetX      相对头部区域中心的偏移，**单位 = 头部区域长度**，+ 向右
     * @param offsetY      同上，+ 向下
     */
    public static Rect spriteRect(double headCenterX, double headCenterY, double headSize,
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
        // 偏移 × 头宽：头部区域长度是唯一跨元素可比的尺度，所以这个乘法把"相对位置"换算成场景像素
        double x = headCenterX + (Double.isFinite(offsetX) ? offsetX : 0d) * head - width / 2d;
        double y = headCenterY + (Double.isFinite(offsetY) ? offsetY : 0d) * head - height / 2d;
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
