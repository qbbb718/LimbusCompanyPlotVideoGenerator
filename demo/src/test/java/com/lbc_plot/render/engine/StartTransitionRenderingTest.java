package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.lbc_plot.common.util.FFmpegPathResolver;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.EffectVisual;
import com.lbc_plot.render.video.StartTransition;

/**
 * 起始转场的整链路验证：真的编码一条视频，再把帧解出来看。
 *
 * <p>单元测试只能证明"混色公式对"，证明不了特效有没有真的接进导出流程（叠加层有没有生成、
 * 前 20 帧有没有叠、淡出结束后会不会残留）。这里对三种转场各跑一遍
 * {@link RenderOfVideo#exportRecordVideoStreaming}，然后解出第 0 帧 / 第 20 帧比对：
 * <ul>
 *   <li>交叉溶解：第 0 帧 ≈ 上一条记录的最后一帧；</li>
 *   <li>黑屏转场：第 0 帧 ≈ 纯黑；</li>
 *   <li>白屏转场：第 0 帧 ≈ 纯白；</li>
 *   <li>三者共同：第 20 帧 ≈ 本条记录自己的画面（淡出已结束），且第 0 帧明显不是自己的画面。</li>
 * </ul>
 */
@DisplayName("起始转场 - 视频帧验证")
class StartTransitionRenderingTest {

    private static final int WIDTH = 320;
    private static final int HEIGHT = 180;
    private static final int FPS = 30;

    /**
     * 编码是有损的（YCbCr 量化 + 文字抗锯齿边缘），所以只要求"整幅画面几乎一致"：
     * 平均通道差很小即可。这里不用最大像素差——细笔画边缘在编码后单个像素偏几十很常见。
     * 实测：内容相同的两帧平均差约 0~0.5，红字与蓝字的差别约 4.4，两者区分得很开。
     */
    private static final double SAME_MEAN_DIFF = 1.5;

    /**
     * 整屏纯色对比的容差：纯白经过 yuv420p 有损编码后解出来约为 (251,253,250)
     * （有限范围取整），平均差约 3.7，比"同一画面两次渲染"的误差大，所以单独放宽。
     */
    private static final double SOLID_MEAN_DIFF = 6.0;

    @Test
    @DisplayName("交叉溶解：开头叠上一条记录的最后一帧，20 帧后回到自己的画面")
    void crossDissolveOverlaysPreviousLastFrame(@TempDir Path temp) throws Exception {
        Record previous = freeTextRecord("prev", "AAAAAAAA", "#FF0000", null);
        Record current = freeTextRecord("cur", "BBBBBBBB", "#0000FF", EffectVisual.crossDissolve());

        BufferedImage previousLastFrame = RenderOfVideo.renderLastFrame(
                previous, false, WIDTH, HEIGHT, RenderOfVideo.LAYER_FULL);
        List<BufferedImage> frames = renderFrames(current, previous, temp);

        BufferedImage frame0 = frames.get(0);
        BufferedImage frame20 = frames.get(StartTransition.FRAMES);
        BufferedImage ownLastFrame = frames.get(frames.size() - 1);

        assertAlmostSame("第 0 帧应基本等于上一条记录的最后一帧",
                frame0, previousLastFrame);
        assertAlmostSame("淡出结束后应与本条记录自己的画面一致",
                frame20, ownLastFrame);
        assertClearlyDifferent("第 0 帧不应等于本条记录自己的画面，否则说明没有叠加上一帧",
                frame0, ownLastFrame);
    }

    @Test
    @DisplayName("黑屏转场：开头整屏全黑，20 帧后回到自己的画面")
    void fadeFromBlackStartsOnBlackScreen(@TempDir Path temp) throws Exception {
        // 白字放在黑底上，记录自己的画面和纯黑差别明显，便于判断"第 0 帧不是自己的画面"
        Record current = freeTextRecord("black", "BBBBBBBB", "#FFFFFF", EffectVisual.fadeFromBlack());
        List<BufferedImage> frames = renderFrames(current, null, temp);

        BufferedImage frame0 = frames.get(0);
        BufferedImage frame20 = frames.get(StartTransition.FRAMES);
        BufferedImage ownLastFrame = frames.get(frames.size() - 1);

        assertAlmostSame("黑屏转场第 0 帧应为纯黑（从黑屏淡入）", frame0, solid(Color.BLACK), SOLID_MEAN_DIFF);
        assertAlmostSame("淡出结束后应与本条记录自己的画面一致", frame20, ownLastFrame);
        assertClearlyDifferent("第 0 帧不应等于本条记录自己的画面", frame0, ownLastFrame);
    }

    @Test
    @DisplayName("白屏转场：开头整屏全白，20 帧后回到自己的画面")
    void fadeFromWhiteStartsOnWhiteScreen(@TempDir Path temp) throws Exception {
        Record current = freeTextRecord("white", "BBBBBBBB", "#FBDBB3", EffectVisual.fadeFromWhite());
        List<BufferedImage> frames = renderFrames(current, null, temp);

        BufferedImage frame0 = frames.get(0);
        BufferedImage frame20 = frames.get(StartTransition.FRAMES);
        BufferedImage ownLastFrame = frames.get(frames.size() - 1);

        assertAlmostSame("白屏转场第 0 帧应为纯白（从白屏淡入）", frame0, solid(Color.WHITE), SOLID_MEAN_DIFF);
        assertAlmostSame("淡出结束后应与本条记录自己的画面一致", frame20, ownLastFrame);
        assertClearlyDifferent("第 0 帧不应等于本条记录自己的画面", frame0, ownLastFrame);
    }

