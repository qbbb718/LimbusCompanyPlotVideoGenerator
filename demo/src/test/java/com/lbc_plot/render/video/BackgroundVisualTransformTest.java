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
 *   <li>scale 以「等比铺满 1920×1080 设计画布」为 1.0 基准；</li>
 *   <li>posX / posY 是背景中心相对画布中心的偏移；</li>
 *   <li>scale=1 + pos=0 必须与加缩放功能之前的全屏背景完全一致（16:9 图正好铺满画布）。</li>
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
    @DisplayName("非 16:9 图片等比缩放后居中，不拉伸变形")
    void nonSixteenByNineImageKeepsAspectRatio() {
        BackgroundVisual visual = visual(1000, 1000, 1.0f, 0, 0);

        // 1000×1000 等比放进 1920×1080 => 1080×1080，水平居中 x = (1920-1080)/2 = 420
        assertEquals(new Rectangle(420, 0, 1080, 1080),
                visual.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));
    }

    /**
     * 异常 scale 必须回退或收敛，不能产生非法尺寸。
     *
     * <p>这里<b>不</b>写死 3.0：背景的上限比立绘/临时图片的 3.0 大。9:16 的竖图要盖住
     * 16:9 取景框需要 1920/1080*... ≈ 3.16 倍，卡在 3.0 会差 100 多像素铺不满画面，
     * 所以背景单独放宽到 4.0（前端 {@code visualCoordinates.MAX_BACKGROUND_SCALE} 同一个值）。
     *
     * <p>历史上测试里写死了 3.0，产品把上限调到 4.0 之后这条断言就一直失败——本质是
     * "同一个契约抄了两份数字"。现在统一引用 {@link BackgroundVisual#MAX_SCALE}。
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
    @DisplayName("9:16 竖图靠 4.0 上限才能铺满 16:9 画布；3.0 会留出黑边")
    void portraitImageNeedsWiderLimitToFillCanvas() {
        // 1080×1920 的竖图：等比放进目标框后宽度 = 1080 * fit，需要 fit = 1920/1080 ≈ 1.778，
        // 对应 scale ≈ 3.16。所以 3.0 铺不满、4.0 够用——这就是背景上限放宽的原因。
        BackgroundVisual atOldLimit = visual(1080, 1920, 3.0f, 0, 0);
        Rectangle oldBounds = atOldLimit.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT);
        assertTrue(oldBounds.width < CANVAS_WIDTH,
                "scale=3.0 时 9:16 竖图不该已经铺满（说明上限确实需要大于 3.0），实际宽度 "
                        + oldBounds.width);

        BackgroundVisual atBackgroundLimit = visual(1080, 1920, BackgroundVisual.MAX_SCALE, 0, 0);
        Rectangle fullBounds = atBackgroundLimit.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT);
        assertTrue(fullBounds.width >= CANVAS_WIDTH,
                "scale=上限时 9:16 竖图应能盖满画布宽度，实际 " + fullBounds.width);
        assertTrue(fullBounds.height >= CANVAS_HEIGHT,
                "盖满宽度的同时高度也必须溢出画布，实际 " + fullBounds.height);
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
