package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lbc_plot.common.util.FFmpegPathResolver;
import com.lbc_plot.common.util.SpriteImageCache;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.anim.AnimationClip;
import com.lbc_plot.render.video.anim.SpriteAnimation;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

/**
 * 「预览 vs 成片」截帧验收的**素材导出端**（S3 收尾①）。
 *
 * <h2>它解决什么问题</h2>
 * 所有自动化测试都只证明「两端求值一致 + DOM 样式字符串正确」，证明不了
 * <b>浏览器把 transform 光栅化出来的像素</b>与 <b>Java2D 仿射画出来的像素</b>落在同一处。
 * 这条缝隙只在真浏览器里才能验，而"人肉开应用、加动画、播到第 9 帧、截图比对"不可复查。
 *
 * <h2>它做什么</h2>
 * <ol>
 *   <li>用与 {@code PortraitAnimationVideoTest} 同一个记录（立绘 + 弹跳 + 摇摆）真的导出一条 mp4，
 *       再用项目自带 ffmpeg 解成 PNG —— 验收对象就是"用户拿到的那条成片"；</li>
 *   <li>把浏览器需要的素材（原图 + 几何 + 动画 JSON）写进 {@code demo/target/animation-acceptance/}；
 *   <li>浏览器侧（{@code scripts/animation-acceptance/}）用<b>真实的</b>前端模块
 *       （{@code spriteAnimator.evaluate} + {@code domTransform.spriteDomStyle}）摆 DOM、
 *       截图，再与这里的 PNG 比质心。</li>
 * </ol>
 *
 * <p>默认<b>不跑</b>（整条链路要起 Electron）。手动执行：
 * <pre>mvn -f demo/pom.xml test -Dtest=AnimationFrameAcceptanceExport -Dlbc.acceptance=true</pre>
 *
 * <h2>为什么比"质心"而不是比整幅图</h2>
 * 两侧的重采样算法不同（Java 先双三次预缩放再合成；浏览器直接高质量降采样），边缘一定不同。
 * 但"红块落在哪"必须一致——质心对边缘差异不敏感，且能精确到亚像素。
 * 位移用 {@code 帧9 − 帧0} 的**差值**判定：这样连"基础布局是否一致"都一起验了
 * （基础布局两边都错成同一个值几乎不可能）。
 */
@EnabledIfSystemProperty(named = "lbc.acceptance", matches = "true")
@DisplayName("立绘动画 - 预览/成片截帧验收（导出端）")
class AnimationFrameAcceptanceExport {

    /** 输出分辨率：与前端预览的 stage 同尺寸，浏览器截图才好像素对像素比 */
    private static final int WIDTH = 640;
    private static final int HEIGHT = 360;
    private static final int FPS = 30;
    /** 参与比对的帧：0（恒等帧）+ 9（弹跳峰值 & 摇摆峰值） */
    private static final int[] FRAMES = { 0, 9 };
    /** 弹跳幅度（世界像素）；150 → 屏幕上 40px，肉眼与像素都看得出来 */
    private static final double AMPLITUDE = 150d;
    /** 摇摆角度（度）：绕脚底 6°，质心水平位移约 12px，足够区分"绕脚底"与"绕中心" */
    private static final double SWAY_ANGLE = 6d;
    private static final double SWAY_PERIOD_FRAMES = 36d;

    /** 设计画布尺寸（后端常量，见 RenderOfImage.PLOT_SCENE_SCALE 附近的说明） */
    private static final double DESIGN_WIDTH = 1920d;
    private static final double DESIGN_HEIGHT = 1080d;
    /** 场景画布 → 设计画布的 0.8 缩放与 (192,108) 偏移 */
    private static final double SCENE_SCALE = 0.8d;
    private static final double SCENE_OFFSET_X = 192d;
    private static final double SCENE_OFFSET_Y = 108d;

