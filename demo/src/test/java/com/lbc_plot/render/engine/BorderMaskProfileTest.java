package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 四周黑色渐变遮罩（{@link RenderOfImage#border}）的<b>形状</b>必须和原作画面一致。
 *
 * <p>这组参数是拿"原作截图 + 同款背景"反解出来的：对同一像素求
 * {@code alpha = 1 - 原作亮度 / 背景亮度}，再按距离拟合
 * {@code alpha(d) = 1/(1+(d/半衰距离)^q)}。测试里的参照值就是从原作帧量到的那几条。
 *
 * <p>为什么值得盯：修这个问题之前用的是 {@code border_1080p.png} 的 45px 渐变，
 * 剧情模式缩到 0.8 后成片里只剩 36px，而原作那道暗角一直延伸到约 190px（1080p 设计画布）。
 * 用 45px 素材无论怎么加深都做不出这个柔边，成片看着就是"画面被一条硬黑边切进去"。
 * 所以下面既断言"半衰距离对不对"，也断言"过渡带必须比 45px 素材宽得多"。
 */
class BorderMaskProfileTest {

    /** 遮罩（1080p 设计画布）→ 成片的缩放比：剧情模式把场景缩到 80% */
    private static final float FRAME_SCALE = 0.8f;

    /**
     * 原作帧上量到的水平方向不透明度（左右两条边各 500+ 个采样点的平均；这两条边取样区域
     * 在画面左右中段，没有 UI 遮挡，是最干净的一组数据）。
     *
     * <p>第一列是成片像素距离，第二列是原作实测的 alpha。
     */
    private static final float[][] REFERENCE_SIDES = {
            { 20, 0.958f }, { 40, 0.833f }, { 60, 0.580f }, { 80, 0.317f }, { 100, 0.191f },
    };

    /**
     * 原作帧上量到的垂直方向不透明度（上边）。它比左右略深、尾巴也长一点，但上部有地点牌和
     * 右上角菜单按钮的软阴影，很难分清"遮罩"与"UI 投影"，所以这里只钉住离边 60px 以内的肩部。
     */
    private static final float[][] REFERENCE_TOP = {
            { 20, 0.904f }, { 40, 0.624f }, { 60, 0.385f },
    };

    /** 左右：实测数据干净，容差收紧；上下：受 UI 投影干扰，放宽一点 */
    private static final float TOLERANCE_SIDES = 0.05f;

    /** 上下方向的容差，见 {@link #REFERENCE_TOP} */
    private static final float TOLERANCE_TOP = 0.07f;

    @Test
    @DisplayName("左右/上下的渐变都与原作帧吻合")
    void profileMatchesReferenceFrame() {
        BufferedImage mask = RenderOfImage.border;
        assertNotNull(mask, "遮罩应当生成成功（RenderOfImage 的 static 初始化）");
        assertEquals(1920, mask.getWidth());
        assertEquals(1080, mask.getHeight());

        int midY = mask.getHeight() / 2;
        int midX = mask.getWidth() / 2;
        StringBuilder diffs = new StringBuilder();
        for (float[] ref : REFERENCE_SIDES) {
            int sceneD = Math.round(ref[0] / FRAME_SCALE);
            float actual = alpha(mask, sceneD, midY);
            diffs.append(String.format("左右 d=%.0f: 原作 %.3f / 遮罩 %.3f%n", ref[0], ref[1], actual));
            assertTrue(Math.abs(actual - ref[1]) <= TOLERANCE_SIDES,
                    String.format("左右 d=%.0f 处不透明度应接近原作 %.3f，实际 %.3f", ref[0], ref[1], actual));
        }
        for (float[] ref : REFERENCE_TOP) {
            int sceneD = Math.round(ref[0] / FRAME_SCALE);
            float actual = alpha(mask, midX, sceneD);
            diffs.append(String.format("上下 d=%.0f: 原作 %.3f / 遮罩 %.3f%n", ref[0], ref[1], actual));
            assertTrue(Math.abs(actual - ref[1]) <= TOLERANCE_TOP,
                    String.format("上下 d=%.0f 处不透明度应接近原作 %.3f，实际 %.3f", ref[0], ref[1], actual));
        }
        System.out.print(diffs);
    }

    @Test
    @DisplayName("画面边缘纯黑、中间全透明，过渡带远宽于 45px 素材")
    void maskIsBlackAtEdgeAndTransparentInside() {
        BufferedImage mask = RenderOfImage.border;
        assertNotNull(mask);
        int w = mask.getWidth();
        int h = mask.getHeight();
        int midY = h / 2;
        int midX = w / 2;

        // 四边最外沿都必须是纯黑，且 RGB 真的黑（遮罩只改 alpha，不能带颜色）
        for (int[] p : new int[][] { { 0, midY }, { w - 1, midY }, { midX, 0 }, { midX, h - 1 } }) {
            int argb = mask.getRGB(p[0], p[1]);
            assertEquals(255, argb >>> 24, String.format("(%d,%d) 最外沿必须完全不透明", p[0], p[1]));
            assertEquals(0, argb & 0x00FFFFFF, String.format("(%d,%d) 遮罩必须是纯黑", p[0], p[1]));
        }

        // 画面中心全透明
        assertEquals(0, mask.getRGB(midX, midY) >>> 24, "画面中心不应有遮罩");

        // 过渡带宽度：成片里 160px（=设计画布 200px）处还应该看得见一点点，
        // 老实现用的是 45px 素材（设计画布 56px 就归零了），这里正好卡住"别又缩回去"
        int sceneD = Math.round(160 / FRAME_SCALE);
        assertTrue(alpha(mask, sceneD, midY) > 0.01f,
                "左侧 200px 处仍应有遮罩（原作暗角一直延伸到约 190px）");
        // 曲线是渐近的，尾端不会突然归零，但 400px 处的残留必须小到看不出来（<= 2/255）
        assertTrue(alpha(mask, 400, midY) <= 0.01f,
                "画面内部不能有整幅压暗（400px 处的残留应 <= 2/255）");

        // 从边缘往内必须单调变淡（不能有第二道亮/暗环）
        float previous = 1f;
        for (int d = 0; d < w / 2; d += 5) {
            float current = alpha(mask, d, midY);
            assertTrue(current <= previous + 1e-6f,
                    String.format("距左边 %dpx 处反而变深了（%.4f > %.4f）", d, current, previous));
            previous = current;
        }
    }

    @Test
    @DisplayName("角上两条边叠加：比任一单边更深，但仍沿对角线柔和过渡")
    void cornersCombineBothEdges() {
        BufferedImage mask = RenderOfImage.border;
        assertNotNull(mask);
        int midY = mask.getHeight() / 2;
        int midX = mask.getWidth() / 2;

        float leftOnly = alpha(mask, 60, midY); // 左边 60px、垂直居中
        float topOnly = alpha(mask, midX, 60); // 上边 60px、水平居中
        float corner = alpha(mask, 60, 60); // 左上角 60px,60px

        assertTrue(corner > leftOnly, String.format("角上应比左边更深（%.3f vs %.3f）", corner, leftOnly));
        assertTrue(corner > topOnly, String.format("角上应比上边更深（%.3f vs %.3f）", corner, topOnly));
        assertTrue(corner < 1f, "角上不应直接顶到全黑，否则会出现硬角");
    }

    private static float alpha(BufferedImage mask, int x, int y) {
        return (mask.getRGB(x, y) >>> 24) / 255f;
    }
}
