package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.BackgroundVisual;
import com.lbc_plot.render.video.EffectVisual;
import com.lbc_plot.render.video.TCorpFilter;
import com.lbc_plot.resource.model.Background;

/**
 * T 巢滤镜的<b>合成层次</b>回归：它必须只染"画面层"，UI 与遮罩一个像素都不能动。
 *
 * <p>用纯色背景（不读盘、不依赖立绘素材），所以断言可以是<b>精确值</b>而不是"看起来差不多"：
 * <ul>
 *   <li>背景是 1920×1080 纯色 → 场景缩到 80% 之后中心仍是同一个颜色，
 *       因此"染色后的中心像素"应当正好等于 {@link TCorpFilter#colorOf} 的结果；</li>
 *   <li>UI 层单独渲染成一张透明图，凡是它 alpha=255 的像素，开/关滤镜必须<b>逐字节相同</b>；</li>
 *   <li>边框暗角在调色<b>之后</b>才压上去 → 场景四角的像素仍是纯黑，不会变成 #070300。</li>
 * </ul>
 */
class TCorpFilterRenderingTest {

    /** 出片尺寸：小图渲染快，纯色区域缩放后仍是纯色，结论与 1080p 一致 */
    private static final int OUT_W = 640;
    private static final int OUT_H = 360;

    /** 背景色：故意选一个"灰调"而不是棕色，否则染色前后不好分辨 */
    private static final Color BG_COLOR = new Color(150, 150, 150);

    /** 输出图中心（= 设计画布中心，边框暗角在那里 alpha = 0） */
    private static final int PROBE_X = OUT_W / 2;
    private static final int PROBE_Y = OUT_H / 2;

    /* ==================== 断言 ==================== */

    @Test
    @DisplayName("关滤镜：画面就是原色（改造前后逐像素一致）")
    void offKeepsOriginalPixels() throws Exception {
        BufferedImage frame = render(record(false, true));

        assertChannel(BG_COLOR.getRed(), frame.getRGB(PROBE_X, PROBE_Y), 16, "关滤镜·R");
        assertChannel(BG_COLOR.getBlue(), frame.getRGB(PROBE_X, PROBE_Y), 0, "关滤镜·B");
    }

    @Test
    @DisplayName("开滤镜：画面层按曲线染色（中灰 → 暖棕，与查找表逐值相符）")
    void onTonesSceneLayerThroughLookupTable() throws Exception {
        BufferedImage frame = render(record(true, true));
        int actual = frame.getRGB(PROBE_X, PROBE_Y);

        // 1920×1080 纯色缩到 80% 之后中心还是同一个颜色 → 可以直接拿曲线算期望值
        int expected = TCorpFilter.colorOf(lumaOf(BG_COLOR));
        assertEquals(expected & 0xFFFFFF, actual & 0xFFFFFF,
                String.format("中灰应被染成曲线上的颜色 #%06X，实际 #%06X",
                        expected & 0xFFFFFF, actual & 0xFFFFFF));

        int r = (actual >> 16) & 0xFF;
        int g = (actual >> 8) & 0xFF;
        int b = actual & 0xFF;
        assertTrue(r > g && g > b, "染色后应是暖棕，实际 " + r + "," + g + "," + b);
    }

    @Test
    @DisplayName("UI 不被染色：UI 完全不透明的像素，开/关滤镜逐字节相同")
    void uiPixelsAreUntouched() throws Exception {
        Record offRecord = record(false, false);
        Record onRecord = record(true, false);

        // 1080p 出片：设计画布 → 输出不缩放，UI 层与成片坐标系完全重合
        int width = ProjectConfig.VIDEO_WIDTH;
        int height = ProjectConfig.VIDEO_HEIGHT;
        int[] off = pixelsOf(render(offRecord, width, height));
        int[] on = pixelsOf(render(onRecord, width, height));

        // UI 层单独渲一张，作为"哪些像素属于 UI"的权威依据
        BufferedImage ui = RenderOfImage.renderUI(true, offRecord.getDialogue());
        assertEquals(width, ui.getWidth(), "UI 层应画在设计画布上");
        assertEquals(height, ui.getHeight(), "UI 层应画在设计画布上");
        int[] uiPixels = pixelsOf(ui);

        int checked = 0;
        int changed = 0;
        for (int i = 0; i < uiPixels.length; i++) {
            if ((uiPixels[i] >>> 24) != 255) {
                continue; // 只验"UI 真正盖住"的像素
            }
            checked++;
            if (off[i] != on[i]) {
                changed++;
            }
        }

        // 对话框素材本身大部分是半透明的（半透明像素会与它背后的场景混色，
        // 那种像素颜色变化是正常的），完全盖住场景的只有外框与文字，约 5k 像素。
        assertTrue(checked > 1000, "UI 探针样本太少，说明对话框没画出来: " + checked);
        assertEquals(0, changed,
                String.format("UI 被染色了：%d/%d 个像素变化（滤镜不该作用到 UI 层）", changed, checked));
    }

    @Test
    @DisplayName("边框暗角不跟着染色：场景四角仍是纯黑，不是 #070300")
    void borderMaskStaysBlack() throws Exception {
        BufferedImage frame = render(record(true, true));

        // 设计画布 (0,0) → 输出图里的场景框左上角
        int x = Math.round(0.1f * OUT_W);
        int y = Math.round(0.1f * OUT_H);
        int corner = frame.getRGB(x, y);

        assertEquals(0, (corner >> 16) & 0xFF, "角上不该出现暖色的红分量，实际 #" + Integer.toHexString(corner));
        assertEquals(0, (corner >> 8) & 0xFF, "角上不该出现暖色的绿分量，实际 #" + Integer.toHexString(corner));
        assertEquals(0, corner & 0xFF, "角上不该出现暖色的蓝分量，实际 #" + Integer.toHexString(corner));
    }

