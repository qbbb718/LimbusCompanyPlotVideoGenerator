package com.lbc_plot.render.video;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Rectangle;
import java.awt.image.BufferedImage;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 背景缩放 / 位置换算测试（剧情编辑 → 背景 → 缩放 / X、Y 坐标偏移）。
 *
 * <p>约定：
 * <ul>
 *   <li>scale 以「等比铺满 1920×1080 设计画布」为 1.0 基准；「铺满」是 <b>cover</b>：
 *       取宽、高两个方向所需倍数的<b>较大者</b>（= CSS {@code object-fit: cover}）；</li>
 *   <li>posX / posY 是背景中心相对画布中心的偏移；</li>
 *   <li>scale=1 + pos=0 时<b>任意比例</b>的背景都盖满画布、一条黑边都不留，且宽高比不变；</li>
 *   <li>16:9 图在 scale=1 时正好铺满画布，逐像素与加缩放功能之前一致。</li>
 * </ul>
 */
class BackgroundVisualTransformTest {

    private static final int CANVAS_WIDTH = 1920;
    private static final int CANVAS_HEIGHT = 1080;

    /** 不依赖 Background/磁盘资源，直接注入一张内存图。 */
    private static BackgroundVisual visual(int imageWidth, int imageHeight, float scale, int posX, int posY) {
        BackgroundVisual visual = new BackgroundVisual();
        visual.setBgImage(new BufferedImage(imageWidth, imageHeight, BufferedImage.TYPE_INT_ARGB));
        visual.setScale(scale);
        visual.setPosX(posX);
        visual.setPosY(posY);
        return visual;
    }

