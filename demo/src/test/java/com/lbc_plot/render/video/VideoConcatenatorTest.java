package com.lbc_plot.render.video;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.lbc_plot.common.util.FFmpegPathResolver;

/**
 * 视频连接（阶段2「连接无声视频」）的回归测试。
 *
 * <p>覆盖四个真实发生过的缺陷，以及连接前校验的行为：
 *
 * <ol>
 *   <li><b>导出卡死在「连接无声视频」</b>：原实现 {@code process.waitFor()} 却从不读取
 *       ffmpeg 的 stdout/stderr。ffmpeg 把每个输入的打开信息写到 stderr（每个片段约 89 字节），
 *       写满 Windows 匿名管道缓冲后双方互等，进度条永远不动。
 *       这里用足量片段 + 超时断言守住它：一旦回归，测试会失败而不是把构建挂住。</li>
 *   <li><b>片段被静默跳过</b>：concat 解复用器遇到打不开的片段只打印
 *       {@code Impossible to open '...'} 然后跳过，<b>退出码仍然是 0</b>。
 *       以前会产出「导出成功但少一段」的成片。</li>
 *   <li><b>参数不一致产出错乱成片</b>：{@code -c copy} 会把后续片段硬塞进第一段的参数里。</li>
 *   <li><b>坏文件被当成好文件</b>：缺失 / 损坏 / 垃圾数据的片段必须在连接前就被拦下。</li>
 * </ol>
 *
 * <p>测试夹具（小 mp4）在运行时用项目自带的 ffmpeg 现场生成，写进 {@link TempDir}，
 * 不往仓库里塞二进制文件（{@code *.mp4} 本来也被 .gitignore 忽略）。
 */
@DisplayName("VideoConcatenator 连接无声视频")
class VideoConcatenatorTest {

    /**
     * 管道死锁回归用的片段数。
     *
     * <p><b>这个数字不能随便调小。</b>管道死锁是「stderr 写满缓冲」引起的，属于竞态：
     * 实测 180 / 1000 条会卡死，而 400 / 700 条反而能侥幸跑完。片段太少时这个用例会
     * 时灵时不灵，等于没有护栏（曾用 180 条写过一个"假通过"的版本）。
     *
     * <p>2000 条时 ffmpeg 的 stderr 约 180KB，远大于任何常见管道缓冲（Windows 匿名管道
     * 通常 4KB~64KB），因此一旦回归成"不读管道"，必然卡死。
     */
    private static final int PIPE_STRESS_CLIP_COUNT = 2000;

    /** 现场生成的基准片段（同为 h264/yuv420p/320x240/30fps） */
    private static final List<Path> BASE_CLIPS = new ArrayList<>();

    @BeforeAll
    static void generateBaseClips(@TempDir Path sharedTemp) throws Exception {
        // 6 个不同内容的片段，参数完全一致（颜色不影响编码参数），列表里循环复用即可铺到上千条
        String[] colors = { "black", "white", "red", "green", "blue", "gray" };
        for (int i = 0; i < colors.length; i++) {
            Path clip = sharedTemp.resolve("base_" + i + ".mp4");
            generateClip(clip, colors[i], 320, 240, 30);
            BASE_CLIPS.add(clip);
        }
    }

    // ---------------- 1. 管道死锁回归 ----------------

    @Test
    @DisplayName("连接大量片段不会卡死（读空 ffmpeg 管道的回归护栏）")
    void manyClipsDoNotDeadlock(@TempDir Path temp) throws Exception {
        List<String> clips = repeatClips(PIPE_STRESS_CLIP_COUNT);
        Path output = temp.resolve("silent_stress.mp4");

        // 原实现下这里会永久阻塞；用超时断言把「卡死」变成「测试失败」
        assertTimeoutPreemptively(Duration.ofMinutes(5),
                () -> VideoConcatenator.concatenateVideos(clips, output.toString()),
                "连接 " + PIPE_STRESS_CLIP_COUNT + " 个片段时卡死 —— ffmpeg 的 stdout/stderr 是否又被漏读了？");

        assertTrue(Files.exists(output), "应产出无声视频");
        assertTrue(Files.size(output) > 0, "产出的无声视频不应为空");
    }

    // ---------------- 2. 连接前校验：拦下坏输入 ----------------

    @Test
    @DisplayName("片段参数不一致时明确失败，而不是产出错乱成片")
    void mismatchedParametersAreRejected(@TempDir Path temp) throws Exception {
        Path odd = temp.resolve("odd.mp4");
        // 分辨率与帧率都不同
        generateClip(odd, "red", 160, 120, 25);

        List<String> clips = List.of(BASE_CLIPS.get(0).toString(), odd.toString());
        IOException error = assertThrows(IOException.class,
                () -> VideoConcatenator.concatenateVideos(clips, temp.resolve("out.mp4").toString()));

        assertTrue(error.getMessage().contains("参数不一致"),
                "错误信息应指出参数不一致，实际: " + error.getMessage());
        assertTrue(error.getMessage().contains("320,240") && error.getMessage().contains("160,120"),
                "错误信息应带上两边的实际参数，实际: " + error.getMessage());
    }

    @Test
    @DisplayName("片段缺失时明确指出是第几个片段")
    void missingClipIsRejected(@TempDir Path temp) {
        Path missing = temp.resolve("never-generated.mp4");
        List<String> clips = List.of(BASE_CLIPS.get(0).toString(), missing.toString());

        IOException error = assertThrows(IOException.class,
                () -> VideoConcatenator.concatenateVideos(clips, temp.resolve("out.mp4").toString()));

        assertTrue(error.getMessage().contains("不存在"), "错误信息应说明片段不存在: " + error.getMessage());
        assertTrue(error.getMessage().contains("第 2/2"), "错误信息应指出是第几个片段: " + error.getMessage());
    }

