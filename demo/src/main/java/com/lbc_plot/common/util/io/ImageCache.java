package com.lbc_plot.common.util.io;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 解码后图片的内存缓存（有容量上限的 LRU）。
 *
 * <h2>为什么需要它</h2>
 * 渲染一张预览图 / 一段视频时，同一个素材（背景、立绘）会被反复读取：
 * <ul>
 *   <li>前端每改一个字就重新请求一次预览图，而这条记录的背景/立绘根本没变；</li>
 *   <li>工程里几十条 Record 往往共用同一批立绘与背景；</li>
 *   <li>导出一条分层视频时，同一条记录会被渲染多次（FULL / UI_ONLY / BG…）。</li>
 * </ul>
 * 每次都要 {@code ImageIO.read} 从磁盘重新解码一张 1080p 背景（实测 ~60ms）或一张
 * 立绘（~20ms 起），这些时间在预览里占了很大一块。本类把解码结果按「文件路径 +
 * 修改时间 + 文件大小」缓存在内存里，命中时直接返回。
 *
 * <h2>为什么 key 里要带 mtime 与 size</h2>
 * 素材文件是会被覆盖的（重新上传、重新裁剪都会写回同一路径）。只用路径做 key 会让用户
 * 换图后仍看到旧图。带上修改时间与文件大小后，覆盖写必然产生新的 key，旧条目自然失效，
 * 不需要调用方在每个写入口手动清理缓存。
 *
 * <h2>线程安全与内存</h2>
 * <ul>
 *   <li>解码在锁外进行：多个线程同时读同一张图时最多重复解码几次，不会互相阻塞几十毫秒；</li>
 *   <li>缓存按「估算字节数」淘汰最久未使用的条目，上限由系统属性
 *       {@value #MAX_MB_PROPERTY} 控制（默认 {@value #DEFAULT_MAX_MB} MB，设为 0 关闭缓存）；</li>
 *   <li>单张图超过上限的 {@value #SINGLE_IMAGE_BUDGET_DIVISOR} 分之一时不入缓存，
 *       避免一张超大素材把整个缓存挤空。</li>
 * </ul>
 *
 * <h2>调用方约定</h2>
 * 返回的 {@link BufferedImage} <b>可能被多个调用方共享</b>，只能读、不能改
 * （不要对它 {@code createGraphics()} 后往上画）。需要改动时先复制一份。
 */
public final class ImageCache {

    private static final Logger logger = LoggerFactory.getLogger(ImageCache.class);

    /** 默认缓存上限（MB）。 */
    public static final int DEFAULT_MAX_MB = 192;

    /** 单张图最多占缓存上限的几分之一。 */
    private static final int SINGLE_IMAGE_BUDGET_DIVISOR = 4;

    /** 系统属性名：缓存上限（MB），用于现场排障与压测。 */
    public static final String MAX_MB_PROPERTY = "lbc.image.cache.mb";

    /** 访问顺序的 LRU：get 会把条目移到队尾，淘汰时从队头删。 */
    private static final Map<String, BufferedImage> CACHE = new LinkedHashMap<>(64, 0.75f, true);

    private static long cachedBytes = 0;
    private static long maxBytes = readMaxBytes();
    private static long hits = 0;
    private static long misses = 0;

    private ImageCache() {
    }

    /**
     * 读缓存；未命中返回 {@code null}。
     *
     * @param key 由 {@link #keyOf(File)} 生成的 key
     */
    public static synchronized BufferedImage get(String key) {
        if (maxBytes <= 0 || key == null) {
            return null;
        }
        BufferedImage cached = CACHE.get(key);
        if (cached != null) {
            hits++;
        } else {
            misses++;
        }
        return cached;
    }

    /**
     * 放入缓存（超限时淘汰最久未使用的条目）。
     *
     * @param key   由 {@link #keyOf(File)} 生成的 key
     * @param image 已解码的图像；为 {@code null} 时忽略
     */
    public static synchronized void put(String key, BufferedImage image) {
        if (image == null || key == null || maxBytes <= 0) {
            return;
        }
        long size = estimateBytes(image);
        if (size <= 0 || size > maxBytes / SINGLE_IMAGE_BUDGET_DIVISOR) {
            // 单张图太大：缓存它只会挤掉一堆更有用的图，不如不缓存
            return;
        }
        BufferedImage previous = CACHE.put(key, image);
        if (previous != null) {
            cachedBytes -= estimateBytes(previous);
        }
        cachedBytes += size;
        evictIfNeeded();
    }

    /**
     * 生成缓存 key：绝对路径 + 修改时间 + 文件大小。
     *
     * <p>文件不存在（或为空）时返回 {@code null}，表示"不缓存"，
     * 交给调用方按读不到处理。
     */
    public static String keyOf(File file) {
        if (file == null) {
            return null;
        }
        long modified = file.lastModified();
        long length = file.length();
        if (modified <= 0 || length <= 0) {
            return null;
        }
        return file.getAbsolutePath() + '|' + modified + '|' + length;
    }

    /** 清空整个缓存（素材批量替换、维护工具清理后调用）。 */
    public static synchronized void clear() {
        CACHE.clear();
        cachedBytes = 0;
    }

    /** 缓存命中统计，供诊断接口/日志使用。 */
    public static synchronized Stats stats() {
        return new Stats(CACHE.size(), cachedBytes, maxBytes, hits, misses);
    }

    /** 重置命中统计（测试用）。 */
    public static synchronized void resetStats() {
        hits = 0;
        misses = 0;
    }

    /** 运行期统计快照。 */
    public static final class Stats {
        public final int entries;
        public final long bytes;
        public final long maxBytes;
        public final long hits;
        public final long misses;

        Stats(int entries, long bytes, long maxBytes, long hits, long misses) {
            this.entries = entries;
            this.bytes = bytes;
            this.maxBytes = maxBytes;
            this.hits = hits;
            this.misses = misses;
        }

        @Override
        public String toString() {
            return String.format("ImageCache{entries=%d, %d/%d MB, hits=%d, misses=%d}",
                    entries, bytes / (1024 * 1024), maxBytes / (1024 * 1024), hits, misses);
        }
    }

    /**
     * 从磁盘读图并写入缓存；解码失败时把原始异常抛给调用方（失败结果不缓存）。
     *
     * @param file   图片文件
     * @param loader 真正的解码逻辑
     */
    static BufferedImage load(File file, Decoder loader) throws IOException {
        String key = keyOf(file);
        if (key == null) {
            // 文件不存在/为空：直接交给解码器抛出带原因的错误
            return normalize(loader.decode(file));
        }
        BufferedImage cached = get(key);
        if (cached != null) {
            return cached;
        }
        BufferedImage image = normalize(loader.decode(file));
        put(key, image);
        return image;
    }

    /** 解码函数式接口。 */
    interface Decoder {
        BufferedImage decode(File file) throws IOException;
    }

    /**
     * 把解码结果规整成"批量像素操作友好"的标准类型。
     *
     * <p>{@code ImageIO} 读带 alpha 的 PNG 通常返回 {@link BufferedImage#TYPE_4BYTE_ABGR}，
     * 而后续渲染大量使用 {@code getRGB(0,0,w,h,...)} 这类整幅像素操作（压暗、透明边界裁剪、
     * PNG 编码）。非标准类型要走逐像素颜色模型转换：一张 650×1417 的立绘取+写一遍像素
     * 约 13ms，换成 {@code TYPE_INT_ARGB} 约 9ms；更要紧的是 {@code TYPE_INT_ARGB} 能直接操作
     * 底层 int 数组，{@link com.lbc_plot.common.util.ImageDarkener} 因此从 22ms 降到 3ms。
     *
     * <p>转换是逐像素无损的（两种类型都是 8 位非预乘 ARGB），只在缓存未命中时做一次，
     * 之后所有请求都复用同一张标准类型的图。
     */
    private static BufferedImage normalize(BufferedImage image) {
        if (image == null) {
            return null;
        }
        final int type = image.getType();
        if (type == BufferedImage.TYPE_INT_ARGB || type == BufferedImage.TYPE_INT_RGB
                || type == BufferedImage.TYPE_3BYTE_BGR) {
            return image;
        }
        final int width = image.getWidth();
        final int height = image.getHeight();
        final boolean hasAlpha = image.getColorModel().hasAlpha();
        try {
            final BufferedImage converted;
            if (hasAlpha) {
                // 带 alpha 时不能用 drawImage 转换：合成过程会先预乘再除回去，
                // 半透明像素（立绘边缘的羽化区）会因取整而偏移 ±1。整幅取/写像素是精确的。
                converted = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
                int[] pixels = image.getRGB(0, 0, width, height, null, 0, width);
                converted.setRGB(0, 0, width, height, pixels, 0, width);
            } else {
                // 不透明图没有预乘问题，drawImage 更快
                converted = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
                java.awt.Graphics2D g2d = converted.createGraphics();
                try {
                    g2d.drawImage(image, 0, 0, null);
                } finally {
                    g2d.dispose();
                }
            }
            return converted;
        } catch (RuntimeException e) {
            // 转换失败（极端尺寸/内存不足）：保留原图，功能优先
            logger.debug("素材类型规整失败，使用原图: {}", e.getMessage());
            return image;
        }
    }

    /** 运行时改写上限（测试用；0 表示关闭）。改动会立即按新上限淘汰。 */
    static synchronized void setMaxBytes(long bytes) {
        maxBytes = Math.max(0, bytes);
        evictIfNeeded();
    }

    /** 估算一张图占用的内存字节数。 */
    private static long estimateBytes(BufferedImage image) {
        long pixels = (long) image.getWidth() * image.getHeight();
        int bytesPerPixel = Math.max(1, (image.getColorModel().getPixelSize() + 7) / 8);
        return pixels * bytesPerPixel;
    }

    /** 从队头（最久未使用）开始淘汰，直到总字节数回到上限以内。 */
    private static void evictIfNeeded() {
        if (cachedBytes <= maxBytes) {
            return;
        }
        Iterator<Map.Entry<String, BufferedImage>> it = CACHE.entrySet().iterator();
        while (it.hasNext() && cachedBytes > maxBytes) {
            Map.Entry<String, BufferedImage> entry = it.next();
            cachedBytes -= estimateBytes(entry.getValue());
            it.remove();
        }
    }

    private static long readMaxBytes() {
        String raw = System.getProperty(MAX_MB_PROPERTY);
        int mb = DEFAULT_MAX_MB;
        if (raw != null && !raw.isBlank()) {
            try {
                mb = Integer.parseInt(raw.trim());
            } catch (NumberFormatException e) {
                logger.warn("{} 不是合法整数: {}，使用默认值 {}MB", MAX_MB_PROPERTY, raw, DEFAULT_MAX_MB);
            }
        }
        if (mb <= 0) {
            logger.info("图片内存缓存已关闭（{}={}）", MAX_MB_PROPERTY, raw);
            return 0;
        }
        logger.info("图片内存缓存上限: {}MB", mb);
        return (long) mb * 1024 * 1024;
    }
}
