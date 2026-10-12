package com.lbc_plot.common.util.io;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.common.util.FFmpegPathResolver;

/**
 * 启动时初始化 JavaCV / JavaCPP 的原生库（FFmpeg），并把失败原因原样暴露出来。
 *
 * <h2>为什么需要这个类</h2>
 * WebP 立绘在 Java 21 上没有 ImageIO 解码器，只能走 {@link WebpImageDecoder} 的
 * FFmpeg 兜底；而 FFmpeg 兜底依赖 JavaCPP 的原生库。原生库加载失败时，
 * {@code avutil} / {@code FFmpegFrameGrabber} 的<b>静态初始化</b>会失败，JVM 随后
 * 把“初始化失败”这个状态缓存下来，之后每次访问都只报
 * {@code NoClassDefFoundError: Could not initialize class org.bytedeco...}，
 * 真正的原因（UnsatisfiedLinkError / 无法解包 / 路径不可写）被彻底掩盖 ——
 * 表现就是立绘全变红色“加载失败”占位图，日志里却看不到根因。
 *
 * <p>因此在 Spring 启动之前主动做两件事：
 * <ol>
 *   <li><b>固定原生库缓存目录</b>：JavaCPP 默认把原生库释放到 JVM 临时目录下的
 *       {@code javacpp/} 里，并把 {@code ffmpeg.exe} / {@code ffprobe.exe} 一起放在同一层。
 *       临时目录被系统清理策略清掉一半时，DLL 与其依赖就会分家。这里优先使用
 *       {@code %APPDATA%\limbus-company-plot-video-generator\.javacpp}（与用户数据库同级，
 *       不会被临时目录清理波及）；不可写时保持 JavaCPP 默认行为。</li>
 *   <li><b>预热并记录完整异常链</b>：一次性把 FFmpeg 原生库加载起来，成功写 INFO，
 *       失败写 ERROR 并把 {@code cause} 链逐层打印。启动日志里就能直接看到
 *       “原生库不可用”，而不是等到渲染时才看到一堆无头无尾的 NoClassDefFoundError。</li>
 * </ol>
 *
 * <p>这里刻意<b>不抛异常</b>：原生库不可用时视频导出还有外部 ffmpeg 兜底，
 * 不应该让整个应用起不来。
 */
public final class NativeLibraryBootstrap {

    private static final Logger logger = LoggerFactory.getLogger(NativeLibraryBootstrap.class);

    /** JavaCPP 读取的缓存目录系统属性（设置它等于覆盖 JavaCPP 的默认临时目录） */
    private static final String CACHEDIR_PROPERTY = "org.bytedeco.javacpp.cachedir";

    /**
     * 缓存目录名，放在数据根目录<b>同级</b>（{@code %LOCALAPPDATA%} 一类），
     * 而不是数据根目录内部。
     *
     * <p>刻意避开两个位置：
     * <ul>
     *   <li>JVM 临时目录（JavaCPP 默认）：会被系统清理策略删除，删掉一半就会出现
     *       “DLL 还在、依赖没了”的加载失败；</li>
     *   <li>数据根目录内部（{@code %APPDATA%}）：整个目录可能被漫游配置文件同步、
     *       或随“卸载时删除用户数据”一起清掉，而原生库属于可再生成的缓存，
     *       不该混进用户数据里。</li>
     * </ul>
     */
    private static final String CACHE_DIR_NAME = "limbus-plot-video-generator-javacpp";

    /** 记录最近一次预热的失败原因，供诊断/报错信息复用 */
    private static volatile String lastFailure;

    private NativeLibraryBootstrap() {
    }

    /**
     * 在 Spring 启动前调用：固定缓存目录 + 预热 FFmpeg 原生库。
     *
     * @return 原生库是否可用
     */
    public static boolean warmUp() {
        prepareCacheDir();
        logWhereNativesComeFrom();
        try (org.bytedeco.javacv.FFmpegFrameGrabber grabber =
                     new org.bytedeco.javacv.FFmpegFrameGrabber(new File("native-warmup-probe.webp"))) {
            // start() 会真正去打开文件，这里用一个不存在的路径：
            // 抛 FFmpegFrameGrabber.Exception 说明原生库已经加载成功，
            // 抛 NoClassDefFoundError / UnsatisfiedLinkError 才是原生库不可用。
            grabber.start();
            logger.warn("原生库预热探测意外成功（探测文件本不应存在）");
            logFfmpegBinaries();
            return true;
        } catch (org.bytedeco.javacv.FFmpegFrameGrabber.Exception e) {
            // 期望路径：原生库已就绪，只是探测文件不存在
            logger.info("FFmpeg 原生库预热完成（JavaCV 可用）");
            logFfmpegBinaries();
            return true;
        } catch (Throwable t) {
            recordFailure(t);
            return false;
        }
    }

    /** 记录失败：完整 cause 链写进日志，便于一眼定位（原生库失败最常见的形态就是链被吞掉） */
    private static void recordFailure(Throwable t) {
        lastFailure = describeFailure(t);
        logger.error("FFmpeg 原生库不可用，WebP 立绘将无法解码（会显示为红色“加载失败”占位图）。"
                + "原因: {}", lastFailure);
        for (Throwable cause = t.getCause(); cause != null; cause = cause.getCause()) {
            logger.error("  caused by: {}", cause);
        }
        logger.error("JavaCPP 缓存目录: {}", System.getProperty(CACHEDIR_PROPERTY, "(默认临时目录)"));
        logWhereNativesComeFrom();
    }

