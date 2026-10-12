package com.lbc_plot.common.util.io;

import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.common.util.FFmpegPathResolver;

/**
 * 安装包自检：验证「打包后的 jar 里能不能解出 WebP 立绘」。
 *
 * <h2>为什么需要它</h2>
 * WebP 立绘在 Java 21 上没有 ImageIO 解码器，只能走 {@link WebpImageDecoder} 的
 * FFmpeg（JavaCV / JavaCPP）兜底。原生库加载失败时渲染管线拿不到像素，界面上就是一片
 * <b>红色“加载失败”方块</b>，而日志里只剩
 * {@code NoClassDefFoundError: Could not initialize class org.bytedeco.ffmpeg.global.avutil}
 * —— 真正的根因（原生库没能从嵌套 jar 中释放出来，JavaCPP 退化成
 * {@code System.loadLibrary("jniavutil")} 又找不到它）被 JVM 缓存掉了。
 *
 * <p>这类故障有个恶劣的性质：<b>本地开发环境永远复现不了</b>。
 * {@code mvn spring-boot:run} / IDE 用的是扁平 classpath，原生 jar 是磁盘上的真实文件，
 * JavaCPP 直接就能加载；只有 {@code java -jar}（Spring Boot 嵌套 jar）才会暴露问题。
 * 所以自检必须在<b>打好的 jar</b> 上跑：
 *
 * <pre>{@code
 * java -jar demo-0.2.3-SNAPSHOT.jar --self-check=webp
 * }</pre>
 *
 * <p>由 {@code MainApplication} 在处理 {@code --self-check=webp} 时调用：不启动 Spring、
 * 不连数据库、不碰用户数据目录，只做三件事——
 * <ol>
 *   <li>预热 FFmpeg 原生库，把完整异常链写进日志（成功也留一行 INFO）；</li>
 *   <li>解一张内联的最小 WebP（8x4，右下 4x2 为 {@code #3366CC} 不透明，其余透明），
 *       同时验证「能解码」和「alpha 与通道顺序都对」；</li>
 *   <li>打印 ffmpeg / ffprobe 的真实路径与 JavaCPP 缓存目录，便于用户自查。</li>
 * </ol>
 *
 * <p>退出码：{@code 0} 通过；{@code 1} 原生库不可用或解码失败；{@code 2} 目标不认识。
 * 输出里那行 {@code [SELF-CHECK] PASS ...} / {@code [SELF-CHECK] FAIL ...} 是给脚本
 * grep 用的稳定标记，不要改格式（{@code build-package.bat} 与文档都依赖它）。
 */
public final class WebpSelfCheck {

    private static final Logger logger = LoggerFactory.getLogger(WebpSelfCheck.class);

    /** 通过标记（脚本 grep 用，保持稳定） */
    static final String PASS_MARKER = "[SELF-CHECK] PASS";

    /** 失败标记（脚本 grep 用，保持稳定） */
    static final String FAIL_MARKER = "[SELF-CHECK] FAIL";

    /** 过程日志前缀：诊断信息用日志，结论用 stdout，两者不要混 */
    private static final String LOG_PREFIX = "[SELF-CHECK]";

    /**
     * 内联的自检样本：8x4 无损 WebP，40 字节。
     *
     * <p>布局：左上 4x2 全透明，右下 4x2 为不透明的 {@code #3366CC}。
     * 刻意做成左右不对称——只验颜色的话，通道顺序或整行镜像错了也可能碰巧通过。
     *
     * <p>由 {@code PIL.Image.save(format="WEBP", lossless=True)} 生成（生成脚本见
     * {@code _diagnose-webp/probe/make-sample.py}）。内联而不是随包一张立绘：
     * 自检要在任意用户机器上直接跑，跟素材目录里有什么无关。
     */
    private static final String SAMPLE_WEBP_BASE64 =
            "UklGRiAAAABXRUJQVlA4TBQAAAAvB8AAEA8wZjMzzPMf8Bj4iP4HAw==";

    private static final int SAMPLE_WIDTH = 8;
    private static final int SAMPLE_HEIGHT = 4;

    /** 样本里那块不透明像素的颜色（也是通道顺序的断言值） */
    private static final int SOLID_RGB = 0x3366CC;

    /** 不透明像素的坐标：右下区域取一个点 */
    private static final int SOLID_X = 7;
    private static final int SOLID_Y = 3;

    /** 透明像素的坐标：左上区域取一个点 */
    private static final int CLEAR_X = 0;
    private static final int CLEAR_Y = 0;

    private WebpSelfCheck() {
    }

