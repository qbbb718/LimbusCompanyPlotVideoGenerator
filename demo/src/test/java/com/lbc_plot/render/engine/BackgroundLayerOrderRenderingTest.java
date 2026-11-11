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
 * 背景「层级（z-order）」的渲染回归（剧情编辑 → 背景 → ↑ / ↓）。
 *
 * <p>约定：`record.bg` 的**数组顺序就是叠放顺序，首项在画面最前**（列表最上 = 画面最前），
 * 渲染时倒序遍历（末尾先画、首项后画）。这里用两张铺满画布的纯色背景钉住四件事：
 * <ol>
 *   <li>首项盖住末项 —— 不是"后加的盖住先加的"，而是"列表最上面那张最前"；</li>
 *   <li>交换两项（= 面板上的上移 / 下移）后，画面叠放跟着交换；</li>
 *   <li>预览（{@link RenderOfImage#renderPre}）、导出逐帧（{@link RenderOfImage#renderPreExceptDialogue}）、
 *       纯背景渲染（{@link RenderOfImage#renderBackgroundOnly}）用的是同一个顺序；</li>
 *   <li>层级只由顺序决定，不依赖任何新增字段（保存 / 加载就是记录里的数组顺序）。</li>
 * </ol>
 *
 * <p>用合成图案（纯色背景，不读盘）：测试点取输出图正中心（设计画布中心），
 * 那里边框暗角的 alpha 是 0，量到的就是背景自己的颜色。
 */
class BackgroundLayerOrderRenderingTest {

    /** 与 {@code BackgroundDimRenderingTest} 同一个输出尺寸：小图出片快，结论与 1080p 一致 */
    private static final int OUT_W = 640;
    private static final int OUT_H = 360;

    /** 列表首项（画面最前）的颜色 */
    private static final Color FRONT_COLOR = new Color(200, 120, 80);
    /** 列表末项（画面最底层）的颜色 */
    private static final Color BACK_COLOR = new Color(40, 160, 200);

    /** 探测点 = 输出图正中心（= 设计画布正中心，边框暗角在那里 alpha = 0） */
    private static final int PROBE_X = OUT_W / 2;
    private static final int PROBE_Y = OUT_H / 2;

    /* ==================== 测试 ==================== */

    @Test
    @DisplayName("列表首项在画面最前：两张全屏背景重叠时看到的是首项的颜色")
    void firstItemIsFrontMost() throws Exception {
        BufferedImage image = render(background(FRONT_COLOR), background(BACK_COLOR));

        assertColor(FRONT_COLOR, image.getRGB(PROBE_X, PROBE_Y), 2, "列表首项");
    }

    @Test
    @DisplayName("交换顺序（= 上移 / 下移）后画面跟着换：看到的是新的首项")
    void swappingItemsSwapsLayers() throws Exception {
        // 把两张背景换个位置：原来的底层跑到列表最上 → 变成画面最前
        BufferedImage image = render(background(BACK_COLOR), background(FRONT_COLOR));

        assertColor(BACK_COLOR, image.getRGB(PROBE_X, PROBE_Y), 2, "交换后的首项");
    }

    @Test
    @DisplayName("导出逐帧（renderPreExceptDialogue）与预览（renderPre）用同一个层级")
    void exportPathUsesSameOrder() throws Exception {
        Record record = record(background(FRONT_COLOR), background(BACK_COLOR));

        BufferedImage preview = RenderOfImage.renderPre(record, false, OUT_W, OUT_H);
        BufferedImage exportFrame = RenderOfImage.renderPreExceptDialogue(record, false, OUT_W, OUT_H);

        assertColor(FRONT_COLOR, preview.getRGB(PROBE_X, PROBE_Y), 2, "预览");
        assertColor(FRONT_COLOR, exportFrame.getRGB(PROBE_X, PROBE_Y), 2, "导出帧");
    }

    @Test
    @DisplayName("纯背景渲染（renderBackgroundOnly）同样首项在上（摄像机 / 背景缩略图走这条）")
    void backgroundOnlyUsesSameOrder() throws Exception {
        BufferedImage image = RenderOfImage.renderBackgroundOnly(
                record(background(FRONT_COLOR), background(BACK_COLOR)), false, OUT_W, OUT_H);

        assertColor(FRONT_COLOR, image.getRGB(PROBE_X, PROBE_Y), 2, "纯背景渲染");
    }

    /* ==================== 合成数据 ==================== */

    /**
     * 一条只在画面上留背景的记录：自由文本 + 隐藏 UI，探针不会被对话框 / 台词盖住。
     * 背景按参数顺序加入 {@code bg}（首项 = 画面前层）。
     */
    private static Record record(BackgroundVisual... backgrounds) {
        Record.Builder builder = new Record.Builder()
                .uuid("background-layer-order")
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

    /** 1920×1080 纯色背景（scale 1、居中 → 正好铺满画布） */
    private static BackgroundVisual background(Color color) {
        BufferedImage image = new BufferedImage(1920, 1080, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(color);
            g.fillRect(0, 0, image.getWidth(), image.getHeight());
        } finally {
            g.dispose();
        }

        BackgroundVisual visual = new BackgroundVisual();
        visual.setBackground(new Background("layer-order-bg.png", "层级测试背景"));
        visual.setBgImage(image);
        visual.setScale(1f);
        return visual;
    }

    /** 只画背景渲染（plot = false：立绘层不参与，画面只剩背景 + 边框暗角） */
    private static BufferedImage render(BackgroundVisual... backgrounds) throws Exception {
        return RenderOfImage.renderPre(record(backgrounds), false, OUT_W, OUT_H);
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
