package com.lbc_plot.render.video;

import org.bytedeco.ffmpeg.global.avcodec;
import org.bytedeco.ffmpeg.global.avutil;
import org.bytedeco.javacv.FFmpegFrameRecorder;
import org.bytedeco.javacv.Frame;
import org.bytedeco.javacv.Java2DFrameConverter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.common.util.FFmpegPathResolver;
import com.lbc_plot.common.util.RenderQualityUtils;
import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.render.engine.RenderOfVideo;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;

import javax.imageio.ImageIO;

/**
 * 高质量流式视频导出器 - 结合流式处理和高质量输出
 */
public class VideoExporter implements AutoCloseable {
    private static final Logger logger = LoggerFactory.getLogger(VideoExporter.class);

    /**
     * 透明视频编码方案
     */
    private enum TransparentCodec {
        /** Apple ProRes 4444 — 视频后期行业标准，所有专业编辑软件完美支持 */
        PRO_RES_4444("ProRes 4444", "prores_ks", "yuva444p10le"),
        /** PNG 编码 + MOV 容器 — 通用兼容降级方案 */
        PNG_MOV("PNG/MOV", "png", "rgba");

        private final String displayName;
        private final String codecName;
        private final String pixelFormat;

        TransparentCodec(String displayName, String codecName, String pixelFormat) {
            this.displayName = displayName;
            this.codecName = codecName;
            this.pixelFormat = pixelFormat;
        }

        String getDisplayName() { return displayName; }
        String getCodecName() { return codecName; }
        String getPixelFormat() { return pixelFormat; }
    }

    /** ProRes 编码器可用性缓存：null=未检测，true=可用，false=不可用 */
    private static Boolean proresAvailable = null;

    private String outputPath;
    private int width = ProjectConfig.VIDEO_WIDTH;
    private int height = ProjectConfig.VIDEO_HEIGHT;
    private int frameRate = ProjectConfig.FRAME_RATE;
    private Process ffmpegProcess;
    private OutputStream ffmpegInput;
    private final Java2DFrameConverter converter;
    private FFmpegFrameRecorder recorder;
    private boolean transparent;

    // 首帧已保存标记（调试用，验证 alpha 渲染是否正确）
    private boolean firstFrameSaved = false;

    public VideoExporter(String outputPath, int width, int height, int frameRate) {
        this(outputPath, width, height, frameRate, VideoQualityConfig.HIGH_QUALITY, false);
    }

    public VideoExporter(String outputPath, int width, int height, int frameRate,
            VideoQualityConfig.VideoPreset preset) {
        this(outputPath, width, height, frameRate, preset, false);
    }

    /**
     * 带透明通道支持的构造函数
     * @param transparent true 时输出带 alpha 通道的视频（MOV/QTRLE 格式）
     */
    public VideoExporter(String outputPath, int width, int height, int frameRate, boolean transparent) {
        this(outputPath, width, height, frameRate, VideoQualityConfig.HIGH_QUALITY, transparent);
    }

    public VideoExporter(String outputPath, int width, int height, int frameRate,
            VideoQualityConfig.VideoPreset preset, boolean transparent) {
        this.outputPath = outputPath;
        this.width = width;
        this.height = height;
        this.frameRate = frameRate;
        this.converter = new Java2DFrameConverter();
        this.preset = preset;
        this.transparent = transparent;
        initialize();
    }

    private VideoQualityConfig.VideoPreset preset;

    /**
     * 初始化高质量FFmpeg录制器
     */
    private void initialize() {
        try {
            if (transparent) {
                logger.info("初始化透明通道视频导出器: {}x{}, {}fps, {}", width, height, frameRate, outputPath);
                initializeTransparentPipe();
            } else {
                logger.info("初始化高质量流式视频导出器: {}x{}, {}fps, {}", width, height, frameRate, outputPath);
                // 方法1: 使用JavaCV FFmpegFrameRecorder
                initializeJavaCVRecorder();
            }
        } catch (Exception e) {
            logger.error("初始化高质量视频导出器失败", e);
            throw new RuntimeException("视频导出器初始化失败", e);
        }
    }

