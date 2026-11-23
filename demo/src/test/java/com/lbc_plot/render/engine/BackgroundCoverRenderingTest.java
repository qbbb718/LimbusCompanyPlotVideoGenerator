package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.BackgroundVisual;
import com.lbc_plot.resource.model.Background;

/**
 * 背景「等比放大铺满」（cover / {@code object-fit: cover}）的渲染回归。
 *
 * <p>这是需求「任意比例的背景图片在预览图中均无黑边、且不被拉伸变形」的**像素级验收**：
 * 几何单测（{@link com.lbc_plot.render.video.BackgroundVisualTransformTest}）只量矩形，
 * 这里真的出一张图，逐点确认画面四条边上量到的就是背景自己的颜色。
 *
 * <p>用的是 {@link RenderOfImage#renderBackgroundOnly}：它只合成背景层（没有边框暗角、
 * 没有 UI 与台词），四角/四边的像素因此能直接判定——铺满时是背景色，
 * 之前 contain 的画法在那几个点上是透明的（= 黑边）。
 */
class BackgroundCoverRenderingTest {

    /** 小图出片快，结论与 1080p 一致（内部在 1080p 设计画布上合成，最后只缩一次） */
    private static final int OUT_W = 640;
    private static final int OUT_H = 360;

    /** 纯色背景：铺满时四角四边都该是这个颜色 */
    private static final Color FILL = new Color(30, 160, 90);

    /** 三色横条背景：用来验证"居中裁剪"，见 {@link #wideImageIsCroppedAroundItsCenter()} */
    private static final Color LEFT_BAND = new Color(220, 40, 40);
    private static final Color CENTER_BAND = new Color(40, 200, 60);
    private static final Color RIGHT_BAND = new Color(40, 60, 220);

    @Test
    @DisplayName("任意比例的背景都铺满画面：四角与四边中点都是背景色，一条黑边都不留")
    void anyAspectRatioLeavesNoBlackBars() throws Exception {
        int[][] sizes = {
                { 1920, 1080 }, // 16:9：正好铺满
                { 3600, 1080 }, // 30:9 横长条：纵向铺满、左右溢出
                { 1080, 1920 }, // 9:16 竖图：横向铺满、上下溢出
                { 1000, 1000 }, // 1:1
                { 2400, 1600 }, // 3:2
        };
        // 四角 + 四边中点：只要有一条边没被图片盖住，这些点里必然有一个露出底色
        int[][] probes = {
                { 0, 0 }, { OUT_W - 1, 0 }, { 0, OUT_H - 1 }, { OUT_W - 1, OUT_H - 1 },
                { OUT_W / 2, 0 }, { OUT_W / 2, OUT_H - 1 },
                { 0, OUT_H / 2 }, { OUT_W - 1, OUT_H / 2 },
        };

        for (int[] size : sizes) {
            BufferedImage image = render(solid(size[0], size[1], FILL));
            String what = size[0] + "x" + size[1];

            for (int[] probe : probes) {
                assertColor(FILL, image.getRGB(probe[0], probe[1]), 2,
                        String.format("%s 背景在 (%d,%d) 处", what, probe[0], probe[1]));
            }
            // 正中心当然也得是背景色（不能只有边上是）
            assertColor(FILL, image.getRGB(OUT_W / 2, OUT_H / 2), 2, what + " 背景正中心");
        }
    }