    /**
     * 执行自检。
     *
     * @param target 自检目标，目前只支持 {@code webp}
     * @return 进程退出码（0 通过，1 失败，2 目标不支持）
     */
    public static int run(String target) {
        if (target == null || !"webp".equalsIgnoreCase(target.trim())) {
            logger.error("{} 不支持的自检目标: {}（目前只支持 webp）", FAIL_MARKER, target);
            System.out.println(FAIL_MARKER + " unsupported-target " + target);
            return 2;
        }
        logger.info("{} 开始安装包自检：用 FFmpeg 解码 WebP（不启动 Spring、不访问数据库）", LOG_PREFIX);

        // 1) 原生库预热：失败时这里会把完整 cause 链写进日志，这是排障最关键的一步
        boolean nativesReady = NativeLibraryBootstrap.warmUp();
        String cacheDir = System.getProperty("org.bytedeco.javacpp.cachedir", "(默认临时目录)");
        logger.info("{} JavaCPP 缓存目录: {}", LOG_PREFIX, cacheDir);
        logFfmpegBinaries();
        if (!nativesReady) {
            String reason = NativeLibraryBootstrap.getLastFailure();
            logger.error("{} FFmpeg 原生库不可用，WebP 立绘会显示为红色“加载失败”占位图。原因: {}",
                    FAIL_MARKER, reason == null ? "(未记录)" : reason);
            System.out.println(FAIL_MARKER + " native-library-unavailable");
            return 1;
        }

        // 2) 真正解一张 WebP：这才是渲染管线走的路径
        Path sample = null;
        try {
            sample = writeSampleWebp();
            if (!WebpImageDecoder.isWebp(sample.toFile())) {
                logger.error("{} 内联样本的 RIFF/WEBP 头不合法，自检样本本身有问题", FAIL_MARKER);
                System.out.println(FAIL_MARKER + " sample-not-webp");
                return 1;
            }
            BufferedImage image = WebpImageDecoder.decodeWithFfmpeg(sample.toFile());
            if (image == null) {
                logger.error("{} WebP 解码失败: {}", FAIL_MARKER, WebpImageDecoder.getLastFailure());
                System.out.println(FAIL_MARKER + " webp-decode " + WebpImageDecoder.getLastFailure());
                return 1;
            }
            String problem = verifyPixels(image);
            if (problem != null) {
                logger.error("{} WebP 解码结果不正确: {}", FAIL_MARKER, problem);
                System.out.println(FAIL_MARKER + " " + problem);
                return 1;
            }
            logger.info("{} WebP 解码正常: {}x{}，alpha 与通道顺序均正确",
                    LOG_PREFIX, image.getWidth(), image.getHeight());
            System.out.println(PASS_MARKER + " webp " + image.getWidth() + "x" + image.getHeight()
                    + " cacheDir=" + cacheDir);
            return 0;
        } catch (Throwable t) {
            // Error 也要兜住：这里就是要给用户一句能看懂的话，而不是一段栈
            logger.error("{} 自检自身出错", FAIL_MARKER, t);
            System.out.println(FAIL_MARKER + " " + t.getClass().getSimpleName() + ": " + t.getMessage());
            return 1;
        } finally {
            if (sample != null) {
                try {
                    Files.deleteIfExists(sample);
                } catch (Exception ignored) {
                    // 临时文件删不掉不影响自检结论
                }
            }
        }
    }

    /** 把内联样本写到临时文件：FFmpeg 需要可寻址的输入，不能喂 InputStream。 */
    private static Path writeSampleWebp() throws Exception {
        Path file = Files.createTempFile("lbc-selfcheck-", ".webp");
        Files.write(file, Base64.getDecoder().decode(SAMPLE_WEBP_BASE64));
        return file;
    }

    /**
     * 校验解码结果的 alpha 与通道顺序。
     *
     * <p>锁的是真实踩过的那个坑：FFmpeg 以 BGRA 抓帧时，若把 BGRA 当成 ARGB 解读，
     * alpha=255 的不透明像素会变成“红色 + alpha≈0”，立绘看上去就是半透明红块。
     *
     * @return 有问题时返回原因描述；一切正常返回 {@code null}
     */
    private static String verifyPixels(BufferedImage image) {
        if (image.getWidth() != SAMPLE_WIDTH || image.getHeight() != SAMPLE_HEIGHT) {
            return "size-" + image.getWidth() + "x" + image.getHeight()
                    + "(expected " + SAMPLE_WIDTH + "x" + SAMPLE_HEIGHT + ")";
        }
        int clearAlpha = alphaAt(image, CLEAR_X, CLEAR_Y);
        if (clearAlpha != 0) {
            return "transparent-alpha-" + clearAlpha + "(expected 0)";
        }
        int solid = image.getRGB(SOLID_X, SOLID_Y);
        int solidAlpha = (solid >>> 24) & 0xFF;
        int solidRgb = solid & 0xFFFFFF;
        if (solidAlpha != 0xFF) {
            // 最典型的症状：BGRA 被当成 ARGB 读，alpha 掉到个位数
            return "opaque-alpha-" + solidAlpha + "(expected 255)";
        }
        if (solidRgb != SOLID_RGB) {
            return String.format(Locale.ROOT, "channel-order-%06X(expected %06X)", solidRgb, SOLID_RGB);
        }
        return null;
    }

    private static int alphaAt(BufferedImage image, int x, int y) {
        return (image.getRGB(x, y) >>> 24) & 0xFF;
    }

    private static void logFfmpegBinaries() {
        try {
            logger.info("{} ffmpeg: {}", LOG_PREFIX, FFmpegPathResolver.getFFmpegPath());
        } catch (Throwable t) {
            logger.warn("{} ffmpeg 路径不可用: {}", LOG_PREFIX, t.toString());
        }
        try {
            logger.info("{} ffprobe: {}", LOG_PREFIX, FFmpegPathResolver.getFFprobePath());
        } catch (Throwable t) {
            logger.warn("{} ffprobe 路径不可用: {}", LOG_PREFIX, t.toString());
        }
    }
}
