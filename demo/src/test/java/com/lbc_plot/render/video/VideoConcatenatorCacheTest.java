package com.lbc_plot.render.video;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.lbc_plot.common.util.FFmpegPathResolver;

/**
 * 参数签名缓存的行为测试。
 *
 * <p>单独一个类，是因为缓存在生产代码里是<b>进程内静态</b>的：和其它连接测试混在一起时，
 * 「冷缓存」的假设会被前面的用例悄悄预热掉，断言就变成看执行顺序碰运气。
 * 这里每个用例都自己生成片段，且只用本类生成的路径，所以探测次数是确定的。
 *
 * <p>覆盖三点：
 * <ol>
 *   <li>片段没变 → 第二次连接不再起 ffprobe 进程（缓存真正生效，这是省下大工程校验时间的关键）；</li>
 *   <li>mtime 变了 → 该片段会重新探测，不会被旧缓存盖住；</li>
 *   <li>文件内容被换掉 → 无论缓存怎么想，都必须报错而不是沿用旧签名。</li>
 * </ol>
 */
@DisplayName("VideoConcatenator 片段参数签名缓存")
class VideoConcatenatorCacheTest {

    /** 片段数：够多才有代表性，又不必像死锁回归那样压满管道 */
    private static final int CLIP_COUNT = 40;

    private List<String> clips;

    @BeforeEach
    void generateClips(@TempDir Path temp) throws Exception {
        clips = new ArrayList<>(CLIP_COUNT);
        // 用 4 个不同内容的片段循环铺满，路径各不相同
        for (int i = 0; i < 4; i++) {
            Path clip = temp.resolve("c" + i + ".mp4");
            generateClip(clip, new String[] { "black", "white", "red", "blue" }[i]);
            for (int k = 0; k < CLIP_COUNT / 4; k++) {
                clips.add(clip.toString());
            }
        }
    }

    @Test
    @DisplayName("片段未修改时第二次连接不再起 ffprobe")
    void unchangedClipsAreNotReprobed(@TempDir Path temp) throws Exception {
        VideoConcatenator.concatenateVideos(clips, temp.resolve("first.mp4").toString());
        assertTrue(VideoConcatenator.cachedSignatureCount() > 0, "探测后应写入签名缓存");

        VideoConcatenator.resetProbeInvocationCount();
        VideoConcatenator.concatenateVideos(clips, temp.resolve("second.mp4").toString());
        assertEquals(0L, VideoConcatenator.probeInvocationCount(),
                "片段未修改时不应重复探测（缓存未生效）");
    }

    @Test
    @DisplayName("片段 mtime 变化后会重新探测")
    void changedMtimeIsReprobed(@TempDir Path temp) throws Exception {
        VideoConcatenator.concatenateVideos(clips, temp.resolve("first.mp4").toString());

        // 只改第一个片段的 mtime。
        // 注意：该片段在列表里出现 CLIP_COUNT/4 次，而探测是按「列表中出现的位置」做的，
        // 所以失效后会被重探同样多次；其余 3 个片段仍应命中缓存。
        Path touched = Path.of(clips.get(0));
        touched.toFile().setLastModified(System.currentTimeMillis() + 10_000);

        VideoConcatenator.resetProbeInvocationCount();
        VideoConcatenator.concatenateVideos(clips, temp.resolve("second.mp4").toString());
        assertEquals(CLIP_COUNT / 4L, VideoConcatenator.probeInvocationCount(),
                "只有 mtime 变化的那个片段需要重新探测");
    }

    @Test
    @DisplayName("片段内容被换掉时必须报错，不能被缓存掩盖")
    void rewrittenClipIsStillRejected(@TempDir Path temp) throws Exception {
        // 先让这些片段被探测并写进缓存
        VideoConcatenator.concatenateVideos(clips, temp.resolve("first.mp4").toString());

        // 把其中一个片段的内容换成垃圾数据，并把 mtime 按回原值，
        // 模拟「文件被改写但时间戳看起来没变」这种缓存最容易骗过的情况
        Path victim = Path.of(clips.get(0));
        long originalMtime = victim.toFile().lastModified();
        Files.write(victim, "not a video anymore".getBytes(StandardCharsets.UTF_8));
        victim.toFile().setLastModified(originalMtime);

        IOException error = assertThrows(IOException.class,
                () -> VideoConcatenator.concatenateVideos(clips, temp.resolve("second.mp4").toString()),
                "片段已被破坏，必须报错而不是沿用缓存里的签名");
        // 具体由「列表级预检」还是「逐片段探测」拦下都可以，只要不是静默成功
        assertTrue(error.getMessage().contains("损坏")
                        || error.getMessage().contains("无法解析")
                        || error.getMessage().contains("参数不一致"),
                "应指出片段有问题，实际: " + error.getMessage());
    }

    /** 用项目自带的 ffmpeg 生成纯色片段（JavaCV 的 ffmpeg 不含 libx264，只有 libopenh264） */
    private static void generateClip(Path target, String color) throws IOException, InterruptedException {
        List<String> command = List.of(
                FFmpegPathResolver.getFFmpegPath(),
                "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi",
                "-i", "color=c=" + color + ":s=320x240:r=30:d=2",
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

        if (!process.waitFor(60, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IOException("生成测试片段超时: " + target);
        }
        outThread.join(5000);
        errThread.join(5000);

        if (process.exitValue() != 0 || !Files.exists(target) || Files.size(target) == 0) {
            throw new IOException("生成测试片段失败(exit=" + process.exitValue() + "): " + target);
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