    /**
     * 居中裁剪：横长条背景铺满后，画面上从左到右依次是「左带 → 中带 → 右带」。
     *
     * <p>原图 3000×1000（三段各 1000 宽）按 cover 铺进 1920×1080：
     * {@code fit = max(1920/3000, 1080/1000) = 1.08} → 画成 3240×1080，横向居中
     * （左边裁掉 660 像素，也就是原图 611.1 像素）。
     * 于是两条分界线落在画布 x = 1000×1.08 − 660 = 420 与 2000×1.08 − 660 = 1500，
     * 换算到 640×360 的输出图就是 x = 140 与 x = 500。
     *
     * <p>这就是"以图片中心为基准裁剪"的直接证据：中间那段正好在画面中央；
     * 若是贴左裁（不居中），画面中心会变成左带的颜色。
     */
    @Test
    @DisplayName("铺满后的裁剪以图片中心为基准：三色横条的中间一段正好落在画面中央")
    void wideImageIsCroppedAroundItsCenter() throws Exception {
        BufferedImage image = render(bands(3000, 1000));
        int y = OUT_H / 2;

        assertColor(LEFT_BAND, image.getRGB(40, y), 2, "画面左侧应是原图左带");
        assertColor(CENTER_BAND, image.getRGB(OUT_W / 2, y), 2, "画面中心应是原图中带（居中裁剪）");
        assertColor(RIGHT_BAND, image.getRGB(600, y), 2, "画面右侧应是原图右带");
    }

    /* ==================== 合成数据 ==================== */

    /** 一条只在画面上留背景的记录：自由文本 + 隐藏 UI，画面不会被对话框 / 台词盖住 */
    private static Record record(BackgroundVisual... backgrounds) {
        Record.Builder builder = new Record.Builder()
                .uuid("background-cover")
                .dialogue(Dialogue.builder()
                        .text("")
                        .speakerName(Dialogue.DEFAULT_NARRATOR)
                        .freeText(true)
                        .hideUI(true)
                        .build());
        for (BackgroundVisual background : backgrounds) {
            builder.addBackground(background);
        }
        return builder.build();
    }

    /** 指定尺寸的纯色背景（scale 1 = 等比铺满画布） */
    private static BackgroundVisual solid(int width, int height, Color color) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(color);
            g.fillRect(0, 0, width, height);
        } finally {
            g.dispose();
        }
        return visual(image);
    }

    /** 三段等宽、颜色不同的横条背景（左红 / 中绿 / 右蓝） */
    private static BackgroundVisual bands(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            int band = width / 3;
            g.setColor(LEFT_BAND);
            g.fillRect(0, 0, band, height);
            g.setColor(CENTER_BAND);
            g.fillRect(band, 0, band, height);
            g.setColor(RIGHT_BAND);
            g.fillRect(band * 2, 0, width - band * 2, height);
        } finally {
            g.dispose();
        }
        return visual(image);
    }

    /** 包成 scale=1、居中、不压暗的背景视觉元素 */
    private static BackgroundVisual visual(BufferedImage image) {
        BackgroundVisual visual = new BackgroundVisual();
        visual.setBackground(new Background("cover-test-bg.png", "铺满测试背景"));
        visual.setBgImage(image);
        visual.setScale(1f);
        return visual;
    }

    /** 只渲染背景层（plot = false：不叠加立绘、黑边与 UI） */
    private static BufferedImage render(BackgroundVisual background) throws Exception {
        return RenderOfImage.renderBackgroundOnly(record(background), false, OUT_W, OUT_H);
    }

    /** 断言像素颜色（各通道允许 {@code tolerance} 的插值误差） */
    private static void assertColor(Color expected, int actualPixel, int tolerance, String what) {
        int actualR = (actualPixel >> 16) & 0xFF;
        int actualG = (actualPixel >> 8) & 0xFF;
        int actualB = actualPixel & 0xFF;
        assertEquals(expected.getRed(), actualR, tolerance,
                String.format("%s：R 通道应接近 %d，实际 %d", what, expected.getRed(), actualR));
        assertEquals(expected.getGreen(), actualG, tolerance,
                String.format("%s：G 通道应接近 %d，实际 %d", what, expected.getGreen(), actualG));
        assertEquals(expected.getBlue(), actualB, tolerance,
                String.format("%s：B 通道应接近 %d，实际 %d", what, expected.getBlue(), actualB));
    }
}
