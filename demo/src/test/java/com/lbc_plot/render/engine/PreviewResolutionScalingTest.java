package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.common.util.RenderQualityUtils;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.plot.model.Record;

import helpers.RecordsCreater;

/**
 * 预览图/静态帧的输出分辨率缩放测试。
 *
 * <p>回归的是这个问题：设置里把输出分辨率从 1920×1080 调低后，预览图里背景/UI 被缩放到了
 * 输出尺寸、又塞进 1080p 画布，最后整幅再缩一次，于是背景只剩左上角一小块；而立绘/边框仍是
 * 1080p 的比例，看起来就是"立绘没有跟着缩小"。
 *
 * <p>约定（见 {@link RenderOfImage}）：所有素材坐标都按 1080p 设计画布标定，渲染时先在
 * 1080p 画布上合成，最后<strong>只缩放一次</strong>到输出分辨率。因此下面的不变式必须成立：
 * <em>任意分辨率的渲染结果 == 1920×1080 的结果等比缩小</em>。
 */
class PreviewResolutionScalingTest {

    /** 允许的像素误差：理论上为 0，留一点余量以免将来插值实现微调导致误报。 */
    private static final double MAX_MEAN_CHANNEL_DIFF = 1.0;

    /** 设置页面提供的输出分辨率选项（OutputSection.tsx 的 VIDEO_SIZE_OPTIONS）。 */
    private static final int[][] OUTPUT_SIZES = {
            { 1280, 720 }, { 854, 480 }, { 640, 360 },
    };

    @Test
    @DisplayName("任意输出分辨率的预览图 == 1080p 预览图等比缩小（构图与立绘比例完全一致）")
    void previewAtAnyResolutionMatchesDownscaledFullHd() throws Exception {
        List<Record> records = RecordsCreater.creatSupersTestRecord();
        Record record = records.get(0);

        BufferedImage fullHd = RenderOfImage.renderPre(record, true,
                ProjectConfig.VIDEO_WIDTH, ProjectConfig.VIDEO_HEIGHT);
        assertEquals(ProjectConfig.VIDEO_WIDTH, fullHd.getWidth(), "1080p 预览图宽度");
        assertEquals(ProjectConfig.VIDEO_HEIGHT, fullHd.getHeight(), "1080p 预览图高度");

        for (int[] size : OUTPUT_SIZES) {
            int width = size[0];
            int height = size[1];

            BufferedImage actual = RenderOfImage.renderPre(record, true, width, height);
            assertEquals(width, actual.getWidth(), width + "x" + height + " 预览图宽度应为请求值");
            assertEquals(height, actual.getHeight(), width + "x" + height + " 预览图高度应为请求值");

            BufferedImage expected = RenderQualityUtils.scaleImageHighQuality(fullHd, width, height);
            double diff = meanAbsChannelDiff(actual, expected);
            assertTrue(diff <= MAX_MEAN_CHANNEL_DIFF,
                    String.format("%dx%d 预览图与 1080p 等比缩小的结果不一致（平均通道差 %.2f）："
                            + "说明有素材没有跟着输出分辨率一起缩放", width, height, diff));
        }
    }

    /** 平均通道绝对差（0-255），用来判断两幅图是否像素级一致。 */
    private static double meanAbsChannelDiff(BufferedImage a, BufferedImage b) {
        assertEquals(a.getWidth(), b.getWidth(), "比较双方宽度必须一致");
        assertEquals(a.getHeight(), b.getHeight(), "比较双方高度必须一致");

        long sum = 0;
        long count = 0;
        for (int y = 0; y < a.getHeight(); y++) {
            for (int x = 0; x < a.getWidth(); x++) {
                int pa = a.getRGB(x, y);
                int pb = b.getRGB(x, y);
                for (int shift : new int[] { 0, 8, 16, 24 }) {
                    sum += Math.abs(((pa >> shift) & 0xFF) - ((pb >> shift) & 0xFF));
                    count++;
                }
            }
        }
        return (double) sum / count;
    }
}
