package com.lbc_plot.render.video;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.common.util.FFmpegPathResolver;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * 视频连接工具类 - 使用FFmpeg连接多个视频文件
 *
 * <p><b>必须消费 FFmpeg 的 stdout/stderr。</b>Java 的 {@link ProcessBuilder#start()} 默认给子进程
 * 接的是管道，而 Windows 匿名管道只有 4KB 缓冲。FFmpeg 在连接时会往 stderr 打印每个输入的打开信息
 * （{@code Auto-inserting h264_mp4toannexb bitstream filter}、{@code Stream #0:n} 等），
 * 180 个片段约 14KB —— 远超 4KB。父进程若只是 {@code process.waitFor()} 而没人读走 stderr：
 * FFmpeg 阻塞在写 stderr，父进程阻塞在等退出，双方互等，导出进度条永远停在「连接无声视频」。
 *
 * <p>这个问题曾经真实发生：日志里「开始连接 180 个视频文件」之后再也没有下一行，
 * 每次导出都只能强制结束进程。同项目内的 {@code VideoAudioMerger} 一直是正确写法。
 *
 * <p>因此本类：(1) 用后台线程读空 stdout/stderr；(2) 记录 stderr 便于排障；
 * (3) 加超时兜底，避免任何情况下再次无限期卡死；(4) 校验输出文件非空。
 *
 * <p>连接前还会做两级检查：先用<b>列表级体检</b>（ffprobe 直接读 concat 列表，
 * 一次进程过完所有片段，2000 个片段约 20ms）尽早抓出打不开/损坏的片段；
 * 再<b>逐片段比对参数</b>，精确定位第一个不一致的片段。
 *
 * <p>另外处理了 concat 的两个「静默坏成片」陷阱（两者退出码都是 0）：
 * <ul>
 *   <li><b>片段被跳过</b>：遇到打不开/无法解码的片段时只打印
 *       {@code Impossible to open '...'} 然后跳过它，进程正常退出 0。
 *       本类捕获这类输出并直接判定失败。</li>
 *   <li><b>参数不一致</b>：{@code -c copy} 会把后续片段硬塞进第一段的参数里，
 *       产出时间戳错乱、画面错位的坏文件。本类在连接前用 ffprobe 逐段比对
 *       （编码/宽/高/像素格式/帧率），指出第一个不一致的片段。
 *       注意：这个比对<b>不能</b>用「列表级探测」代替 —— concat 解复用器只暴露第一个流，
 *       后续片段参数不同时 ffprobe 照样报第一段的参数并正常退出（实测如此）。</li>
 * </ul>
 */
public class VideoConcatenator {
    private static final Logger logger = LoggerFactory.getLogger(VideoConcatenator.class);

    /** 失败时随异常一起抛出的 FFmpeg stderr 末尾行数 */
    private static final int ERROR_TAIL_LINES = 12;

    /** 看起来像错误原因的行（用于把真正的原因抛给前端，而不是 FFmpeg 的版本横幅） */
    private static final Pattern ERROR_HINT = Pattern.compile(
            "(?i)(error|invalid|could not|cannot|can not|no such file|not found|unsupported|not supported"
                    + "|failed|failure|unknown encoder|denied|unable)");

    /** FFmpeg 每次启动都会打印的版本/编译信息，不属于错误详情，也不值得逐行写进日志 */
    private static final Pattern FFMPEG_BANNER = Pattern.compile(
            "^(ffmpeg version| {2}built with| {2}configuration:| {2}libav| {2}libsw)");

    /**
     * 值得用 INFO 记录下来的 FFmpeg 输出。
     *
     * <p>每次连接都会打印整段版本横幅，逐行 INFO 会把日志刷爆；但真正的错误必须留在日志里 ——
     * 尤其是 concat 解复用器遇到坏片段时<b>仍然以退出码 0 结束</b>
     * （只打印 {@code Impossible to open '...'} 然后跳过该片段），
     * 这曾导致「导出成功但成片少了一段」无法追查。
     */
    private static final Pattern NOTABLE_OUTPUT = Pattern.compile(
            "(?i)(error|invalid|could not|cannot|can not|no such file|not found|unsupported|not supported"
                    + "|failed|failure|impossible|denied|unable|missing|corrupt|skipping|frame=|video:|speed=)");

    /**
     * 表示「有片段被跳过 / 无法解码」的致命输出。
     *
     * <p>concat 解复用器遇到打不开或无法解码的片段时只是打印这些行然后跳过，<b>退出码仍然是 0</b>。
     * 实测（ffmpeg 6.0 与 9.0 都是如此）：
     * <pre>
     * [mov,mp4,m4a,3gp,3g2,mj2 @ ...] error reading header
     * [concat @ ...] Impossible to open '...'
     * Error demuxing input file 0: Invalid data found when processing input
     * </pre>
     * 进程正常退出 0，成片直接少了那段 —— 若不检查就是「导出成功但内容不全」。
     *
     * <p>故意只匹配明确的「跳过/无法解码」措辞，不匹配裸 {@code error}，
     * 避免把正常输出里的无关字样误判成失败。
     */
    private static final Pattern FATAL_OUTPUT = Pattern.compile(
            "(?i)(impossible to open"
                    + "|error (during )?demuxing"
                    + "|invalid data found when processing input"
                    + "|error reading header"
                    + "|decoding for stream .* failed"
                    + "|could not find codec parameters)");

    /**
     * 连接前校验各片段参数是否一致。
     *
     * <p>{@code -c copy} 要求所有片段的编码参数完全一致：不一致时 ffmpeg 只把后续片段
     * 硬塞进第一段的参数里（实测 320x240/30fps 后续接 640x480/25fps 会产出
     * {@code Non-monotonic DTS} 刷屏 + 画面错乱的坏文件），而<b>退出码依然是 0</b>。
     * 所以在连接前用 ffprobe 先比一遍，问题片段能被明确指出。
     *
     * <p><b>快路径</b>：让 ffprobe 直接读 concat 列表，一次进程就能把所有片段走一遍
     * （实测 2000 个片段约 20ms，而逐片段探测要 12000ms 左右）。
     * 只有快路径报错时才回退到逐片段探测去精确定位，见 {@link #verifyClipsConsistent}。
     */
    private static final String PROBE_ENTRIES =
            "stream=codec_name,width,height,pix_fmt,r_frame_rate";

    /** 列表级预检的超时（毫秒）：2000 个片段实测约 20ms */
    private static final long LIST_PROBE_TIMEOUT_MS = 120_000;

    /** 探测单个片段的超时（毫秒）：本地小文件通常 60ms 左右 */
    private static final long PROBE_TIMEOUT_MS = 30_000;

    /**
     * 逐片段探测的并行线程数。
     *
     * <p>探测是「每个片段起一个 ffprobe 进程」，单次约 60ms，串行探测 180 个片段要 10 秒以上。
     * 8 路并行把它压到几秒，同时不会把机器打满。
     * （已命中缓存的片段不会再起进程，见 {@link #SIGNATURE_CACHE}。）
     */
    private static final int PROBE_PARALLELISM = 8;

    /** 单个片段探测失败时随异常抛出的 ffprobe 输出行数 */
    private static final int PROBE_DETAIL_CHARS = 300;

    /**
     * 片段参数签名缓存：路径 -> (最后修改时间, 签名)。
     *
     * <p>逐片段探测是整条连接流程里最贵的一步（每片段一个 ffprobe 进程，约 4~7ms/片段；
     * 2000 个片段要 13 秒以上，而 concat 本身只要 2 秒）。但导出时经常大量复用未修改的片段
     * （{@code BatchVideoProcessor} 对未修改的 Record 直接复用已有视频），
     * 这些片段的参数在文件没变时也不可能变，没必要每次导出重新探测。
     *
     * <p>用「路径 + 最后修改时间」做键：文件一旦被重新渲染（mtime 变化）就自动重新探测，
     * 不会因为缓存而漏掉参数变化。
     */
    private static final Map<String, SignatureCacheEntry> SIGNATURE_CACHE = new ConcurrentHashMap<>();

    /** 缓存条目上限，防止长时间运行无限增长（超出后整体清空，代价只是重探一次） */
    private static final int SIGNATURE_CACHE_LIMIT = 20_000;

    /** 缓存的签名 + 该文件当时的最后修改时间 */
    private record SignatureCacheEntry(long lastModified, String signature) {
    }

    /** 实际起过 ffprobe 进程的次数（供测试断言缓存是否真的生效） */
    private static final java.util.concurrent.atomic.AtomicLong PROBE_INVOCATIONS =
            new java.util.concurrent.atomic.AtomicLong();

    /**
     * 等待 FFmpeg 退出的上限。
     *
     * <p>流复制拼接通常只需几秒；给足够宽的余量以容忍超大工程和慢磁盘，
     * 但只要超时就把进程强杀并抛错，不允许再出现「永远卡住、只能强杀整个程序」的情况。
     * 可用 {@code -Dlbc.ffmpeg.concat.timeout.minutes=...} 覆盖。
     */
    private static final long DEFAULT_TIMEOUT_MINUTES = 30;

    private static final long TIMEOUT_MINUTES =
            Long.getLong("lbc.ffmpeg.concat.timeout.minutes", DEFAULT_TIMEOUT_MINUTES);

    /**
     * 连接多个视频文件
     * 
     * @param inputVideoPaths 输入视频文件路径列表（按顺序）
     * @param outputPath      输出视频文件路径
     * @throws IOException          连接失败时抛出
     * @throws InterruptedException 进程中断时抛出
     */
    public static void concatenateVideos(List<String> inputVideoPaths, String outputPath)
            throws IOException, InterruptedException {

        if (inputVideoPaths == null || inputVideoPaths.isEmpty()) {
            throw new IllegalArgumentException("输入视频列表不能为空");
        }

        logger.info("开始连接 {} 个视频文件到: {}", inputVideoPaths.size(), outputPath);
        long startTime = System.currentTimeMillis();

        // 列表文件只写一次：ffprobe 的列表级预检和后面的 concat 共用它
        File listFile = createVideoListFile(inputVideoPaths);

        try {
            // 连接前先校验各片段参数一致、且都能被解码。
            // 否则 -c copy 会安静地产出「少片段」或「画面错乱」的坏文件（退出码仍是 0）。
            // 快路径让 ffprobe 直接读这份列表，一次进程走完所有片段。
            verifyClipsConsistent(inputVideoPaths, listFile);

            // 获取ffmpeg可执行文件路径
            String ffmpegPath = FFmpegPathResolver.getFFmpegPath();

            // 构建FFmpeg命令
            ProcessBuilder pb = new ProcessBuilder(
                    ffmpegPath,
                    "-f", "concat",
                    "-safe", "0",
                    "-i", listFile.getAbsolutePath(),
                    "-c", "copy", // 直接流复制，无需重新编码
                    outputPath,
                    "-y" // 覆盖输出文件
            );

            // 设置工作目录
            pb.directory(new File(System.getProperty("user.dir")));

            // 执行命令
            Process process = pb.start();

            // 关键：必须持续读空 stdout/stderr。
            // 否则 FFmpeg 写满 4KB 管道缓冲后会永久阻塞，waitFor() 也永远不会返回（导出卡死）。
            Deque<String> errorTail = new ArrayDeque<>();
            Deque<String> errorHints = new ArrayDeque<>();
            // concat 跳过坏片段时退出码仍为 0，所以额外捕获「致命输出」自行判定失败
            Deque<String> fatalLines = new ArrayDeque<>();

            Thread stdoutThread = new Thread(
                    () -> drainDiscard(process.getInputStream()), "concat-stdout-drain");
            Thread stderrThread = new Thread(
                    () -> drainStream(process.getErrorStream(), errorTail, errorHints, fatalLines),
                    "concat-stderr-drain");
            stdoutThread.setDaemon(true);
            stderrThread.setDaemon(true);
            stdoutThread.start();
            stderrThread.start();

            boolean exited;
            try {
                exited = process.waitFor(TIMEOUT_MINUTES, TimeUnit.MINUTES);
            } catch (InterruptedException e) {
                process.destroyForcibly();
                Thread.currentThread().interrupt();
                throw e;
            }

            if (!exited) {
                process.destroyForcibly();
                process.waitFor(10, TimeUnit.SECONDS);
                deleteQuietly(outputPath);
                throw new IOException("FFmpeg连接超时(" + TIMEOUT_MINUTES + "分钟)，已终止进程并清理输出: " + outputPath);
            }

            int exitCode = process.exitValue();
            // 等读取线程收尾，保证错误详情已经拿到
            stdoutThread.join(10000);
            stderrThread.join(10000);

            if (exitCode != 0) {
                String detail;
                synchronized (errorTail) {
                    Deque<String> source = errorHints.isEmpty() ? errorTail : errorHints;
                    detail = source.isEmpty() ? "（FFmpeg 未输出错误详情）" : String.join(" | ", source);
                }
                deleteQuietly(outputPath);
                throw new IOException("FFmpeg连接失败，退出码: " + exitCode + "，错误详情: " + detail);
            }

            // 退出码为 0 也可能「丢了片段 / 画面错乱」：concat 遇到打不开或无法解码的片段
            // 只打印错误然后跳过，进程照样正常退出。这里必须自己判定，否则会静默产出残缺成片。
            String fatal;
            synchronized (fatalLines) {
                fatal = fatalLines.isEmpty() ? null : String.join(" | ", fatalLines);
            }
            if (fatal != null) {
                deleteQuietly(outputPath);
                throw new IOException("FFmpeg连接时跳过了无法解码的片段（退出码为 0，但成片不完整），"
                        + "请检查对应 Record 的临时视频是否损坏: " + fatal);
            }

            // 退出码 0 也可能留下空文件，这里兜底，避免把坏文件交给后续阶段
            File output = new File(outputPath);
            if (!output.exists() || output.length() == 0) {
                throw new IOException("FFmpeg连接结束但输出文件不存在或为空: " + outputPath);
            }

            long duration = System.currentTimeMillis() - startTime;
            logger.info("视频连接完成: {} <- {} 个视频, 耗时: {}ms, 大小: {} bytes",
                    outputPath, inputVideoPaths.size(), duration, output.length());

        } finally {
            // 清理临时文件
            if (listFile.exists() && !listFile.delete()) {
                logger.warn("无法删除临时文件: {}", listFile.getAbsolutePath());
            }
        }
    }

    /**
     * 构造一个「遇到非法字节就替换、绝不抛异常」的解码器。
     *
     * <p>FFmpeg 的 stderr 不保证是合法 UTF-8（路径含中文时按系统代码页输出、或输出被截断）。
     * 若用严格解码，{@code readLine()} 会抛 {@link java.nio.charset.MalformedInputException}，
     * 读取线程直接死掉 —— 管道随即写满，FFmpeg 卡住、导出再次假死。
     * 读取线程必须永远不能因为解码问题退出，所以这里显式 REPLACE 掉非法字节，
     * 并去掉 BOM，保证第一行不会多出不可见字符。
     */
    private static Reader lenientReader(java.io.InputStream stream) {
        CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPLACE)
                .onUnmappableCharacter(CodingErrorAction.REPLACE);
        return new InputStreamReader(stream, decoder);
    }

    /**
     * 读空并丢弃一条输出流（stdout 用）。
     *
     * <p>FFmpeg 正常时几乎不写 stdout，但管道必须有人读，否则一旦写满同样会卡死。
     */
    private static void drainDiscard(java.io.InputStream stream) {
        try (java.io.InputStream in = stream) {
            byte[] buffer = new byte[8192];
            while (in.read(buffer) != -1) {
                // 丢弃：stdout 的内容对排障没有价值
            }
        } catch (IOException e) {
            logger.debug("读取FFmpeg stdout结束: {}", e.getMessage());
        }
    }

    /**
     * 读空子进程的一条输出流，防止管道写满导致 FFmpeg 阻塞。
     *
     * @param stream     要读取的流
     * @param errorTail  收集末尾若干行（已过滤 FFmpeg 版本横幅）作为失败详情
     * @param errorHints 额外收集「看起来像错误原因」的行
     * @param fatalLines 额外收集「片段被跳过」这类致命行
     */
    private static void drainStream(java.io.InputStream stream,
            Deque<String> errorTail,
            Deque<String> errorHints,
            Deque<String> fatalLines) {
        try (BufferedReader reader = new BufferedReader(lenientReader(stream))) {
            String line;
            boolean first = true;
            while ((line = reader.readLine()) != null) {
                if (first) {
                    // 去掉可能存在的 UTF-8 BOM，避免影响第一行的匹配与显示
                    if (!line.isEmpty() && line.charAt(0) == '\uFEFF') {
                        line = line.substring(1);
                    }
                    first = false;
                }
                if (FFMPEG_BANNER.matcher(line).find()) {
                    // 版本横幅不入日志（错误详情收集也一并跳过）
                    continue;
                }
                if (FATAL_OUTPUT.matcher(line).find()) {
                    // 这类行必须显眼：它们意味着成片已经不完整，而退出码却可能是 0
                    logger.error("FFmpeg concat 跳过了片段: {}", line);
                    if (fatalLines != null) {
                        synchronized (fatalLines) {
                            fatalLines.addLast(line);
                            while (fatalLines.size() > ERROR_TAIL_LINES) {
                                fatalLines.removeFirst();
                            }
                        }
                    }
                } else if (NOTABLE_OUTPUT.matcher(line).find()) {
                    logger.info("FFmpeg concat: {}", line);
                } else {
                    logger.debug("FFmpeg concat: {}", line);
                }
                synchronized (errorTail) {
                    errorTail.addLast(line);
                    while (errorTail.size() > ERROR_TAIL_LINES) {
                        errorTail.removeFirst();
                    }
                    if (errorHints != null && ERROR_HINT.matcher(line).find()) {
                        errorHints.addLast(line);
                        while (errorHints.size() > ERROR_TAIL_LINES) {
                            errorHints.removeFirst();
                        }
                    }
                }
            }
        } catch (IOException e) {
            // 进程被强杀时流会提前关闭，这里属于正常收尾
            logger.debug("读取FFmpeg输出流结束: {}", e.getMessage());
        }
    }

    /**
     * 连接前校验：每个片段都存在、可被解析，且编码参数与第一个片段一致。
     *
     * <p>分两级，先便宜后昂贵：
     * <ol>
     *   <li><b>列表级体检</b>：把整份 concat 列表交给 ffprobe，一次进程就能把所有片段打开一遍，
     *       实测 2000 个片段约 20ms。它能一次性查出「缺失/损坏/打不开」的片段，
     *       并给出比 concat 阶段更早、更清楚的中止。（相比逐片段探测 2000 次约 12000ms，
     *       这里省下的是"发现坏片段"的等待。）</li>
     *   <li><b>逐片段比对参数</b>：{@code -c copy} 的一致性无法只靠列表级探测判断 ——
     *       concat 解复用器只暴露<b>第一个</b>流，列表里后续片段参数不同时 ffprobe
     *       照样报第一段的参数并正常退出（实测：640x360@30 后接 320x180@25，
     *       ffprobe 只报 640,360,30/1、退出码 0、stderr 为空，包级信息里也没有宽高）。
     *       所以参数一致性仍然逐片段探测（并行）来保证。</li>
     * </ol>
     *
     * @param listFile 已经写好的 concat 列表文件（与 concat 共用，不重复写盘）
     * @throws IOException          片段缺失/无法解析/参数不一致
     * @throws InterruptedException 探测被中断
     */
    private static void verifyClipsConsistent(List<String> clipPaths, File listFile)
            throws IOException, InterruptedException {
        // 1) 列表级体检：快速抓出缺失/损坏的片段，附带逐片段的精确定位
        ProbeResult fast = probeListOnce(listFile);
        if (!fast.isClean()) {
            logger.warn("列表级预检发现问题（退出码 {}）: {}", fast.exitCode, snippet(fast.stderr));
            verifyClipsExist(clipPaths);
            verifyClipParameters(clipPaths);
            // 逐片段都正常却仍报错：把列表级的问题抛出去，避免带着疑问继续
            throw new IOException("连接前校验失败：concat 列表无法被完整解析，请检查临时视频是否损坏。"
                    + "ffprobe: " + snippet(fast.stderr));
        }

        // 2) 参数一致性（列表级探测看不到，必须逐片段比对）
        verifyClipsExist(clipPaths);
        verifyClipParameters(clipPaths);
    }

    /** 一次探测的结果：退出码 + stderr */
    private static final class ProbeResult {
        final int exitCode;
        final String stderr;

        ProbeResult(int exitCode, String stderr) {
            this.exitCode = exitCode;
            this.stderr = stderr;
        }

        /** 退出码 0 且没有任何错误输出才算干净 */
        boolean isClean() {
            return exitCode == 0 && stderr.isBlank();
        }
    }

    /** 零成本检查：片段不存在时直接指出，不用浪费一次探测 */
    private static void verifyClipsExist(List<String> clipPaths) throws IOException {
        for (int i = 0; i < clipPaths.size(); i++) {
            if (!new File(clipPaths.get(i)).exists()) {
                throw new IOException("连接前校验失败：第 " + (i + 1) + "/" + clipPaths.size()
                        + " 个片段不存在: " + clipPaths.get(i));
            }
        }
    }

    /**
     * 快路径：让 ffprobe 直接读 concat 列表，一次进程把整个列表过一遍。
     *
     * <p>用于尽早发现「打不开/解码不了」的片段，比等到 concat 阶段才报错更清楚。
     */
    private static ProbeResult probeListOnce(File listFile) throws IOException, InterruptedException {
        List<String> command = List.of(
                FFmpegPathResolver.getFFprobePath(),
                "-v", "error",
                "-f", "concat",
                "-safe", "0",
                "-i", listFile.getAbsolutePath(),
                "-select_streams", "v:0",
                "-show_entries", PROBE_ENTRIES,
                "-of", "csv=p=0");

        Process process = new ProcessBuilder(command).start();

        StringBuilder stdout = new StringBuilder();
        StringBuilder stderr = new StringBuilder();
        // 同样必须读空两条流，否则输出一多就会卡住
        Thread outThread = new Thread(() -> drainToBuffer(process.getInputStream(), stdout), "list-probe-stdout");
        Thread errThread = new Thread(() -> drainToBuffer(process.getErrorStream(), stderr), "list-probe-stderr");
        outThread.setDaemon(true);
        errThread.setDaemon(true);
        outThread.start();
        errThread.start();

        boolean exited;
        try {
            exited = process.waitFor(LIST_PROBE_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
            throw e;
        }

        if (!exited) {
            process.destroyForcibly();
            process.waitFor(10, TimeUnit.SECONDS);
            // 超时不当作"干净"，走逐片段路径由它决定成败
            return new ProbeResult(-1, "列表级预检超时(" + LIST_PROBE_TIMEOUT_MS + "ms)");
        }

        outThread.join(5000);
        errThread.join(5000);
        return new ProbeResult(process.exitValue(), stderr.toString());
    }

    /**
     * 逐片段探测并比对参数，精确定位第一个有问题的片段。
     *
     * <p>探测是「每个片段起一个 ffprobe 进程」，所以并行跑；排序后按顺序比较，
     * 报告位置最靠前的那个不一致片段。
     *
     * @throws IOException          片段无法解析或参数不一致
     * @throws InterruptedException 探测被中断
     */
    private static void verifyClipParameters(List<String> clipPaths)
            throws IOException, InterruptedException {
        long probeStart = System.currentTimeMillis();
        int total = clipPaths.size();

        List<String> signatures = probeAll(clipPaths);

        String reference = signatures.get(0);
        logger.info("连接前校验基准（第1个片段）: {} -> {}", clipPaths.get(0), reference);

        for (int i = 1; i < total; i++) {
            if (!reference.equals(signatures.get(i))) {
                throw new IOException("连接前校验失败：片段编码参数不一致，直接 copy 会产生错乱或丢帧的成片。"
                        + "第 1 个片段 [" + clipPaths.get(0) + "] = " + reference
                        + "，第 " + (i + 1) + " 个片段 [" + clipPaths.get(i) + "] = " + signatures.get(i));
            }
        }

        logger.info("连接前校验通过: {} 个片段参数一致，耗时: {}ms",
                total, System.currentTimeMillis() - probeStart);
    }

    /**
     * 并行探测所有片段的参数签名，返回与输入顺序一致的列表。
     *
     * @throws IOException          某个片段无法解析（损坏/不是视频/没有视频流）
     * @throws InterruptedException 等待探测结果时被中断
     */
    private static List<String> probeAll(List<String> clipPaths)
            throws IOException, InterruptedException {
        int total = clipPaths.size();

        // 先尽量用缓存填掉：文件没变过的片段不必再起 ffprobe 进程
        String[] signatures = new String[total];
        int cachedCount = 0;
        List<Integer> missing = new ArrayList<>();
        for (int i = 0; i < total; i++) {
            String path = clipPaths.get(i);
            String cached = cachedSignature(path);
            if (cached != null) {
                signatures[i] = cached;
                cachedCount++;
            } else {
                missing.add(i);
            }
        }
        if (cachedCount > 0) {
            logger.info("片段参数探测：{} 个命中缓存，{} 个需要实际探测", cachedCount, missing.size());
        }
        if (missing.isEmpty()) {
            return new ArrayList<>(List.of(signatures));
        }

        // 只有需要探测的部分才并行起进程
        int threads = Math.max(1, Math.min(PROBE_PARALLELISM, missing.size()));
        ExecutorService pool = Executors.newFixedThreadPool(threads, runnable -> {
            Thread thread = new Thread(runnable, "concat-probe");
            thread.setDaemon(true);
            return thread;
        });

        try {
            List<Future<String>> futures = new ArrayList<>(missing.size());
            for (int index : missing) {
                final String path = clipPaths.get(index);
                futures.add(pool.submit(() -> probeVideoSignature(path, index, total)));
            }

            for (int k = 0; k < missing.size(); k++) {
                int index = missing.get(k);
                String signature;
                try {
                    signature = futures.get(k).get();
                } catch (ExecutionException e) {
                    Throwable cause = e.getCause();
                    if (cause instanceof IOException) {
                        throw (IOException) cause;
                    }
                    if (cause instanceof InterruptedException) {
                        Thread.currentThread().interrupt();
                        throw (InterruptedException) cause;
                    }
                    throw new IOException("连接前校验失败：探测第 " + (index + 1) + "/" + total
                            + " 个片段出错: " + clipPaths.get(index), cause);
                }
                signatures[index] = signature;
                cacheSignature(clipPaths.get(index), signature);
            }
        } finally {
            pool.shutdownNow();
        }

        return new ArrayList<>(List.of(signatures));
    }

    /** 取缓存签名：文件的最后修改时间必须与缓存一致，否则视为未命中 */
    private static String cachedSignature(String path) {
        SignatureCacheEntry entry = SIGNATURE_CACHE.get(path);
        if (entry == null) {
            return null;
        }
        File file = new File(path);
        if (!file.exists() || file.lastModified() != entry.lastModified()) {
            return null;
        }
        return entry.signature();
    }

    /** 写入缓存（带容量上限） */
    private static void cacheSignature(String path, String signature) {
        if (SIGNATURE_CACHE.size() >= SIGNATURE_CACHE_LIMIT) {
            // 简单兜底：整体清空，避免无限增长；代价只是下次重新探测一遍
            SIGNATURE_CACHE.clear();
        }
        SIGNATURE_CACHE.put(path, new SignatureCacheEntry(new File(path).lastModified(), signature));
    }

    /**
     * 当前已缓存的片段参数签名数量。
     *
     * <p>仅供测试使用：用于验证「命中缓存」与「mtime 变化后失效」这两条行为，
     * 避免测试去解析日志或依赖不稳定的耗时比较。
     */
    static int cachedSignatureCount() {
        return SIGNATURE_CACHE.size();
    }

    /**
     * 实际起过 ffprobe 进程的片段探测次数（命中缓存的不计入）。
     *
     * <p>仅供测试使用：让「缓存命中」可以被确定性地断言，而不是靠比较耗时。
     */
    static long probeInvocationCount() {
        return PROBE_INVOCATIONS.get();
    }

    /** 重置测试用计数器 */
    static void resetProbeInvocationCount() {
        PROBE_INVOCATIONS.set(0);
    }

    /**
     * 用 ffprobe 取单个片段的视频参数签名：{@code 编码,宽,高,像素格式,帧率}。
     *
     * @throws IOException 片段无法解析（损坏/不是视频）或缺少视频流
     */
    private static String probeVideoSignature(String path, int index, int total)
            throws IOException, InterruptedException {
        PROBE_INVOCATIONS.incrementAndGet();

        List<String> command = List.of(
                FFmpegPathResolver.getFFprobePath(),
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", PROBE_ENTRIES,
                "-of", "csv=p=0",
                path);

        Process process = new ProcessBuilder(command).start();

        // 同样必须读空两条流，否则 ffprobe 输出稍多就会卡住（与 concat 同一类问题）
        StringBuilder stdout = new StringBuilder();
        StringBuilder stderr = new StringBuilder();
        Thread outThread = new Thread(() -> drainToBuffer(process.getInputStream(), stdout), "probe-stdout-drain");
        Thread errThread = new Thread(() -> drainToBuffer(process.getErrorStream(), stderr), "probe-stderr-drain");
        outThread.setDaemon(true);
        errThread.setDaemon(true);
        outThread.start();
        errThread.start();

        boolean exited;
        try {
            exited = process.waitFor(PROBE_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
            throw e;
        }

        if (!exited) {
            process.destroyForcibly();
            throw new IOException("连接前校验失败：探测第 " + (index + 1) + "/" + total
                    + " 个片段超时: " + path);
        }

        int exitCode = process.exitValue();
        outThread.join(5000);
        errThread.join(5000);

        if (exitCode != 0) {
            throw new IOException("连接前校验失败：第 " + (index + 1) + "/" + total
                    + " 个片段无法解析（可能已损坏）: " + path + "，ffprobe: " + snippet(stderr.toString()));
        }

        String signature = stdout.toString().trim();
        if (signature.isEmpty()) {
            throw new IOException("连接前校验失败：第 " + (index + 1) + "/" + total
                    + " 个片段没有视频流: " + path + "，ffprobe: " + snippet(stderr.toString()));
        }
        // 多视频流时 csv 会输出多行，只取第一行比较即可（concat 也按第一路视频处理）
        int newline = signature.indexOf('\n');
        if (newline >= 0) {
            signature = signature.substring(0, newline).trim();
        }
        return signature;
    }

    /** 读空一条流并追加到缓冲区（用于 ffprobe 的短输出） */
    private static void drainToBuffer(java.io.InputStream stream, StringBuilder sink) {
        try (BufferedReader reader = new BufferedReader(lenientReader(stream))) {
            String line;
            while ((line = reader.readLine()) != null) {
                synchronized (sink) {
                    sink.append(line).append('\n');
                }
            }
        } catch (IOException e) {
            logger.debug("读取ffprobe输出流结束: {}", e.getMessage());
        }
    }

    /** 截断过长的 ffprobe 输出，避免异常信息刷屏 */
    private static String snippet(String text) {
        String trimmed = text == null ? "" : text.trim();
        if (trimmed.length() <= PROBE_DETAIL_CHARS) {
            return trimmed;
        }
        return trimmed.substring(trimmed.length() - PROBE_DETAIL_CHARS);
    }

    private static void deleteQuietly(String path) {
        if (path == null) {
            return;
        }
        File file = new File(path);
        if (file.exists() && !file.delete()) {
            logger.warn("无法删除连接失败产生的残留文件: {}", path);
        }
    }

    /**
     * 创建FFmpeg用的视频列表文件。
     *
     * <p><b>必须显式用 UTF-8 写。</b>这个列表里可能含中文路径（导出目录/片段名），而
     * ffmpeg 读 concat 列表时按 UTF-8 解释：实测用 GBK 写列表，JavaCV 自带的 ffmpeg 6.0
     * 会直接访问违例崩溃（0xC0000005）而不是报错。原来这里用无参 {@code getBytes()}，
     * 依赖 JVM 默认字符集 —— JDK 18+ 恰好默认 UTF-8，但一旦有人改回来就是崩溃级故障。
     */
    private static File createVideoListFile(List<String> videoPaths) throws IOException {
        File listFile = File.createTempFile("video_list_", ".txt");

        StringBuilder content = new StringBuilder();
        for (String videoPath : videoPaths) {
            // FFmpeg concat格式：file '路径'
            content.append("file '").append(new File(videoPath).getAbsolutePath()).append("'\n");
        }

        Files.writeString(listFile.toPath(), content.toString(), StandardCharsets.UTF_8);
        logger.debug("创建视频列表文件: {}，包含 {} 个视频", listFile.getAbsolutePath(), videoPaths.size());

        return listFile;
    }
}