    /**
     * 把「原生库是从哪儿加载的」写进日志。
     *
     * <p>这是排障时最容易搞错的一点：安装版走的是 Spring Boot 可执行 jar，原生 jar 嵌在
     * {@code BOOT-INF/lib/} 里（{@code jar:nested:...!/BOOT-INF/lib/xxx.jar!/}），
     * JavaCPP 必须先把 DLL 释放到缓存目录才能 {@code System.load}；
     * 而 {@code mvn spring-boot:run} / IDE 用的是扁平 classpath，磁盘上有真实文件，直接就能加载。
     * 两者行为完全不同，所以日志里必须出现实际形态，否则"本地明明是好的"会一直误导排查方向。
     */
    private static void logWhereNativesComeFrom() {
        try {
            java.security.CodeSource source =
                    org.bytedeco.javacpp.Loader.class.getProtectionDomain().getCodeSource();
            String location = source == null ? "(未知)" : String.valueOf(source.getLocation());
            boolean nested = location.contains("BOOT-INF/lib/") || location.contains("!/");
            logger.info("JavaCV 原生库来路: {}{}", location,
                    nested ? "（Spring Boot 嵌套 jar：需要 JavaCPP 释放到缓存目录）" : "（扁平 classpath：磁盘真实文件）");
        } catch (Throwable t) {
            logger.debug("无法判定 JavaCV 原生库来路: {}", t.toString());
        }
    }

    /** 最近一次预热的失败原因；成功或尚未预热时为 {@code null} */
    public static String getLastFailure() {
        return lastFailure;
    }

    /**
     * 把 JavaCPP 的缓存目录固定到应用专属的本地目录（见 {@link #CACHE_DIR_NAME}）。
     *
     * <p>只有当目标目录确实可写时才设置属性；否则保留 JavaCPP 自己的回退逻辑
     * （它会依次尝试 {@code java.io.tmpdir} 等位置），避免因为一个不可写路径
     * 反而把原本可用的环境弄坏。
     */
    private static void prepareCacheDir() {
        String configured = System.getProperty(CACHEDIR_PROPERTY);
        if (configured != null && !configured.isBlank()) {
            logger.info("JavaCPP 缓存目录已由外部指定: {}", configured);
            return;
        }
        File preferred = resolveCacheDir();
        if (!ensureWritable(preferred)) {
            logger.warn("JavaCPP 缓存目录不可写，改用默认临时目录: {}", preferred.getAbsolutePath());
            return;
        }
        System.setProperty(CACHEDIR_PROPERTY, preferred.getAbsolutePath());
        logger.info("JavaCPP 缓存目录: {}", preferred.getAbsolutePath());
    }

    /**
     * 原生库缓存目录：优先放在数据根目录同级的应用专属目录里，
     * 拿不到可用的本地目录时退回 JVM 临时目录（即 JavaCPP 的默认行为）。
     */
    static File resolveCacheDir() {
        File localAppData = localAppDataDir();
        if (localAppData != null) {
            return new File(localAppData, CACHE_DIR_NAME);
        }
        return new File(System.getProperty("java.io.tmpdir", "."), CACHE_DIR_NAME);
    }

    /** {@code %LOCALAPPDATA%}；非 Windows 或未设置时返回 null */
    private static File localAppDataDir() {
        String value = System.getenv("LOCALAPPDATA");
        if (value == null || value.isBlank()) {
            return null;
        }
        File dir = new File(value);
        return dir.isDirectory() ? dir : null;
    }

    /** 目录存在且可写时返回 true；能创建出来也算成功 */
    private static boolean ensureWritable(File dir) {
        try {
            if (!dir.isDirectory() && !dir.mkdirs() && !dir.isDirectory()) {
                return false;
            }
            File probe = new File(dir, ".write-probe");
            try (java.io.FileOutputStream out = new java.io.FileOutputStream(probe)) {
                out.write(0);
            }
            if (!probe.delete()) {
                probe.deleteOnExit();
            }
            return true;
        } catch (IOException | SecurityException e) {
            logger.debug("缓存目录不可写: {} ({})", dir, e.toString());
            return false;
        }
    }

    /**
     * 记录 JavaCV 释放出来的 ffmpeg / ffprobe 真实路径。
     *
     * <p>这两个可执行文件与 DLL 落在同一层目录，路径写进日志后排障时可以直接去
     * 核对文件是否齐全（被安全软件隔离是常见原因）。
     */
    private static void logFfmpegBinaries() {
        List<String> resolved = new ArrayList<>(2);
        try {
            resolved.add("ffmpeg=" + FFmpegPathResolver.getFFmpegPath());
        } catch (Throwable t) {
            resolved.add("ffmpeg=不可用(" + t + ")");
        }
        try {
            resolved.add("ffprobe=" + FFmpegPathResolver.getFFprobePath());
        } catch (Throwable t) {
            resolved.add("ffprobe=不可用(" + t + ")");
        }
        logger.info("FFmpeg 可执行文件: {}", String.join(", ", resolved));
    }

    /** 拼出便于搜索的失败描述：异常类型 + 消息 + 首个 cause */
    private static String describeFailure(Throwable t) {
        StringBuilder sb = new StringBuilder();
        sb.append(t.getClass().getName());
        if (t.getMessage() != null) {
            sb.append(": ").append(t.getMessage());
        }
        Throwable root = t;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        if (root != t) {
            sb.append(" <- ").append(root.getClass().getName());
            if (root.getMessage() != null) {
                sb.append(": ").append(root.getMessage());
            }
        }
        return sb.toString();
    }
}