    @Test
    @DisplayName("导出成片帧 + 浏览器侧需要的几何/素材")
    void exportFramesAndManifest(@TempDir Path temp) throws Exception {
        Path out = Path.of(System.getProperty("user.dir")).resolve("target").resolve("animation-acceptance");
        Path backend = out.resolve("backend");
        Files.createDirectories(backend);

        BufferedImage source = probeImage();
        CharacterVisual chara = character(source);
        Record record = record(chara);

        // 1) 真的导出一条 mp4，再解帧：验收对象是"成片"，不是内部中间态
        String videoPath = temp.resolve("video.mp4").toString();
        RenderOfVideo.exportRecordVideoStreaming(record, true, WIDTH, HEIGHT, videoPath, FPS,
                RenderOfVideo.LAYER_FULL, null);
        Path allFrames = temp.resolve("frames");
        Files.createDirectories(allFrames);
        extractFrames(videoPath, allFrames);
        selectFrames(allFrames, backend);

        // 2) 立绘在输出图上的**未变换**矩形：与 RenderOfImage.renderSingleCharacter 用同一组 getter
        BufferedImage scaled = SpriteImageCache.scaled(source, chara.getRenderScale());
        int baseW = scaled.getWidth();
        int baseH = scaled.getHeight();
        double k = (double) WIDTH / DESIGN_WIDTH;
        Map<String, Object> outRect = new LinkedHashMap<>();
        outRect.put("x", (SCENE_OFFSET_X + SCENE_SCALE * chara.getPosX()) * k);
        outRect.put("y", (SCENE_OFFSET_Y + SCENE_SCALE * chara.getPosY()) * k);
        outRect.put("w", SCENE_SCALE * baseW * k);
        outRect.put("h", SCENE_SCALE * baseH * k);

        // 3) 素材 + 清单
        ImageIO.write(source, "png", out.resolve("probe.png").toFile());

        Map<String, Object> sprite = new LinkedHashMap<>();
        sprite.put("image", "probe.png");
        sprite.put("base", Map.of("w", baseW, "h", baseH));
        sprite.put("out", outRect);
        sprite.put("anchor", Map.of("x", RecordAnimation.CHARACTER_ANCHOR_X, "y", RecordAnimation.CHARACTER_ANCHOR_Y));

        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("output", Map.of("width", WIDTH, "height", HEIGHT));
        manifest.put("frameRate", FPS);
        manifest.put("frames", FRAMES);
        manifest.put("sprite", sprite);
        manifest.put("anim", chara.getAnim());
        new ObjectMapper().writerWithDefaultPrettyPrinter()
                .writeValue(out.resolve("manifest.json").toFile(), manifest);

        // 4) 自检：解出来的帧数够覆盖峰值帧，且帧尺寸就是输出尺寸（浏览器截图要同尺寸比）
        assertEquals(FRAMES.length, Files.list(backend).count(), "参与比对的帧应只有 " + FRAMES.length + " 张");
        BufferedImage peak = ImageIO.read(backend.resolve("frame-009.png").toFile());
        assertEquals(WIDTH, peak.getWidth(), "成片帧宽应是输出宽");
        assertEquals(HEIGHT, peak.getHeight(), "成片帧高应是输出高");

        System.out.printf("[截帧验收] 素材已导出：%s（立绘 %dx%d 世界像素 → %.1fx%.1f 输出像素）%n",
                out, baseW, baseH, outRect.get("w"), outRect.get("h"));
    }

    /* ==================== 记录构造 ==================== */

    private static CharacterVisual character(BufferedImage source) throws IOException {
        MyCharacter character = MyCharacter.builder()
                .characterID("c-acceptance")
                .characterName("截帧角色")
                .height(171)
                .faction("测试")
                .build();
        Portrait portrait = Portrait.builder("")
                .portraitID("p-acceptance")
                .characterID("c-acceptance")
                .imagePath("")
                .portName("截帧立绘")
                .facePosition(0, 0)
                .length(183)
                .image(source)
                .build();
        return CharacterVisual.builder(character, portrait)
                .adjustment(0, 0)
                .scale(1.0f)
                .bright()
                .anim(animation())
                .build();
    }

    private static Record record(CharacterVisual chara) {
        return new Record.Builder()
                .uuid("acceptance")
                .dialogue(Dialogue.builder().text("").speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .addCharacter(chara)
                .isDirty(true)
                .build();
    }

    /**
     * 两条 clip 同时挂在一个立绘上：弹跳（y + scale）+ 摇摆（rotate）。
     *
     * <p>为什么必须是"位移 + 旋转"一起验：纯位移对锚点不敏感（`transform-origin` 写错也看不出来），
     * 而绕脚底转 6° 与绕中心转 6°，质心水平位移差一个数量级——这正是最容易写错的一处。
     */
    private static SpriteAnimation animation() {
        AnimationClip bounce = new AnimationClip();
        bounce.setId("bounce-acceptance");
        bounce.setKind("preset");
        bounce.setPreset("bounce");
        bounce.setDurationFrames(180);
        bounce.setLoop("loop");
        bounce.setParams(Map.of("amplitude", AMPLITUDE, "periodFrames", 18, "iterations", 0));

        AnimationClip sway = new AnimationClip();
        sway.setId("sway-acceptance");
        sway.setKind("preset");
        sway.setPreset("sway");
        sway.setDurationFrames(180);
        sway.setLoop("loop");
        sway.setParams(Map.of("angle", SWAY_ANGLE, "periodFrames", SWAY_PERIOD_FRAMES));

        SpriteAnimation anim = new SpriteAnimation();
        anim.setVersion(1);
        anim.setTimebase(new SpriteAnimation.Timebase("frame", FPS));
        anim.setClips(List.of(bounce, sway));
        return anim;
    }

    /** 透明底 + 非对称红块：位移/旋转都能从质心读出来 */
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

    /* ==================== 解帧 ==================== */

    /**
     * 从解出来的整段序列里挑出参与比对的帧，按 {@code frame-<帧号>.png} 存。
     *
     * <p>ffmpeg 的 `f_%04d.png` 是**从 1 开始**的序号，所以第 N 帧 = `f_(N+1)`。
     */
    private static void selectFrames(Path allFrames, Path backend) throws IOException {
        long count = Files.list(allFrames).count();
        int last = FRAMES[FRAMES.length - 1];
        assertTrue(count > last, "解出来的帧数不够覆盖第 " + last + " 帧（实际 " + count + " 帧）");
        for (int index : FRAMES) {
            Path source = allFrames.resolve(String.format("f_%04d.png", index + 1));
            Files.copy(source, backend.resolve(String.format("frame-%03d.png", index)),
                    StandardCopyOption.REPLACE_EXISTING);
        }
        // 整段序列只是中间产物，别留下几十张图让验收目录难读
        try (var paths = Files.list(allFrames)) {
            for (Path path : paths.toList()) {
                Files.deleteIfExists(path);
            }
        }
        Files.deleteIfExists(allFrames);
    }

    /** 用项目自带的 ffmpeg 把视频解成 PNG 序列（第 N 帧 = f_%04d 的 N+1） */
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
}
