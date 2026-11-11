package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
 * 背景「压暗」的渲染回归（剧情编辑 → 背景 → 压暗）。
 *
 * <p>三件必须成立的事：
 * <ol>
 *   <li>不勾时画面与原色一致 —— 老工程 / 老记录重新出片不能有任何变化；</li>
 *   <li>勾上时这张背景按 {@link BackgroundVisual#DIM_OPACITY} 变暗（≈ 一半）；</li>
 *   <li>压暗<b>只作用于它自己那一层</b>：叠在它上面的背景、立绘、临时图片、UI
 *       都不跟着变暗（否则"压暗背景"会变成"压暗整个画面"）。</li>
 * </ol>
 *
 * <p>用合成图案（纯色背景，不读盘）：测试点取设计画布正中心，
 * 那里边框暗角的 alpha 是 0，所以量到的就是背景自己的颜色。
 */
class BackgroundDimRenderingTest {

    /** 与 {@code AnimationRenderBaselineTest} 同一个输出尺寸：小图出片快，结论与 1080p 一致 */
    private static final int OUT_W = 640;
    private static final int OUT_H = 360;

    private static final Color BG_COLOR = new Color(200, 120, 80);
    private static final Color TOP_COLOR = new Color(40, 160, 200);

    /** 探测点 = 输出图正中心（= 设计画布正中心，边框暗角在那里 alpha = 0） */
    private static final int PROBE_X = OUT_W / 2;
    private static final int PROBE_Y = OUT_H / 2;

    /* ==================== 测试 ==================== */

    @Test
    @DisplayName("不勾压暗：画面就是背景原色（与加这个开关之前一致）")
    void withoutDimKeepsOriginalColor() throws Exception {
        BufferedImage image = render(background(BG_COLOR, false));

        assertColor(BG_COLOR, image.getRGB(PROBE_X, PROBE_Y), 2, "未压暗");
    }

    @Test
    @DisplayName("勾上压暗：背景按 50% 变暗（每个通道约减半）")
    void dimmedBackgroundIsHalved() throws Exception {
        BufferedImage bright = render(background(BG_COLOR, false));
        BufferedImage dark = render(background(BG_COLOR, true));

        int brightPixel = bright.getRGB(PROBE_X, PROBE_Y);
        int darkPixel = dark.getRGB(PROBE_X, PROBE_Y);

        for (int shift : new int[] { 16, 8, 0 }) {
            int before = (brightPixel >> shift) & 0xFF;
            int after = (darkPixel >> shift) & 0xFF;
            double ratio = before == 0 ? 0 : after / (double) before;
            assertTrue(ratio > 0.45 && ratio < 0.55,
                    String.format("通道 #%d 压暗后应约为原来的一半，实际 %d → %d（比例 %.3f）",
                            shift, before, after, ratio));
        }
    }

    @Test
    @DisplayName("压暗只压自己那一层：叠在上面的背景保持原色")
    void dimOnlyAffectsItsOwnLayer() throws Exception {
        // 下层压暗、上层不压暗：探测点看到的是上层，必须一点都没变
        BufferedImage image = render(background(BG_COLOR, true), background(TOP_COLOR, false));

        assertColor(TOP_COLOR, image.getRGB(PROBE_X, PROBE_Y), 2, "上层背景");
    }

    @Test
    @DisplayName("默认不压暗；copy() 会带上压暗标记")
    void defaultsToNotDimmedAndCopyKeepsFlag() {
        BackgroundVisual visual = background(BG_COLOR, false);
        assertFalse(visual.isDim(), "没有 setDim 时必须是「不压暗」（旧工程行为不变）");

        visual.setDim(true);
        assertTrue(visual.isDim());
        assertTrue(visual.copy().isDim(), "copy() 必须带上压暗标记，否则拖拽/继承时状态会丢");
    }

    @Test
    @DisplayName("压暗比例是 0.5：与立绘 / 临时图片压暗、前端 CSS brightness(0.5) 同一个契约值")
    void dimOpacityIsHalf() {
        assertEquals(0.5f, BackgroundVisual.DIM_OPACITY,
                "改这个值必须同时改前端 .preview-scene-item.dim 的 brightness()");
    }

    /* ==================== 合成数据 ==================== */

    /**
     * 一条只有一个探针需求的记录：自由文本 + 隐藏 UI，画面上只剩场景层
     * （否则可能被对话框 / 角色名片 / 台词盖住探测点）。
     */
    private static Record record(BackgroundVisual... backgrounds) {
        Record.Builder builder = new Record.Builder()
                .uuid("dim-background")
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

    /** 1920×1080 纯色背景（scale 1、居中 → 正好铺满画布）；压暗标记按 {@code dim} 设置 */
    private static BackgroundVisual background(Color color, boolean dim) {
        BufferedImage image = new BufferedImage(1920, 1080, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(color);
            g.fillRect(0, 0, image.getWidth(), image.getHeight());
        } finally {
            g.dispose();
        }

        BackgroundVisual visual = new BackgroundVisual();
        visual.setBackground(new Background("dim-test-bg.png", "压暗测试背景"));
        visual.setBgImage(image);
        visual.setScale(1f);
        visual.setDim(dim);
        return visual;
    }

    private static BufferedImage render(BackgroundVisual... backgrounds) throws Exception {
        // plot = false：立绘层不参与，画面只剩背景 + 边框暗角
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
