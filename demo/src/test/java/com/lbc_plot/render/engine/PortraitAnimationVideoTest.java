package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.lbc_plot.common.util.FFmpegPathResolver;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.anim.AnimationClip;
import com.lbc_plot.render.video.anim.SpriteAnimation;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

/**
 * 立绘动画的**整链路**验证：真的编码一条视频，再把帧解出来比对。
 *
 * <p>像素级单测（{@link PortraitAnimationRenderingTest}）只能证明"传入帧号时画对了"，
 * 证明不了"导出流程有没有真的把帧号一帧帧传下去"——而这恰恰是最容易漏的一环
 * （写好了仿射绘制，结果导出时永远传 0，成片就是静止的）。
 *
 * <p>这里锁三件事：
 * <ol>
 *   <li>有动画的记录导出的视频里，第 9 帧与第 0 帧**确实不同**；</li>
 *   <li>第 0 帧与"完全没配动画"的记录导出的第 0 帧**几乎一致**（编码有损，用平均差判断）；</li>
 *   <li>无限循环的动画**不会改变记录时长**（帧数相同）。</li>
 * </ol>
 *
 * <p>位移的精确幅度不在这里断言——那由 {@code PortraitAnimationRenderingTest} 用像素行号精确验证，
 * 避免在"有损编码后的画面"上做精细断言导致测试脆弱。
 */
@DisplayName("立绘动画 - 视频帧验证")
class PortraitAnimationVideoTest {

    private static final int WIDTH = 640;
    private static final int HEIGHT = 360;
    private static final int FPS = 30;

    /** 弹跳幅度（世界像素）：足够大，让有损编码后仍明显不同 */
    private static final double AMPLITUDE = 300d;
    private static final int PEAK_FRAME = 9;

    /** 同一画面两次渲染（经有损编码）允许的平均通道差 */
    private static final double SAME_MEAN_DIFF = 1.5;

    @Test
    @DisplayName("导出视频里立绘真的在动，且第 0 帧与无动画记录一致")
    void animatedPortraitMovesInExportedVideo(@TempDir Path temp) throws Exception {
        Record animated = record(true);
        Record plain = record(false);

        List<BufferedImage> animatedFrames = exportAndExtract(animated, temp.resolve("animated"));
        List<BufferedImage> plainFrames = exportAndExtract(plain, temp.resolve("plain"));

        assertEquals(plainFrames.size(), animatedFrames.size(),
                "无限循环的动画不该改变记录时长（帧数必须相同）");
        assertTrue(animatedFrames.size() > PEAK_FRAME + 2, "帧数要够覆盖到峰值帧");

        assertAlmostSame("第 0 帧应与没有动画时一致（恒等帧）",
                animatedFrames.get(0), plainFrames.get(0));
        assertClearlyDifferent("第 9 帧应与第 0 帧不同，否则说明动画没有进成片",
                animatedFrames.get(PEAK_FRAME), animatedFrames.get(0));
        assertAlmostSame("第 0 帧与无动画记录的第 9 帧也应一致（无动画时不随时间变化）",
                animatedFrames.get(0), plainFrames.get(PEAK_FRAME));
    }

    /* ==================== 记录构造 ==================== */

    private static Record record(boolean animated) throws Exception {
        MyCharacter character = MyCharacter.builder()
                .characterID("c-video")
                .characterName("视频角色")
                .height(171)
                .faction("测试")
                .build();
        Portrait portrait = Portrait.builder("")
                .portraitID("p-video")
                .characterID("c-video")
                .imagePath("")
                .portName("视频立绘")
                .facePosition(0, 0)
                .length(183)
                .image(probeImage())
                .build();

        CharacterVisual.Builder builder = CharacterVisual.builder(character, portrait)
                .adjustment(0, 0)
                .scale(1.0f)
                .bright();
        if (animated) {
            builder.anim(bounceAnimation());
        }

        return new Record.Builder()
                .uuid(animated ? "video-animated" : "video-plain")
                .dialogue(Dialogue.builder().text("").speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .addCharacter(builder.build())
                .isDirty(true)
                .build();
    }

    /** 弹跳：幅度 300、周期 18 帧 → 第 9 帧在最高点；无限循环（不参与时长计算） */
    private static SpriteAnimation bounceAnimation() {
        AnimationClip clip = new AnimationClip();
        clip.setId("bounce-video");
        clip.setKind("preset");
        clip.setPreset("bounce");
        clip.setDurationFrames(180);
        clip.setLoop("loop");
        clip.setParams(Map.of("amplitude", AMPLITUDE, "periodFrames", 18, "iterations", 0));

        SpriteAnimation anim = new SpriteAnimation();
        anim.setVersion(1);
        anim.setTimebase(new SpriteAnimation.Timebase("frame", FPS));
        anim.setClips(List.of(clip));
        return anim;
    }

    /** 透明底 + 大块实心矩形：位移在视频里足够显眼 */
    private static BufferedImage probeImage() {
        BufferedImage image = new BufferedImage(400, 400, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(new Color(0xE0, 0x40, 0x40));
            g.fillRect(40, 30, 320, 340);
        } finally {
            g.dispose();
        }
        return image;
    }

    /* ==================== 导出与解帧 ==================== */

    private static List<BufferedImage> exportAndExtract(Record record, Path workDir) throws Exception {
        Files.createDirectories(workDir);
        String videoPath = workDir.resolve("video.mp4").toString();
        RenderOfVideo.exportRecordVideoStreaming(record, true, WIDTH, HEIGHT, videoPath,
                FPS, RenderOfVideo.LAYER_FULL, null);

        Path framesDir = workDir.resolve("frames");
        Files.createDirectories(framesDir);
        extractFrames(videoPath, framesDir);

        List<Path> paths = Files.list(framesDir).sorted().toList();
        List<BufferedImage> frames = new ArrayList<>(paths.size());
        for (Path path : paths) {
            frames.add(ImageIO.read(path.toFile()));
        }
        return frames;
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
        if (!process.waitFor(60, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IOException("解帧超时");
        }
        if (process.exitValue() != 0) {
            throw new IOException("解帧失败，ffmpeg 退出码 " + process.exitValue());
        }
    }

    /* ==================== 断言工具 ==================== */

    private static void assertAlmostSame(String message, BufferedImage actual, BufferedImage expected) {
        double diff = meanAbsDiff(actual, expected);
        System.out.printf("[立绘动画] %s: mean=%.2f%n", message, diff);
        assertTrue(diff < SAME_MEAN_DIFF, message + "（mean=" + diff + "）");
    }

    private static void assertClearlyDifferent(String message, BufferedImage a, BufferedImage b) {
        double diff = meanAbsDiff(a, b);
        System.out.printf("[立绘动画] %s: mean=%.2f%n", message, diff);
        assertTrue(diff > 2 * SAME_MEAN_DIFF, message + "（mean=" + diff + "）");
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