    @Test
    @DisplayName("视频静态帧（导出成片走的 renderPreExceptDialogue）同样被染色")
    void videoStaticFrameIsTonedToo() throws Exception {
        // 导出视频的 LAYER_FULL 逐帧调的就是这个入口：预览会变、成片不变才是真的 bug
        BufferedImage off = RenderOfImage.renderPreExceptDialogue(record(false, true), true, OUT_W, OUT_H);
        BufferedImage on = RenderOfImage.renderPreExceptDialogue(record(true, true), true, OUT_W, OUT_H);

        assertNotEquals(off.getRGB(PROBE_X, PROBE_Y), on.getRGB(PROBE_X, PROBE_Y), "成片这一帧必须跟着变");
        assertEquals(TCorpFilter.colorOf(lumaOf(BG_COLOR)) & 0xFFFFFF,
                on.getRGB(PROBE_X, PROBE_Y) & 0xFFFFFF,
                "成片这一帧应等于曲线上的颜色（与预览图同一条管线）");
    }

    @Test
    @DisplayName("关掉后完全恢复原状（同一记录先开再关，两帧逐字节相同）")
    void turningOffRestoresTheOriginalFrame() throws Exception {
        Record record = record(false, true);
        BufferedImage before = render(record);

        record.addEffectVisual(EffectVisual.tCorpFilter());
        BufferedImage toned = render(record);
        assertNotEquals(before.getRGB(PROBE_X, PROBE_Y), toned.getRGB(PROBE_X, PROBE_Y),
                "开了滤镜画面必须变");

        // 取消勾选 = 把这一条删掉（与前端 toggleTCorpFilter 的语义一致）
        record.getEffects().removeIf(EffectVisual::isTCorpFilter);
        BufferedImage restored = render(record);

        assertArrayEquals(pixelsOf(before), pixelsOf(restored), "关掉后必须与开启前逐像素一致");
    }

    @Test
    @DisplayName("确定性：同一记录连渲两帧完全一致（不引入任何随机/时间依赖）")
    void renderingIsDeterministic() throws Exception {
        Record record = record(true, true);
        BufferedImage first = render(record);
        BufferedImage second = render(record);

        assertArrayEquals(pixelsOf(first), pixelsOf(second));
    }

    @Test
    @DisplayName("无副作用的旁证：加一条与画面无关的特效，静态帧不变")
    void unrelatedEffectsDoNotChangeTheFrame() throws Exception {
        BufferedImage plain = render(record(false, true));

        Record withTransition = record(false, true);
        withTransition.addEffectVisual(EffectVisual.fadeFromBlack());
        BufferedImage frame = render(withTransition);

        assertArrayEquals(pixelsOf(plain), pixelsOf(frame),
                "起始转场只影响成片开头，不该改变静态帧");
    }

    /* ==================== 合成数据 ==================== */

    /**
     * 一条只有背景的记录。
     *
     * @param tone      是否加 T 巢滤镜
     * @param hideUI    true = 隐藏 UI（探针在画面中心，不受对话框影响）
     */
    private static Record record(boolean tone, boolean hideUI) {
        Dialogue.Builder dialogue = Dialogue.builder()
                .text("测试台词")
                .speakerName(Dialogue.DEFAULT_NARRATOR);
        if (hideUI) {
            dialogue.freeText(true).hideUI(true);
        }

        Record record = new Record.Builder()
                .uuid("tone-filter-" + tone + "-" + hideUI)
                .dialogue(dialogue.build())
                .addBackground(background())
                .build();
        if (tone) {
            record.addEffectVisual(EffectVisual.tCorpFilter());
        }
        return record;
    }

    /** 1920×1080 纯色背景（scale 1、居中 → 正好铺满设计画布） */
    private static BackgroundVisual background() {
        BufferedImage image = new BufferedImage(ProjectConfig.VIDEO_WIDTH, ProjectConfig.VIDEO_HEIGHT,
                BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(BG_COLOR);
            g.fillRect(0, 0, image.getWidth(), image.getHeight());
        } finally {
            g.dispose();
        }

        BackgroundVisual visual = new BackgroundVisual();
        visual.setBackground(new Background("tone-test-bg.png", "T巢滤镜测试背景"));
        visual.setBgImage(image);
        visual.setScale(1f);
        return visual;
    }

    private static BufferedImage render(Record record) throws Exception {
        // plot = true：与成片同一条路子（剧情模式才会缩到 80% 并带边框）
        return RenderOfImage.renderPre(record, true, OUT_W, OUT_H);
    }

    private static BufferedImage render(Record record, int width, int height) throws Exception {
        return RenderOfImage.renderPre(record, true, width, height);
    }

    private static int lumaOf(Color color) {
        return Math.round(0.299f * color.getRed() + 0.587f * color.getGreen() + 0.114f * color.getBlue());
    }

    private static int[] pixelsOf(BufferedImage image) {
        return image.getRGB(0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth());
    }

    private static void assertChannel(int expected, int pixel, int shift, String what) {
        assertEquals(expected, (pixel >> shift) & 0xFF, 1,
                String.format("%s：期望 %d，实际 %d（#%06X）", what, expected, (pixel >> shift) & 0xFF,
                        pixel & 0xFFFFFF));
    }
}