    @Test
    @DisplayName("默认参数（scale=1、pos=0）铺满画布：与旧的全屏背景行为一致")
    void defaultTransformFillsCanvas() {
        BackgroundVisual visual = visual(1920, 1080, 1.0f, 0, 0);

        assertEquals(new Rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT),
                visual.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));
    }

    @Test
    @DisplayName("同宽高比的 2048×1152 背景在 scale=1 时同样铺满，不产生黑边")
    void sixteenByNineImageFillsCanvas() {
        BackgroundVisual visual = visual(2048, 1152, 1.0f, 0, 0);

        assertEquals(new Rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT),
                visual.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));
    }

    @Test
    @DisplayName("scale=2 以画布中心为基准放大：左上角各移出 1/4 画布，尺寸翻倍")
    void scaleZoomsAroundCanvasCenter() {
        BackgroundVisual visual = visual(1920, 1080, 2.0f, 0, 0);

        // 目标框 3840×2160，居中绘制 => x = (1920-3840)/2 = -960，y = -540
        assertEquals(new Rectangle(-960, -540, 3840, 2160),
                visual.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));
    }

    @Test
    @DisplayName("posX / posY 是相对画布中心的偏移，正右正下，且不设上下限")
    void positionIsOffsetFromCenter() {
        BackgroundVisual visual = visual(1920, 1080, 1.0f, 320, -180);

        assertEquals(new Rectangle(320, -180, CANVAS_WIDTH, CANVAS_HEIGHT),
                visual.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));

        // 放大后可以把背景完全移出画面：偏移量 =（背景尺寸 + 画布尺寸）/ 2 时刚好贴边
        BackgroundVisual pushedOut = visual(1920, 1080, 2.0f, (3840 + CANVAS_WIDTH) / 2, 0);
        assertEquals(CANVAS_WIDTH, pushedOut.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT).x,
                "偏移到 (背景宽 + 画布宽) / 2 时背景左边缘应正好落在画布右边缘（完全移出）");
    }

    @Test
    @DisplayName("横长条（比 16:9 更宽）：纵向铺满画布高度、左右溢出，不留上下黑边")
    void wideImageFillsHeightAndOverflowsWidth() {
        // 3600×1080：fit = max(1920/3600, 1080/1080) = 1 → 画成 3600×1080（高度恰好 = 画布高）
        assertEquals(new Rectangle(-840, 0, 3600, 1080),
                visual(3600, 1080, 1.0f, 0, 0).getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));
    }

    @Test
    @DisplayName("竖图（比 16:9 更窄）：横向铺满画布宽度、上下溢出，不留左右黑边")
    void tallImageFillsWidthAndOverflowsHeight() {
        // 1080×1920：fit = max(1920/1080 = 1.778, 1080/1920) = 1.778 → 画成 1920×3413
        assertEquals(new Rectangle(0, -1166, 1920, 3413),
                visual(1080, 1920, 1.0f, 0, 0).getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));
    }

    @Test
    @DisplayName("正方形图同样铺满：宽高都取画布宽（1920），上下溢出并居中")
    void squareImageFillsWidthAndOverflowsHeight() {
        // 1000×1000：fit = max(1920/1000 = 1.92, 1080/1000 = 1.08) = 1.92 → 画成 1920×1920
        assertEquals(new Rectangle(0, -420, 1920, 1920),
                visual(1000, 1000, 1.0f, 0, 0).getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));
    }

    /**
     * 需求验收：任意比例都不留黑边。
     *
     * <p>判定方式与画面一致——绘制矩形必须在水平、竖直两个方向都<b>不短于</b>画布
     * （{@code x <= 0 && y <= 0 && x + w >= 画布宽 && y + h >= 画布高}），
     * 同时宽高比必须与原图完全一致（等比缩放，不拉伸变形）。
     */
    @Test
    @DisplayName("任意比例的背景在 scale=1 时都盖满画布（无黑边），且宽高比不变")
    void anyAspectRatioCoversCanvasWithoutDistortion() {
        int[][] sizes = {
                { 1920, 1080 }, // 16:9：正好铺满
                { 3840, 2160 }, // 16:9 的 4K 图：同样正好铺满
                { 3600, 1080 }, // 30:9 横长条：左右溢出
                { 2400, 1600 }, // 3:2：略窄于 16:9，上下溢出
                { 1000, 1000 }, // 1:1
                { 1080, 1350 }, // 4:5
                { 1080, 1920 }, // 9:16 竖图：上下大幅溢出
                { 500, 4000 }, // 极端竖长条：上下溢出到离谱，也不能崩
                { 4000, 500 }, // 极端横长条
        };

        for (int[] size : sizes) {
            int imageWidth = size[0];
            int imageHeight = size[1];
            Rectangle bounds = visual(imageWidth, imageHeight, 1.0f, 0, 0)
                    .getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT);
            String what = imageWidth + "x" + imageHeight;

            assertTrue(bounds.x <= 0, what + "：左边缘不能露进画布（x=" + bounds.x + "）");
            assertTrue(bounds.y <= 0, what + "：上边缘不能露进画布（y=" + bounds.y + "）");
            assertTrue(bounds.x + bounds.width >= CANVAS_WIDTH,
                    what + "：右边缘必须盖住画布（实际到 " + (bounds.x + bounds.width) + "）");
            assertTrue(bounds.y + bounds.height >= CANVAS_HEIGHT,
                    what + "：下边缘必须盖住画布（实际到 " + (bounds.y + bounds.height) + "）");

            double imageAspect = (double) imageWidth / imageHeight;
            double drawnAspect = (double) bounds.width / bounds.height;
            // 取整误差最多 1 像素，相对误差留到 0.2%
            assertEquals(imageAspect, drawnAspect, imageAspect * 0.002,
                    what + "：铺满必须等比缩放，不能拉伸变形");
        }
    }

    /**
     * 居中裁剪：绘制矩形的中心 = 画布中心 + (posX, posY)。
     *
     * <p>这正是"裁剪以图片中心为基准"的几何表述：图片中心被摆在画布中心，
     * 所以溢出画布的那两条边被对称裁掉，画面主体留在中间。
     */
    @Test
    @DisplayName("铺满后的裁剪以图片中心为基准：绘制矩形中心落在画布中心（加上手动偏移）")
    void coverCropIsCenteredOnCanvas() {
        int[][] sizes = { { 3600, 1080 }, { 1080, 1920 }, { 1000, 1000 } };
        for (int[] size : sizes) {
            Rectangle centered = visual(size[0], size[1], 1.0f, 0, 0)
                    .getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT);
            assertEquals(CANVAS_WIDTH / 2.0, centered.getCenterX(), 1.0,
                    size[0] + "x" + size[1] + "：横向裁剪必须左右对称");
            assertEquals(CANVAS_HEIGHT / 2.0, centered.getCenterY(), 1.0,
                    size[0] + "x" + size[1] + "：纵向裁剪必须上下对称");

            Rectangle shifted = visual(size[0], size[1], 1.0f, 300, -200)
                    .getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT);
            assertEquals(CANVAS_WIDTH / 2.0 + 300, shifted.getCenterX(), 1.0,
                    "手动偏移应原样叠加在居中位置之上");
            assertEquals(CANVAS_HEIGHT / 2.0 - 200, shifted.getCenterY(), 1.0,
                    "手动偏移应原样叠加在居中位置之上");
        }
    }

    @Test
    @DisplayName("scale 在铺满的基础上再叠一层：竖图放大 2 倍后仍然铺满、宽高比不变")
    void scaleZoomsOnTopOfCover() {
        // 1080×1920 @ scale=2：目标框 3840×2160，fit = max(3840/1080 = 3.556, 2160/1920 = 1.125)
        assertEquals(new Rectangle(-960, -2873, 3840, 6827),
                visual(1080, 1920, 2.0f, 0, 0).getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));
    }

    /**
     * 唯一会露出画布底色的情况：用户主动把 scale 调到 1 以下（拉远）。
     *
     * <p>这不是缺陷而是构图选择；写在这里是为了把"scale=1 必须无黑边"与
     * "scale&lt;1 是用户自己要求留白"两条语义钉清楚，避免以后有人把下限也改成"必须铺满"。
     */
    @Test
    @DisplayName("scale<1 是唯一会露出底色的情况（用户主动拉远）")
    void zoomOutBelowOneIsTheOnlyCaseWithGaps() {
        Rectangle bounds = visual(1920, 1080, 0.5f, 0, 0)
                .getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT);

        assertEquals(new Rectangle(480, 270, 960, 540), bounds);
    }

    /**
     * 异常 scale 必须回退或收敛，不能产生非法尺寸。
     *
     * <p>这里<b>不</b>写死 3.0 / 4.0 之类的数字，直接引用 {@link BackgroundVisual#MAX_SCALE} /
     * {@link BackgroundVisual#MIN_SCALE}：历史上测试里写死了 3.0，产品把上限调到 4.0 之后
     * 这条断言就一直失败——本质是"同一个契约抄了两份数字"。
     */
    @Test
    @DisplayName("异常 scale（NaN / 超大值 / 过小值）回退或收敛，不会产生非法尺寸")
    void invalidScaleIsSanitized() {
        BackgroundVisual nanScale = visual(1920, 1080, Float.NaN, 0, 0);
        assertEquals(new Rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT),
                nanScale.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));

        BackgroundVisual hugeScale = visual(1920, 1080, 100.0f, 0, 0);
        Rectangle bounds = hugeScale.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT);
        assertEquals(Math.round(CANVAS_WIDTH * BackgroundVisual.MAX_SCALE), bounds.width,
                "超过上限的 scale 应收敛到背景滑杆上限 " + BackgroundVisual.MAX_SCALE);
        assertEquals(Math.round(CANVAS_HEIGHT * BackgroundVisual.MAX_SCALE), bounds.height);

        BackgroundVisual tinyScale = visual(1920, 1080, 0.001f, 0, 0);
        assertEquals(Math.round(CANVAS_WIDTH * BackgroundVisual.MIN_SCALE),
                tinyScale.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT).width,
                "低于下限的 scale 应收敛到滑杆下限 " + BackgroundVisual.MIN_SCALE);
    }

    @Test
    @DisplayName("背景上限是 4.0（前端 MAX_BACKGROUND_SCALE 同一个值），比立绘的 3.0 大")
    void backgroundScaleLimitIsWiderThanVisualLimit() {
        // 锁死契约值：前后端任一改动都要同时改这里，避免又出现"产品 4.0、测试 3.0"的漂移
        assertEquals(4.0f, BackgroundVisual.MAX_SCALE,
                "背景缩放上限必须与前端 visualCoordinates.MAX_BACKGROUND_SCALE 保持一致");
        assertEquals(0.1f, BackgroundVisual.MIN_SCALE,
                "背景缩放下限必须与前端 visualCoordinates.MIN_VISUAL_SCALE 保持一致");
    }

    @Test
    @DisplayName("没有图像或画布尺寸非法时返回 null，调用方据此跳过")
    void missingImageOrInvalidCanvasReturnsNull() {
        BackgroundVisual noImage = new BackgroundVisual();
        assertNull(noImage.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));

        BackgroundVisual visual = visual(1920, 1080, 1.0f, 0, 0);
        assertNull(visual.getDrawBounds(0, CANVAS_HEIGHT));
    }

    @Test
    @DisplayName("setScale 仍然拒绝非正数（防止 0 尺寸图层）")
    void setScaleRejectsNonPositive() {
        BackgroundVisual visual = visual(1920, 1080, 1.0f, 0, 0);
        assertThrows(IllegalArgumentException.class, () -> visual.setScale(0f));
        assertThrows(IllegalArgumentException.class, () -> visual.setScale(-1f));
    }
}
