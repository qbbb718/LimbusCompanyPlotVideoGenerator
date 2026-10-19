package com.lbc_plot.render.video;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

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

    @Test
    @DisplayName("异常 scale（NaN / 超大值）回退或收敛，不会产生非法尺寸")
    void invalidScaleIsSanitized() {
        BackgroundVisual nanScale = visual(1920, 1080, Float.NaN, 0, 0);
        assertEquals(new Rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT),
                nanScale.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT));

        BackgroundVisual hugeScale = visual(1920, 1080, 100.0f, 0, 0);
        Rectangle bounds = hugeScale.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT);
        assertEquals(CANVAS_WIDTH * 3, bounds.width, "超过上限的 scale 应收敛到滑杆上限 3.0");
        assertEquals(CANVAS_HEIGHT * 3, bounds.height);

        BackgroundVisual tinyScale = visual(1920, 1080, 0.001f, 0, 0);
        assertEquals(Math.round(CANVAS_WIDTH * 0.1f),
                tinyScale.getDrawBounds(CANVAS_WIDTH, CANVAS_HEIGHT).width,
                "低于下限的 scale 应收敛到滑杆下限 0.1");
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
