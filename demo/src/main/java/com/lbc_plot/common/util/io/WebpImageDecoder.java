package com.lbc_plot.common.util.io;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
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
 * FFmpeg 默认输出 yuv420p（丢 alpha），因此这里显式指定 {@code AV_PIX_FMT_BGRA}，
 * 得到 4 通道 BGRA 数据。
 *
 * <p><b>为什么不再用 {@link Java2DFrameConverter}</b>：该转换器按“通道数 + 位深”猜目标
 * AWT 类型，对 BGRA 帧它会走“自定义 ColorModel”分支，把首字节当成红通道，于是
 * <em>BGRA 被当成 ARGB 解读</em>：源图中 alpha=255 的不透明像素变成“红色 + alpha≈0”，
 * 立绘整体呈半透明红色“加载失败”外观（实测不透明像素被错读为 alpha=8、红色被放大）。
 * 这里改为直接依据 BGRA 字节序组装 {@link BufferedImage#TYPE_INT_ARGB}，
 * 通道顺序与 alpha 都由本类自己保证。
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
        return decodeWebpData(file, file);
    }

    /**
     * 解码「不在磁盘上」的 WebP 字节流（例如打进 jar 的 classpath 资源）。
     *
     * <p>FFmpeg 需要可寻址的输入，因此先把字节落到临时文件，解码后立即删除；
     * 只有 ImageIO 读不出来且确认为 WebP 时才会走到这里。
     *
     * @param imageBytes WebP 完整字节
     * @param source     仅用于日志的来源描述
     * @return 解码后的 BufferedImage（保留 alpha），失败返回 null
     */
    public static BufferedImage decodeWebpBytes(byte[] imageBytes, Object source) {
        if (imageBytes == null || imageBytes.length < 12 || !isWebpHeader(imageBytes)) {
            return null;
        }
        File temp = null;
        try {
            temp = File.createTempFile("lbc-webp-", ".webp");
            Files.write(temp.toPath(), imageBytes);
            return decodeWebpData(temp, source);
        } catch (IOException e) {
            logger.warn("WebP 字节流转临时文件失败: {} ({})", source, e.toString());
            return null;
        } finally {
            if (temp != null && !temp.delete()) {
                temp.deleteOnExit();
            }
        }
    }

    /**
     * 真正的解码逻辑。
     *
     * @param input  FFmpeg 读取的文件
     * @param source 日志里显示的名称（字节流场景下 input 是临时文件）
     */
    private static BufferedImage decodeWebpData(File input, Object source) {
        try (FFmpegFrameGrabber grabber = new FFmpegFrameGrabber(input)) {
            // 关键：显式要求带 alpha 的像素格式，否则透明通道会在解码时丢失
            grabber.setPixelFormat(avutil.AV_PIX_FMT_BGRA);
            grabber.start();
            try {
                Frame frame = grabber.grabImage();
                if (frame == null) {
                    logger.warn("FFmpeg 未能抓取到图像帧: {}", source);
                    return null;
                }
                BufferedImage image = toBufferedImage(frame);
                if (image == null) {
                    logger.warn("FFmpeg 解码结果无法转换为 BufferedImage: {}", source);
                    return null;
                }
                logger.info("已用 FFmpeg 解码 WebP: {} => {}x{}",
                        source, image.getWidth(), image.getHeight());
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
            logger.warn("FFmpeg 解码图片失败: {} ({})", source, t.toString());
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

    /**
     * 把 FFmpeg 抓到的帧转成 BufferedImage。
     *
     * <p>BGRA（上面显式指定的格式）走手写路径，保证通道顺序与 alpha 正确；
     * 其它形态（理论上不会出现）才退回 JavaCV 的转换器，作为兜底。
     */
    private static BufferedImage toBufferedImage(Frame frame) {
        if (frame == null || frame.image == null || frame.image.length == 0) {
            return null;
        }
        if (frame.imageChannels == 4 && frame.image[0] instanceof ByteBuffer) {
            return bgraToArgb(frame, (ByteBuffer) frame.image[0]);
        }
        logger.debug("帧格式非 BGRA（channels={}），退回 JavaCV 转换器", frame.imageChannels);
        try (Java2DFrameConverter converter = new Java2DFrameConverter()) {
            return converter.convert(frame);
        } catch (Throwable t) {
            logger.warn("Frame 转 BufferedImage 失败: {}", t.toString());
            return null;
        }
    }

    /**
     * BGRA 字节流 → {@link BufferedImage#TYPE_INT_ARGB}。
     *
     * <p>逐行读取：{@code imageStride} 可能大于 {@code width * 4}（FFmpeg 的字节对齐填充），
     * 因此不能把整块字节当成连续像素处理。
     */
    private static BufferedImage bgraToArgb(Frame frame, ByteBuffer buffer) {
        int width = frame.imageWidth;
        int height = frame.imageHeight;
        int stride = frame.imageStride;
        if (width <= 0 || height <= 0 || stride <= 0) {
            return null;
        }
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        int[] row = new int[width];
        for (int y = 0; y < height; y++) {
            int base = y * stride;
            for (int x = 0; x < width; x++) {
                int i = base + x * 4;
                int b = buffer.get(i) & 0xFF;
                int g = buffer.get(i + 1) & 0xFF;
                int r = buffer.get(i + 2) & 0xFF;
                int a = buffer.get(i + 3) & 0xFF;
                row[x] = (a << 24) | (r << 16) | (g << 8) | b;
            }
            image.setRGB(0, y, width, 1, row, 0, width);
        }
        return image;
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
