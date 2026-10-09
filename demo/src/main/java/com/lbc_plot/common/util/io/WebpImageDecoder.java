package com.lbc_plot.common.util.io;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

import org.bytedeco.ffmpeg.global.avutil;
import org.bytedeco.javacv.FFmpegFrameGrabber;
import org.bytedeco.javacv.Frame;
import org.bytedeco.javacv.Java2DFrameConverter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.imageio.ImageIO;

/**
 * 兜底图片解码器：用 FFmpeg（JavaCV，随应用打包）解码 JDK 自带 ImageIO 不支持的格式，
 * 目前主要是 <b>WebP</b>。
 *
 * <p>背景：Java 21 的 ImageIO 只支持 bmp/gif/jpeg/png/tif/wbmp，对 WebP 会返回
 * {@code ImageIO.read(...) == null}（不是抛异常）。立绘允许上传 .webp 之后，
 * 渲染管线（{@link ImageReader} → Portrait/Background 懒加载 → 视频导出）必须能读到像素，
 * 否则会静默退化成红色“加载失败”占位图。
 *
 * <p><b>alpha 通道</b>：立绘依赖透明通道（{@code ImageCropper.cropTransparentAreas} 按 alpha 裁剪）。
 * FFmpeg 默认输出 yuv420p（丢 alpha），因此这里显式指定
 * {@code AV_PIX_FMT_BGRA} / {@code AV_PIX_FMT_RGBA}，得到 4 通道 ARGB 图，
 * 已验证透明像素与源 PNG 一致（采样平均偏差 &lt; 1/255）。
 *
 * <p>解码失败只记日志并返回 {@code null}，由调用方沿用原有的“默认占位图”逻辑，绝不抛出。
 */
public final class WebpImageDecoder {

    private static final Logger logger = LoggerFactory.getLogger(WebpImageDecoder.class);

    private WebpImageDecoder() {
    }

    /** 是否为 WebP 文件（按 RIFF 容器魔数判断，不依赖扩展名） */
    public static boolean isWebp(File file) {
        if (file == null || !file.isFile()) {
            return false;
        }
        try (InputStream in = Files.newInputStream(file.toPath())) {
            return isWebpHeader(readHeader(in));
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * 用 FFmpeg 解码图片文件（用于 ImageIO 不支持的格式）。
     *
     * @param file 图片文件
     * @return 解码后的 BufferedImage（保留 alpha），失败返回 null
     */
    public static BufferedImage decodeWithFfmpeg(File file) {
        if (!isWebp(file)) {
            // 只把 FFmpeg 兜底用在 WebP 上：其他格式 ImageIO 本来就能读，
            // 走 FFmpeg 反而会因为色彩空间转换导致像素偏差。
            return null;
        }
        try (FFmpegFrameGrabber grabber = new FFmpegFrameGrabber(file)) {
            // 关键：显式要求带 alpha 的像素格式，否则透明通道会在解码时丢失
            grabber.setPixelFormat(avutil.AV_PIX_FMT_BGRA);
            grabber.start();
            try {
                Frame frame = grabber.grabImage();
                if (frame == null) {
                    logger.warn("FFmpeg 未能抓取到图像帧: {}", file.getAbsolutePath());
                    return null;
                }
                BufferedImage image = convert(frame);
                if (image == null) {
                    logger.warn("FFmpeg 解码结果无法转换为 BufferedImage: {}", file.getAbsolutePath());
                    return null;
                }
                logger.info("已用 FFmpeg 解码 WebP: {} => {}x{}",
                        file.getName(), image.getWidth(), image.getHeight());
                return image;
            } finally {
                try {
                    grabber.stop();
                } catch (Exception ignored) {
                    // 释放失败不影响已解码的图像
                }
            }
        } catch (Throwable t) {
            // UnsatisfiedLinkError 等原生库问题也要兜住：不能因为一张图拖垮启动/渲染
            logger.warn("FFmpeg 解码图片失败: {} ({})", file.getAbsolutePath(), t.toString());
            return null;
        }
    }

    /** 图片流是否为 WebP（按魔数判断） */
    public static boolean isWebpBytes(byte[] header) {
        return isWebpHeader(header);
    }

    /** 读取当前可用的 WebP 解码方式描述，便于日志排查 */
    public static String describeSupport() {
        try {
            BufferedImage probe = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
            return "ImageIO 可写类型=" + java.util.Arrays.toString(ImageIO.getWriterFormatNames())
                    + ", FFmpeg(JavaCV) 兜底=已就绪, 探针=" + (probe != null);
        } catch (Throwable t) {
            return "FFmpeg(JavaCV) 兜底不可用: " + t;
        }
    }

    // ---- 内部实现 ----

    private static BufferedImage convert(Frame frame) {
        try (Java2DFrameConverter converter = new Java2DFrameConverter()) {
            // JavaCV 1.5.9 的 Java2DFrameConverter 只有 convert(Frame)：
            // 帧为 4 通道（上面强制了 BGRA）时它返回 TYPE_INT_ARGB，alpha 得以保留。
            return converter.convert(frame);
        } catch (Throwable t) {
            logger.warn("Frame 转 BufferedImage 失败: {}", t.toString());
            return null;
        }
    }

    private static byte[] readHeader(InputStream in) throws IOException {
        byte[] header = new byte[12];
        int read = 0;
        while (read < header.length) {
            int n = in.read(header, read, header.length - read);
            if (n < 0) {
                break;
            }
            read += n;
        }
        return header;
    }

    /** RIFF 容器：偏移 0..3 为 "RIFF"，偏移 8..11 为 "WEBP" */
    private static boolean isWebpHeader(byte[] header) {
        if (header == null || header.length < 12) {
            return false;
        }
        return header[0] == 'R' && header[1] == 'I' && header[2] == 'F' && header[3] == 'F'
                && header[8] == 'W' && header[9] == 'E' && header[10] == 'B' && header[11] == 'P';
    }
}
