package com.lbc_plot.render.video;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.plot.model.Record;

/**
 * T 巢滤镜（{@code T_CORP_FILTER}）。
 *
 * <p>锁住四件事：
 * <ol>
 *   <li>只认"已启用"的那一条（空、别的特效、{@code enabled:false} 都不生效）；</li>
 *   <li>曲线本身：端点、单调、全程暖色（R &gt; G &gt; B）——与前端 {@code tCorpFilter.test.ts}
 *       用同一组期望值；</li>
 *   <li>alpha 原样保留、全透明像素不被塞颜色（否则缩小后立绘边上会渗出一圈颜色）；</li>
 *   <li>{@code apply} 不改入参，{@code applyInPlace} 才改。</li>
 * </ol>
 */
@DisplayName("T 巢滤镜 - 调色")
class TCorpFilterTest {

    private static Record recordWith(EffectVisual... effects) {
        Record record = new Record.Builder().uuid("tone").build();
        for (EffectVisual effect : effects) {
            record.addEffectVisual(effect);
        }
        return record;
    }

    private static BufferedImage solid(int argb, int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, argb);
            }
        }
        return image;
    }

    private static int red(int rgb) {
        return (rgb >> 16) & 0xFF;
    }

    private static int green(int rgb) {
        return (rgb >> 8) & 0xFF;
    }

    private static int blue(int rgb) {
        return rgb & 0xFF;
    }

    @Test
    @DisplayName("没有这一条 / 别的特效 / 被禁用 → 不生效")
    void inactiveWithoutEnabledEffect() {
        assertFalse(TCorpFilter.isActive(null), "null 记录不该生效");
        assertFalse(TCorpFilter.isActive(recordWith()), "空 effects 不该生效");
        assertFalse(TCorpFilter.isActive(recordWith(new EffectVisual(EffectVisual.TYPE_CROSS_DISSOLVE))),
                "起始转场不该被当成滤镜");
        assertFalse(TCorpFilter.isActive(recordWith(new EffectVisual(EffectVisual.TYPE_CAMERA_SHAKE))),
                "镜头摇动不该被当成滤镜");

        EffectVisual disabled = EffectVisual.tCorpFilter();
        disabled.setEnabled(false);
        assertFalse(TCorpFilter.isActive(recordWith(disabled)), "enabled:false 的条目不该生效");
    }

    @Test
    @DisplayName("手写工程里只写 type、或大小写不同 → 照样生效")
    void activeForLegacyAndCaseInsensitiveType() {
        assertTrue(TCorpFilter.isActive(recordWith(new EffectVisual(EffectVisual.TYPE_T_CORP_FILTER))),
                "只写 type 的旧写法等于已启用");
        assertTrue(TCorpFilter.isActive(recordWith(new EffectVisual("t_corp_filter"))),
                "类型判断忽略大小写");
        assertTrue(TCorpFilter.isActive(recordWith(EffectVisual.tCorpFilter())));
    }

    @Test
    @DisplayName("端点与参考画面一致：纯黑 → #070300，纯白 → 暖米白 (251,233,210)")
    void endpointsMatchReference() {
        assertEquals(0x070300, TCorpFilter.colorOf(0) & 0xFFFFFF, "最暗端应是极深棕");
        assertEquals(0xFBE9D2, TCorpFilter.colorOf(255) & 0xFFFFFF, "最亮端应是暖米白，不该过曝成纯白");
    }

    @Test
    @DisplayName("动态范围比两点线性宽：暗端压得下去、亮端抬得起来")
    void widerRangeThanTwoPointRamp() {
        // 两点线性（手填 0.13/0.83 那两个端点）的实际输出是 33 → 212
        assertTrue(red(TCorpFilter.colorOf(0)) <= 10,
                "暗端应比 33 深得多，实际 R=" + red(TCorpFilter.colorOf(0)));
        assertTrue(red(TCorpFilter.colorOf(255)) >= 245,
                "亮端应比 212 更接近白，实际 R=" + red(TCorpFilter.colorOf(255)));
        assertEquals(0, blue(TCorpFilter.colorOf(0)), "暗端的蓝分量应压到 0（偏红褐）");
    }

    @Test
    @DisplayName("中段暖色偏（R-B）明显强于两点线性：约 44 vs 约 25")
    void midToneTintIsStrongerThanTwoPointRamp() {
        int mid = TCorpFilter.colorOf(128);
        int spread = red(mid) - blue(mid);
        assertTrue(spread >= 38,
                "中灰的暖色偏应接近实测的 44，实际 R-B=" + spread + "（两点线性只有约 25）");
    }

    @Test
    @DisplayName("全程单调：更亮的地方不会更暗，也不会反相成冷色")
    void tableIsMonotonicAndAlwaysWarm() {
        int[] previous = { -1, -1, -1 };
        for (int luma = 0; luma < 256; luma++) {
            int rgb = TCorpFilter.colorOf(luma);
            int r = red(rgb);
            int g = green(rgb);
            int b = blue(rgb);

            assertTrue(r >= previous[0], "R 在亮度 " + luma + " 处回跌了");
            assertTrue(g >= previous[1], "G 在亮度 " + luma + " 处回跌了");
            assertTrue(b >= previous[2], "B 在亮度 " + luma + " 处回跌了");
            previous[0] = r;
            previous[1] = g;
            previous[2] = b;

            assertTrue(r >= g && g >= b, "亮度 " + luma + " 处不是暖色: " + r + "," + g + "," + b);
        }
    }

    @Test
    @DisplayName("调色只改 RGB，alpha 一个字节都不动；全透明像素不被塞颜色")
    void preservesAlphaAndSkipsTransparentPixels() {
        BufferedImage image = new BufferedImage(4, 1, BufferedImage.TYPE_INT_ARGB);
        image.setRGB(0, 0, 0x00FFFFFF); // 全透明（白色）：必须原样保留
        image.setRGB(1, 0, 0x80FF0000); // 半透明红
        image.setRGB(2, 0, 0xFF000000); // 不透明黑
        image.setRGB(3, 0, 0xFF808080); // 不透明中灰

        TCorpFilter.applyInPlace(image);

        assertEquals(0x00FFFFFF, image.getRGB(0, 0), "全透明像素不该被染色");
        assertEquals(0x80, image.getRGB(1, 0) >>> 24, "半透明像素的 alpha 必须保留");
        assertEquals(0xFF, image.getRGB(3, 0) >>> 24, "不透明像素的 alpha 必须保留");
        assertEquals(0x070300, image.getRGB(2, 0) & 0xFFFFFF, "纯黑应变成极深棕");
    }

    @Test
    @DisplayName("apply 返回副本（不改原图）；null 返回 null")
    void applyReturnsCopy() {
        BufferedImage source = solid(0xFF336699, 2, 2);
        BufferedImage toned = TCorpFilter.apply(source);

        assertNotSame(source, toned, "apply 必须是副本");
        assertEquals(0xFF336699, source.getRGB(0, 0), "原图不该被改");
        assertTrue((toned.getRGB(0, 0) & 0xFFFFFF) != 0x336699, "副本应该已经变色");
        assertNull(TCorpFilter.apply(null));
    }

    @Test
    @DisplayName("同一张图反复调色不会一路漂移/压成死黑（曲线稳定，不累积）")
    void repeatedApplyStaysInBand() {
        BufferedImage once = TCorpFilter.apply(solid(0xFFBFBFBF, 1, 1));
        BufferedImage twice = TCorpFilter.apply(once);

        int onceRgb = once.getRGB(0, 0);
        int twiceRgb = twice.getRGB(0, 0);
        assertTrue(red(twiceRgb) > 60, "重复调色不该把中灰压成死黑，实际 R=" + red(twiceRgb));
        assertTrue(red(twiceRgb) >= green(twiceRgb) && green(twiceRgb) >= blue(twiceRgb),
                "重复调色后仍应是暖色");
        // 染色会改变亮度本身，所以第二次会落在曲线上的相邻一级；要求"基本不动"而不是"完全不动"
        assertTrue(Math.abs(red(twiceRgb) - red(onceRgb)) <= 3,
                "重复调色不该跑偏：一次 R=" + red(onceRgb) + " 两次 R=" + red(twiceRgb));
    }

    @Test
    @DisplayName("1080p 场景画布一帧的耗时（只打印，不做断言）")
    void throughputOn1080p() {
        BufferedImage canvas = solid(0xFF7F7F7F, 1920, 1080);
        TCorpFilter.applyInPlace(canvas); // 预热
        long start = System.nanoTime();
        for (int i = 0; i < 10; i++) {
            TCorpFilter.applyInPlace(canvas);
        }
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;
        System.out.printf("[TCorpFilter] 1080p × 10 次 = %d ms（平均 %.2f ms/帧）%n",
                elapsedMs, elapsedMs / 10.0);
        assertEquals(0xFF, canvas.getRGB(0, 0) >>> 24, "调色后仍应是不透明像素");
    }
}
