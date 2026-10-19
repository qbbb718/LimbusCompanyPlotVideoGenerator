package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.lbc_plot.common.util.FFmpegPathResolver;
import com.lbc_plot.common.util.RecordDurationCalculator;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;

/**
 * 逐字对话动画的整链路验证：真的编码一条视频，再把帧解出来和"应有画面"比对。
 *
 * <p>锁住两件事（都是 {@link RenderOfVideo} 的性能优化，很容易改坏却不容易发现）：
 * <ol>
 *   <li><b>每一帧显示的是当前进度下的文本</b>：第 k 帧应等于"只显示前 k 个字符"的画面。
 *       如果逐帧文本预计算错了（差一位、整体错位），画面会一直慢半拍或者提前显示全文；</li>
 *   <li><b>定格帧复用没有把画面冻在错误的帧上</b>：动画结束后有 75 帧（{@code DEFAULT_STAY_FRAMES}）
 *       是完全相同的画面，实现上直接复用上一张已画好的帧。复用写错（比如复用了上一张"不同文本"的帧）
 *       会让整段视频停在某个字上——这里逐帧比对能立刻抓到。</li>
 * </ol>
 */
@DisplayName("逐字对话动画 - 视频帧验证")
class DialogueTypingAnimationTest {

    private static final int WIDTH = 320;
    private static final int HEIGHT = 180;
    private static final int FPS = 30;
    private static final String FULL_TEXT = "ABCDEFGH";

    /** 编码有损：内容相同的两帧平均差约 0~0.5，差一个字母约 2 以上，取 1.5 区分。 */
    private static final double SAME_MEAN_DIFF = 1.5;

    @Test
    @DisplayName("第 k 帧显示前 k 个字符，动画结束后定格在完整文本")
    void framesShowProgressiveTextAndFreezeAtTheEnd(@TempDir Path temp) throws Exception {
        Record record = typingRecord(FULL_TEXT);
        int totalFrames = RecordDurationCalculator.calculateDurationFrames(record, FPS);
        int animationFrames = FULL_TEXT.length(); // 速度 3 = 1 字符/帧
        assertTrue(totalFrames > animationFrames + 10,
                "记录时长应明显长于打字动画，才能覆盖定格帧，实际 " + totalFrames + " 帧");

        List<BufferedImage> frames = renderFrames(record, temp);
        assertEquals(totalFrames, frames.size(), "解出的帧数应与计算出的时长一致");

        // 动画段：第 k 帧 == 只显示前 k 个字符的画面
        for (int k = 1; k <= animationFrames; k++) {
            String expectedText = FULL_TEXT.substring(0, k);
            BufferedImage expected = RenderOfVideo.renderLastFrame(
                    typingRecord(expectedText), false, WIDTH, HEIGHT, RenderOfVideo.LAYER_FULL);
            assertAlmostSame("第 " + k + " 帧应显示「" + expectedText + "」", frames.get(k - 1), expected);
        }

        // 定格段：动画结束后每一帧都应等于完整文本的画面
        BufferedImage fullTextFrame = RenderOfVideo.renderLastFrame(
                typingRecord(FULL_TEXT), false, WIDTH, HEIGHT, RenderOfVideo.LAYER_FULL);
        for (int index : new int[] { animationFrames, animationFrames + 1, totalFrames / 2, totalFrames - 1 }) {
            if (index < animationFrames) {
                continue;
            }
            assertAlmostSame("第 " + index + " 帧（定格段）应显示完整文本", frames.get(index), fullTextFrame);
        }

        // 首帧与动画末帧必须明显不同，否则说明"每帧文本"没生效（比如全片都用了最后一帧）
        double diffFirstVsLastAnimationFrame = meanAbsDiff(frames.get(0), frames.get(animationFrames - 1));
        assertTrue(diffFirstVsLastAnimationFrame > 3,
                "第 1 帧与第 " + animationFrames + " 帧应当明显不同（打字动画在推进），实际平均差 "
                        + diffFirstVsLastAnimationFrame);
    }

    /** 渲染并解出所有帧。 */
    private static List<BufferedImage> renderFrames(Record record, Path temp) throws Exception {
        String videoPath = temp.resolve("typing.mp4").toString();
        RenderOfVideo.exportRecordVideoStreaming(record, false, WIDTH, HEIGHT, videoPath,
                FPS, RenderOfVideo.LAYER_FULL, null);

        Path framesDir = temp.resolve("frames");
        Files.createDirectories(framesDir);
        extractFrames(videoPath, framesDir);
        List<Path> paths = Files.list(framesDir).sorted().toList();

        List<BufferedImage> frames = new ArrayList<>(paths.size());
        for (Path path : paths) {
            frames.add(ImageIO.read(path.toFile()));
        }
        return frames;
    }

    /** 自由文本 + 隐藏UI：不依赖背景/立绘/数据库，正文直接画在黑底上，文字差异最容易量化。 */
    private static Record typingRecord(String text) {
        Dialogue dialogue = Dialogue.builder()
                .text(text)
                .freeText(true)
                .hideUI(true)
                .freeTextColor("#FFFFFF")
                .freeTextFontSize(ProjectConfig.DIALOGUE_FONT_SIZE * 6)
                .build();
        return new Record.Builder()
                .uuid("typing-" + text.length())
                .dialogue(dialogue)
                .isDirty(true)
                .build();
    }

    /** 用项目自带的 ffmpeg 把视频解成 PNG 序列。 */
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
        if (!process.waitFor(60, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IOException("解帧超时");
        }
        if (process.exitValue() != 0) {
            throw new IOException("解帧失败，ffmpeg 退出码 " + process.exitValue());
        }
    }

    private static void assertAlmostSame(String message, BufferedImage actual, BufferedImage expected) {
        double diff = meanAbsDiff(actual, expected);
        assertTrue(diff < SAME_MEAN_DIFF, message + "（平均差 " + diff + "）");
    }

    /** 平均通道绝对差（0-255）。 */
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
