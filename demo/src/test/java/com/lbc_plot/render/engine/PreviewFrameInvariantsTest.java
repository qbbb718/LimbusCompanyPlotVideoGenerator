package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.awt.image.BufferedImage;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.plot.model.Record;

import helpers.RecordsCreater;

/**
 * 预览图 / 视频静态帧的<b>不变量</b>。
 *
 * <p>这些约束看着琐碎，但一旦被破坏就是"成片黑块 / 透明边框被编码成花屏 / 预览图看起来是空的"：
 * <ul>
 *   <li>整幅画面必须<b>完全不透明</b>：外圈黑底是渲染管线的一部分（视频编码器不吃 alpha，
 *       透明区域会被当成未定义像素）；</li>
 *   <li>外圈黑底必须是纯黑：剧情模式把场景缩到 80% 居中，四周是 10% 黑边；</li>
 *   <li>画面中心必须有内容（背景/立绘画上去了）。</li>
 * </ul>
 *
 * <p>回归到这里的原因：预览图曾经用"往图层里塞一块全屏纯色"的方式铺黑底，
 * 后来改成"合成时直接以黑色打底"（少一张 1080p 中间图）。两者必须等价，
 * 由下面的断言兜底。
 */
class PreviewFrameInvariantsTest {

    private static final int WIDTH = ProjectConfig.VIDEO_WIDTH;
    private static final int HEIGHT = ProjectConfig.VIDEO_HEIGHT;

    @Test
    @DisplayName("完整预览图：整幅不透明、四角纯黑、中心有画面")
    void previewIsOpaqueWithBlackLetterbox() throws Exception {
        Record record = firstRecord();
        BufferedImage image = RenderOfImage.renderPre(record, true, WIDTH, HEIGHT);
        assertFrameInvariants(image);
    }

    @Test
    @DisplayName("视频静态帧（不含台词）：整幅不透明、四角纯黑")
    void videoStaticFrameIsOpaqueWithBlackLetterbox() throws Exception {
        Record record = firstRecord();
        BufferedImage image = RenderOfImage.renderPreExceptDialogue(record, true, WIDTH, HEIGHT);
        assertFrameInvariants(image);
    }

    @Test
    @DisplayName("非 1080p 输出同样不透明、四角纯黑（只缩放一次，黑边比例不变）")
    void lowerResolutionKeepsInvariants() throws Exception {
        Record record = firstRecord();
        for (int[] size : new int[][] { { 1280, 720 }, { 640, 360 } }) {
            BufferedImage image = RenderOfImage.renderPre(record, true, size[0], size[1]);
            assertEquals(size[0], image.getWidth());
            assertEquals(size[1], image.getHeight());
            assertFrameInvariants(image);
        }
    }

    /** 整幅不透明 + 四角纯黑 + 中心非纯黑。 */
    private static void assertFrameInvariants(BufferedImage image) {
        assertNotNull(image);
        int w = image.getWidth();
        int h = image.getHeight();

        int[][] corners = { { 0, 0 }, { w - 1, 0 }, { 0, h - 1 }, { w - 1, h - 1 } };
        for (int[] corner : corners) {
            int argb = image.getRGB(corner[0], corner[1]);
            assertEquals(0xFF, argb >>> 24, String.format("(%d,%d) 必须不透明", corner[0], corner[1]));
            assertEquals(0xFF000000, argb,
                    String.format("(%d,%d) 应为纯黑边，实际 #%08X", corner[0], corner[1], argb));
        }

        // 边框内侧一点也应是黑的（0.8 缩放后四边各有 10% 黑边）
        int insetX = Math.max(1, w / 40);
        int insetY = Math.max(1, h / 40);
        for (int[] point : new int[][] { { insetX, insetY }, { w - 1 - insetX, h - 1 - insetY } }) {
            assertEquals(0xFF000000, image.getRGB(point[0], point[1]),
                    String.format("(%d,%d) 应落在黑边内", point[0], point[1]));
        }

        // 中心必须是画面内容（背景/立绘），不能是黑的
        int center = image.getRGB(w / 2, h / 2);
        assertEquals(0xFF, center >>> 24, "中心像素必须不透明");
        assertNotEquals(0xFF000000, center, "中心像素不应是纯黑：说明场景没有画上去");

        // 抽查中间整行/整列：全部不透明
        for (int x = 0; x < w; x += Math.max(1, w / 32)) {
            assertEquals(0xFF, image.getRGB(x, h / 2) >>> 24, "中间行必须整行不透明 x=" + x);
        }
        for (int y = 0; y < h; y += Math.max(1, h / 32)) {
            assertEquals(0xFF, image.getRGB(w / 2, y) >>> 24, "中间列必须整列不透明 y=" + y);
        }
    }

    private static Record firstRecord() throws Exception {
        List<Record> records = RecordsCreater.creatSupersTestRecord();
        return records.get(0);
    }
}