    @Test
    @DisplayName("片段是垃圾数据时在连接前就被拦下")
    void corruptClipIsRejected(@TempDir Path temp) throws Exception {
        Path corrupt = temp.resolve("corrupt.mp4");
        Files.writeString(corrupt, "this is definitely not a video");

        List<String> clips = List.of(BASE_CLIPS.get(0).toString(), corrupt.toString());
        IOException error = assertThrows(IOException.class,
                () -> VideoConcatenator.concatenateVideos(clips, temp.resolve("out.mp4").toString()));

        assertTrue(error.getMessage().contains("无法解析"),
                "错误信息应说明片段无法解析: " + error.getMessage());
    }

    @Test
    @DisplayName("输出失败时不留残缺文件")
    void failedConcatLeavesNoPartialOutput(@TempDir Path temp) {
        Path output = temp.resolve("should_not_exist.mp4");
        List<String> clips = List.of(BASE_CLIPS.get(0).toString(), temp.resolve("nope.mp4").toString());

        assertThrows(IOException.class,
                () -> VideoConcatenator.concatenateVideos(clips, output.toString()));
        assertTrue(!Files.exists(output), "失败后不应留下残缺输出文件");
    }

    // ---------------- 3. 边界 ----------------

    @Test
    @DisplayName("空列表直接报错")
    void emptyInputIsRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> VideoConcatenator.concatenateVideos(List.of(), "unused.mp4"));
    }

    @Test
    @DisplayName("单个片段也能正常连接")
    void singleClipWorks(@TempDir Path temp) throws Exception {
        Path output = temp.resolve("single.mp4");
        VideoConcatenator.concatenateVideos(List.of(BASE_CLIPS.get(0).toString()), output.toString());
        assertTrue(Files.size(output) > 0, "单片段连接也应产出非空文件");
    }

    @Test
    @DisplayName("中文路径下的片段也能连接（列表必须按 UTF-8 写）")
    void chinesePathsWork(@TempDir Path temp) throws Exception {
        // 用户的导出目录确实会出现中文（日志里见过「章节-场景」这类目录名）。
        // concat 列表按 UTF-8 解释：若用 GBK 写，JavaCV 自带的 ffmpeg 6.0 会直接访问违例崩溃。
        Path chineseDir = temp.resolve("章节一 第一幕");
        Files.createDirectories(chineseDir);

        Path clipA = chineseDir.resolve("片段一.mp4");
        Path clipB = chineseDir.resolve("片段二.mp4");
        generateClip(clipA, "black", 320, 240, 30);
        generateClip(clipB, "white", 320, 240, 30);

        Path output = chineseDir.resolve("合成结果.mp4");
        VideoConcatenator.concatenateVideos(
                List.of(clipA.toString(), clipB.toString()), output.toString());

        assertTrue(Files.exists(output), "中文路径下应产出无声视频");
        assertTrue(Files.size(output) > 0, "中文路径下产出的文件不应为空");
        // 两段各 2 秒，拼起来应明显大于单段
        assertTrue(Files.size(output) > Files.size(clipA),
                "两段拼接结果应大于单段");
    }

    // ---------------- 4. 边界（参数签名缓存的行为见 VideoConcatenatorCacheTest） ----------------

    /** 把基准片段按顺序循环铺满 count 条，模拟真实的一段接一段 */
    private static List<String> repeatClips(int count) {
        List<String> clips = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            clips.add(BASE_CLIPS.get(i % BASE_CLIPS.size()).toString());
        }
        return clips;
    }

    /**
     * 用项目自带的 ffmpeg 生成一个纯色测试片段。
     *
     * <p>刻意不用 libx264：JavaCV 打包的 ffmpeg 不含它，只有 libopenh264。
     * 两条输出流都必须读走，否则这里自己就会踩到管道写满的老问题。
     */
    private static void generateClip(Path target, String color, int width, int height, int fps)
            throws IOException, InterruptedException {
        List<String> command = List.of(
                FFmpegPathResolver.getFFmpegPath(),
                "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi",
                "-i", "color=c=" + color + ":s=" + width + "x" + height + ":r=" + fps + ":d=2",
                "-c:v", "libopenh264",
                "-pix_fmt", "yuv420p",
                target.toAbsolutePath().toString());

        Process process = new ProcessBuilder(command).start();
        Thread outThread = new Thread(() -> drainQuietly(process.getInputStream()));
        Thread errThread = new Thread(() -> drainQuietly(process.getErrorStream()));
        outThread.setDaemon(true);
        errThread.setDaemon(true);
        outThread.start();
        errThread.start();

        boolean exited = process.waitFor(60, TimeUnit.SECONDS);
        if (!exited) {
            process.destroyForcibly();
            throw new IOException("生成测试片段超时: " + target);
        }
        outThread.join(5000);
        errThread.join(5000);

        if (process.exitValue() != 0 || !Files.exists(target) || Files.size(target) == 0) {
            throw new IOException("生成测试片段失败(exit=" + process.exitValue() + "): " + target
                    + "；该测试依赖 JavaCV 自带的 ffmpeg");
        }
    }

    private static void drainQuietly(java.io.InputStream stream) {
        try (java.io.InputStream in = stream) {
            byte[] buffer = new byte[4096];
            while (in.read(buffer) != -1) {
                // 丢弃
            }
        } catch (IOException ignored) {
            // 进程收尾时流可能已关闭
        }
    }
}