    /**
     * 初始化透明通道FFmpeg管道（raw RGBA 输入 → 透明编码 → MOV容器）
     *
     * <p>编码器选择策略：
     * <ol>
     *   <li>首选 ProRes 4444 — 视频后期行业标准，After Effects/Premiere/DaVinci 完美支持</li>
     *   <li>降级 PNG/MOV — ProRes 不可用时使用，通用兼容</li>
     * </ol>
     *
     * <p>直接写入原始 RGBA 字节流给 FFmpeg，避免 ImageIO PNG 编解码环节可能
     * 导致的色差和 alpha 丢失问题。rawvideo 格式可以完全控制像素通道顺序。
     */
    private void initializeTransparentPipe() {
        TransparentCodec codec = selectTransparentCodec();
        String[] ffmpegCommand = buildTransparentCommand(codec);

        logger.info("FFmpeg透明通道命令 ({}): {}", codec.getDisplayName(),
                String.join(" ", ffmpegCommand));

        try {
            ProcessBuilder pb = new ProcessBuilder(ffmpegCommand);
            ffmpegProcess = pb.start();
            ffmpegInput = ffmpegProcess.getOutputStream();

            // 后台线程消费 stderr，防止 FFmpeg 管道阻塞，同时记录错误
            final Process proc = ffmpegProcess;
            Thread stderrReader = new Thread(() -> {
                try (java.io.BufferedReader reader = new java.io.BufferedReader(
                        new java.io.InputStreamReader(proc.getErrorStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        logger.warn("FFmpeg({}): {}", codec.getDisplayName(), line);
                    }
                } catch (IOException ignored) {
                }
            }, "ffmpeg-transparent-stderr");
            stderrReader.setDaemon(true);
            stderrReader.start();

            logger.info("透明通道FFmpeg管道初始化成功 (rawvideo RGBA → {} → MOV)",
                    codec.getDisplayName());

        } catch (IOException e) {
            throw new RuntimeException("透明通道FFmpeg管道初始化失败 (" + codec.getDisplayName() + ")", e);
        }
    }

    /**
     * 选择透明视频编码方案：优先 ProRes 4444，不可用时降级到 PNG/MOV
     */
    private TransparentCodec selectTransparentCodec() {
        if (isProResAvailable()) {
            return TransparentCodec.PRO_RES_4444;
        }
        logger.info("ProRes 4444 编码器不可用，降级使用 PNG/MOV");
        return TransparentCodec.PNG_MOV;
    }

    /**
     * 根据编码方案构建 FFmpeg 命令
     */
    private String[] buildTransparentCommand(TransparentCodec codec) {
        if (codec == TransparentCodec.PRO_RES_4444) {
            // ProRes 4444: 10-bit YUV 4:4:4 + alpha，行业标准
            // -profile:v 4 = 4444, -vendor apl0 = Apple 兼容标志
            return new String[] {
                    FFmpegPathResolver.getFFmpegPath(), "-y",
                    "-f", "rawvideo",
                    "-pixel_format", "rgba",
                    "-video_size", width + "x" + height,
                    "-framerate", String.valueOf(frameRate),
                    "-i", "-",
                    "-c:v", codec.getCodecName(),
                    "-profile:v", "4",
                    "-pix_fmt", codec.getPixelFormat(),
                    "-vendor", "apl0",
                    "-f", "mov",
                    "-r", String.valueOf(frameRate),
                    outputPath
            };
        } else {
            // PNG/MOV: 8-bit RGBA，通用兼容
            return new String[] {
                    FFmpegPathResolver.getFFmpegPath(), "-y",
                    "-f", "rawvideo",
                    "-pixel_format", "rgba",
                    "-video_size", width + "x" + height,
                    "-framerate", String.valueOf(frameRate),
                    "-i", "-",
                    "-c:v", codec.getCodecName(),
                    "-pix_fmt", codec.getPixelFormat(),
                    "-f", "mov",
                    "-r", String.valueOf(frameRate),
                    outputPath
            };
        }
    }

    /**
     * 检测 ProRes 4444 编码器是否可用（结果缓存，仅首次检测）
     * 通过 {@code ffmpeg -encoders} 输出中搜索 "prores_ks" 来判断。
     */
    private static synchronized boolean isProResAvailable() {
        if (proresAvailable != null) {
            return proresAvailable;
        }
        try {
            Process p = new ProcessBuilder(FFmpegPathResolver.getFFmpegPath(), "-encoders").start();
            java.io.BufferedReader reader = new java.io.BufferedReader(
                    new java.io.InputStreamReader(p.getInputStream()));
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.contains("prores_ks")) {
                    proresAvailable = true;
                    logger.info("检测到 ProRes 4444 编码器可用 (prores_ks)");
                    break;
                }
            }
            reader.close();
            p.waitFor();
            if (proresAvailable == null) {
                proresAvailable = false;
                logger.info("未检测到 prores_ks 编码器，将使用 PNG/MOV 降级方案");
            }
        } catch (Exception e) {
            proresAvailable = false;
            logger.info("ProRes 编码器检测失败: {}，将使用 PNG/MOV 降级方案", e.getMessage());
        }
        return proresAvailable;
    }

    /**
     * 方法1: 使用JavaCV FFmpegFrameRecorder（保持与现有高质量代码一致）
     */
    private void initializeJavaCVRecorder() {
        try {
            recorder = new FFmpegFrameRecorder(outputPath, width, height);

            // 🔥 使用与现有高质量代码完全相同的设置
            recorder.setVideoCodec(avcodec.AV_CODEC_ID_H264);
            recorder.setFormat("mp4");
            recorder.setFrameRate(frameRate);

            // 使用预设参数
            recorder.setVideoQuality(preset.quality);
            recorder.setVideoBitrate(preset.bitrate);
            recorder.setVideoOption("preset", preset.preset);

            // 关键：设置像素格式为YUV420P（广泛兼容）
            recorder.setPixelFormat(avutil.AV_PIX_FMT_YUV420P);

            // 音频设置（如果需要）
            recorder.setAudioChannels(2);
            recorder.setSampleRate(44100);

            recorder.start();
            logger.debug("JavaCV高质量录制器初始化成功");

        } catch (Exception e) {
            logger.error("JavaCV录制器初始化失败，尝试备选方案", e);
            initializeFFmpegPipe(); // 降级到备选方案
        }
    }

    /**
     * 方法2: 备选方案 - 使用FFmpeg命令行管道（更稳定）
     */
    private void initializeFFmpegPipe() {
        try {
            // 构建高质量FFmpeg命令（与现有高质量设置匹配）
            String[] ffmpegCommand = {
                    FFmpegPathResolver.getFFmpegPath(), "-y",
                    "-f", "image2pipe",
                    "-vcodec", "png", // 使用PNG保持高质量，而不是PPM
                    "-r", String.valueOf(frameRate),
                    "-i", "-",
                    "-c:v", "libx264",
                    "-crf", "18", // CRF 18 = 高质量
                    "-preset", "medium",
                    "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart",
                    "-r", String.valueOf(frameRate),
                    outputPath
            };

            ProcessBuilder pb = new ProcessBuilder(ffmpegCommand);
            ffmpegProcess = pb.start();
            ffmpegInput = ffmpegProcess.getOutputStream();

            logger.debug("FFmpeg管道初始化成功，使用PNG编码");

        } catch (IOException e) {
            throw new RuntimeException("FFmpeg管道初始化失败", e);
        }
    }

    /**
     * 写入高质量帧
     */
    public void writeFrame(BufferedImage frame) throws IOException {
        if (transparent) {
            // 透明通道：使用 raw RGBA pipe → 透明编码器 → MOV（ProRes 4444 优先，PNG 降级）
            writeFrameTransparent(frame);
        } else if (recorder != null) {
            // 使用JavaCV录制器（高质量）
            writeFrameWithJavaCV(frame);
        } else {
            // 使用FFmpeg管道（高质量备选）
            writeFrameWithFFmpegPipe(frame);
        }
    }

    /**
     * 写入透明通道帧 — 直接写原始 RGBA 数据到 FFmpeg rawvideo 管道
     * 避免 ImageIO PNG 编解码环节，确保 alpha 通道精确传递
     */
    private void writeFrameTransparent(BufferedImage frame) throws IOException {
        // 确保使用带alpha通道的格式 (TYPE_INT_ARGB)
        BufferedImage argbFrame = ensureAlphaCompatible(frame);

        // 调试：保存首帧为 PNG 文件，方便验证 alpha 通道是否正确渲染
        if (!firstFrameSaved) {
            firstFrameSaved = true;
            saveDebugFrame(argbFrame);
        }

        // 将 TYPE_INT_ARGB 帧转换为原始 RGBA 字节流，写入 FFmpeg 管道
        byte[] rgbaBytes = convertFrameToRGBA(argbFrame);
        ffmpegInput.write(rgbaBytes);
        // 注意：不调用 flush() 以避免过多系统调用；
        // FFmpeg rawvideo demuxer 按固定帧大小读取，不需要 flush 来分隔帧
    }

    /**
     * 将 TYPE_INT_ARGB (ARGB int packed) 转换为原始 RGBA 字节流
     * Java TYPE_INT_ARGB 像素顺序: 0xAARRGGBB (int 中: A-R-G-B)
     * FFmpeg rawvideo rgba 期望: byte[R, G, B, A] 逐像素连续
     */
    private byte[] convertFrameToRGBA(BufferedImage argbFrame) {
        int w = argbFrame.getWidth();
        int h = argbFrame.getHeight();
        int[] pixels = argbFrame.getRGB(0, 0, w, h, null, 0, w);
        byte[] rgba = new byte[w * h * 4];

        for (int i = 0; i < pixels.length; i++) {
            int pixel = pixels[i];
            int base = i * 4;
            // ARGB int → RGBA bytes
            rgba[base]     = (byte) ((pixel >> 16) & 0xFF); // R
            rgba[base + 1] = (byte) ((pixel >> 8) & 0xFF);  // G
            rgba[base + 2] = (byte) (pixel & 0xFF);          // B
            rgba[base + 3] = (byte) ((pixel >> 24) & 0xFF);  // A
        }

        return rgba;
    }

    /**
     * 调试用：保存首帧到磁盘，验证 alpha 通道渲染是否正确
     */
    private void saveDebugFrame(BufferedImage argbFrame) {
        try {
            File debugDir = RuntimePaths.getTempDir().toFile();
            if (!debugDir.exists()) {
                debugDir.mkdirs();
            }
            File debugFile = new File(debugDir, "debug_transparent_first_frame.png");
            ImageIO.write(argbFrame, "png", debugFile);
            logger.info("调试首帧已保存: {} ({}x{}, type={})",
                    debugFile.getAbsolutePath(),
                    argbFrame.getWidth(), argbFrame.getHeight(),
                    argbFrame.getType() == BufferedImage.TYPE_INT_ARGB ? "TYPE_INT_ARGB" : "other");
        } catch (IOException e) {
            logger.warn("保存调试首帧失败: {}", e.getMessage());
        }
    }

    /**
     * 使用JavaCV写入帧（保持高质量）
     */
    private void writeFrameWithJavaCV(BufferedImage frame) {
        try {
            BufferedImage compatibleFrame = ensureHighQualityCompatible(frame);
            Frame videoFrame = converter.convert(compatibleFrame);
            recorder.record(videoFrame);

        } catch (Exception e) {
            logger.error("JavaCV帧写入失败", e);
            throw new RuntimeException("帧写入失败", e);
        }
    }

    /**
     * 使用FFmpeg管道写入帧（高质量备选）
     */
    private void writeFrameWithFFmpegPipe(BufferedImage frame) throws IOException {
        writeImageAsPNG(frame, ffmpegInput);
        ffmpegInput.flush();
    }

    /**
     * 确保高质量兼容的图像格式（与现有代码一致，用于不透明视频）
     */
    private BufferedImage ensureHighQualityCompatible(BufferedImage frame) {
        if (frame.getType() == BufferedImage.TYPE_3BYTE_BGR) {
            return frame;
        }

        BufferedImage compatibleImage = new BufferedImage(
                frame.getWidth(),
                frame.getHeight(),
                BufferedImage.TYPE_3BYTE_BGR);

        Graphics2D g2d = compatibleImage.createGraphics();
        RenderQualityUtils.setupUltraQualityRendering(g2d);
        g2d.drawImage(frame, 0, 0, null);
        g2d.dispose();

        return compatibleImage;
    }

    /**
     * 确保alpha兼容的图像格式（TYPE_INT_ARGB，用于透明视频）
     */
    private BufferedImage ensureAlphaCompatible(BufferedImage frame) {
        if (frame.getType() == BufferedImage.TYPE_INT_ARGB) {
            return frame;
        }

        // 转换为带alpha的格式
        BufferedImage argbImage = new BufferedImage(
                frame.getWidth(),
                frame.getHeight(),
                BufferedImage.TYPE_INT_ARGB);

        Graphics2D g2d = argbImage.createGraphics();
        RenderQualityUtils.setupUltraQualityRendering(g2d);
        g2d.drawImage(frame, 0, 0, null);
        g2d.dispose();

        return argbImage;
    }

    /**
     * 将图像写入为PNG格式（高质量）
     */
    private void writeImageAsPNG(BufferedImage image, OutputStream out) throws IOException {
        ImageIO.write(image, "png", out);
    }

    /**
     * 获取当前使用的编码方式（用于调试）
     */
    public String getEncodingMethod() {
        if (transparent) {
            return "FFmpeg rawvideo RGBA管道 (透明通道: "
                    + (isProResAvailable() ? "ProRes 4444" : "PNG")
                    + "/MOV)";
        } else if (recorder != null) {
            return "JavaCV FFmpegFrameRecorder (高质量)";
        } else {
            return "FFmpeg PNG管道 (高质量备选)";
        }
    }

    @Override
    public void close() throws Exception {
        logger.info("关闭高质量视频导出器");

        // 先关闭输入管道，告知FFmpeg写入完毕
        if (ffmpegInput != null) {
            try {
                ffmpegInput.flush();
                ffmpegInput.close();
            } catch (IOException e) {
                // FFmpeg可能已崩溃导致管道关闭，忽略此错误
                logger.debug("关闭FFmpeg输入管道时(可能已关闭): {}", e.getMessage());
            }
        }

        // 等待FFmpeg进程结束
        if (ffmpegProcess != null) {
            try {
                int exitCode = ffmpegProcess.waitFor();
                if (exitCode != 0) {
                    logger.warn("FFmpeg进程退出码: {} (可能有错误，请查看上方 stderr 日志)", exitCode);
                } else {
                    logger.debug("FFmpeg进程正常退出");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                logger.warn("等待FFmpeg进程时被中断");
            }
        }

        // 关闭JavaCV录制器
        if (recorder != null) {
            try {
                recorder.stop();
                recorder.release();
                logger.debug("JavaCV录制器已关闭");
            } catch (Exception e) {
                logger.warn("关闭JavaCV录制器时出错: {}", e.getMessage());
            }
        }

        // 关闭帧转换器
        if (converter != null) {
            try {
                converter.close();
            } catch (Exception e) {
                logger.debug("关闭帧转换器时出错: {}", e.getMessage());
            }
        }
    }
}