    /**
     * 编码该记录并解出所有帧。
     *
     * @param record         要渲染的记录（自带起始转场）
     * @param previousRecord 上一条记录（只有交叉溶解需要，其它传 null）
     * @param temp           临时目录
     * @return 按顺序排列的所有帧
     */
    private static List<BufferedImage> renderFrames(Record record, Record previousRecord, Path temp)
            throws Exception {
        String videoPath = temp.resolve("video.mp4").toString();
        RenderOfVideo.exportRecordVideoStreaming(record, false, WIDTH, HEIGHT, videoPath,
                FPS, RenderOfVideo.LAYER_FULL, previousRecord);

        Path framesDir = temp.resolve("frames");
        Files.createDirectories(framesDir);
        extractFrames(videoPath, framesDir);
        List<Path> paths = Files.list(framesDir).sorted().toList();
        assertTrue(paths.size() > StartTransition.FRAMES + 2,
                "视频帧数应足够覆盖转场范围，实际 " + paths.size());

        List<BufferedImage> frames = new ArrayList<>(paths.size());
        for (Path path : paths) {
            frames.add(ImageIO.read(path.toFile()));
        }
        return frames;
    }

    /**
     * 自由文本 + 隐藏UI 的记录：不依赖背景/立绘/数据库，用的是纯黑底 + 居中的彩色大字，
     * 这样"两段文字不一样"在像素上就足够明显（字号按 1080p 设计值给得很大，
     * 缩到 320×180 后仍有 20px 以上，否则文字只占几十个像素，整幅图的平均差看不出区别）。
     */
    private static Record freeTextRecord(String uuid, String text, String color, EffectVisual effect) {
        Dialogue dialogue = Dialogue.builder()
                .text(text)
                .freeText(true)
                .hideUI(true)
                .freeTextColor(color)
                .freeTextFontSize(160)
                .build();
        Record.Builder builder = new Record.Builder()
                .uuid(uuid)
                .dialogue(dialogue)
                .isDirty(true);
        if (effect != null) {
            builder.addEffect(effect);
        }
        return builder.build();
    }

    /** 用项目自带的 ffmpeg 把视频解成 PNG 序列 */
    private static void extractFrames(String videoPath, Path framesDir) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(
                FFmpegPathResolver.getFFmpegPath(),
                "-hide_banner", "-loglevel", "error", "-y",
                "-i", videoPath,
                framesDir.resolve("f_%04d.png").toString());
        builder.redirectErrorStream(true);
        Process process = builder.start();
        try (var in = process.getInputStream()) {
            in.readAllBytes();
        }
        if (!process.waitFor(60, java.util.concurrent.TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IOException("解帧超时");
        }
        if (process.exitValue() != 0) {
            throw new IOException("解帧失败，ffmpeg 退出码 " + process.exitValue());
        }
    }

    private static void assertAlmostSame(String message, BufferedImage actual, BufferedImage expected) {
        assertAlmostSame(message, actual, expected, SAME_MEAN_DIFF);
    }

    private static void assertAlmostSame(String message, BufferedImage actual, BufferedImage expected,
            double tolerance) {
        double diff = meanAbsDiff(actual, expected);
        System.out.printf("[起始转场] %s: mean=%.2f%n", message, diff);
        assertTrue(diff < tolerance, message + "（mean=" + diff + "）");
    }

    private static void assertClearlyDifferent(String message, BufferedImage a, BufferedImage b) {
        double diff = meanAbsDiff(a, b);
        System.out.printf("[起始转场] %s: mean=%.2f%n", message, diff);
        assertTrue(diff > 2 * SAME_MEAN_DIFF, message + "（mean=" + diff + "）");
    }

    private static BufferedImage solid(Color color) {
        BufferedImage image = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
        Graphics2D g2d = image.createGraphics();
        try {
            g2d.setColor(color);
            g2d.fillRect(0, 0, WIDTH, HEIGHT);
        } finally {
            g2d.dispose();
        }
        return image;
    }

    /** 平均通道绝对差（0-255） */
    private static double meanAbsDiff(BufferedImage a, BufferedImage b) {
        long sum = 0;
        long count = 0;
        for (int y = 0; y < Math.min(a.getHeight(), b.getHeight()); y++) {
            for (int x = 0; x < Math.min(a.getWidth(), b.getWidth()); x++) {
                int pa = a.getRGB(x, y);
                int pb = b.getRGB(x, y);
                for (int shift : new int[] { 0, 8, 16 }) {
                    sum += Math.abs(((pa >> shift) & 0xFF) - ((pb >> shift) & 0xFF));
                    count++;
                }
            }
        }
        return (double) sum / count;
    }
}
