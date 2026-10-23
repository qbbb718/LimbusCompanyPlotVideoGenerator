package com.lbc_plot.common.util;

import java.awt.image.BufferedImage;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * @module 立绘动画渲染支撑
 * 立绘 / 临时图片的「预缩放图」与「压暗图」缓存。
 *
 * <h2>为什么必须有这个缓存</h2>
 * 动画把"整段只画一次静态层"变成了"逐帧重画"。旧路径里这两个操作每帧各做一次全图重采样 /
 * 整幅像素遍历：
 * <ul>
 *   <li>{@code RenderQualityUtils.scaleImageHighQuality(image, scale)} —— 双三次重采样，1080p 立绘约数毫秒；</li>
 *   <li>{@code ImageDarkener.darkenImage(image, 0.5f)} —— 遍历全部像素并新建一张图。</li>
 * </ul>
 * 一段 5 秒的记录（150 帧）就会白烧几百毫秒到几秒，而结果每次都一样。
 *
 * <h2>键与生命周期</h2>
 * 以**源图身份**为键（{@link WeakHashMap}），源图被立绘/临时图片对象释放后缓存自动回收；
 * 每个源图下按参数（缩放比例 / 压暗比例）分档，最多保留 {@value #MAX_VARIANTS_PER_IMAGE} 档，
 * 超出按 LRU 淘汰——防止某个滑杆被拖过几十个值后缓存无限膨胀。
 *
 * <p>缓存的图像**永远不被修改**（只用于 {@code drawImage}），所以可以安全共享给多帧、多任务。
 */
public final class SpriteImageCache {

    /** 每个源图最多缓存多少个参数档位 */
    private static final int MAX_VARIANTS_PER_IMAGE = 8;

    /** 缩放比例比较/分档精度：0.0001（与"缩放为 1 就不复制"的容差一致） */
    private static final long SCALE_KEY_FACTOR = 10_000L;

    private static final Map<BufferedImage, Map<Long, BufferedImage>> SCALED =
            Collections.synchronizedMap(new WeakHashMap<>());

    private static final Map<BufferedImage, Map<Long, BufferedImage>> DARKENED =
            Collections.synchronizedMap(new WeakHashMap<>());

    private SpriteImageCache() {
    }

    /**
     * 取缩放后的图（相当于旧的 {@code scaleImageHighQuality(image, scale)}，但命中缓存）。
     *
     * @param scale 1.0 附近直接返回源图（与旧路径"缩放为 1 时不复制"的行为一致）
     */
    public static BufferedImage scaled(BufferedImage source, float scale) {
        if (source == null) {
            return null;
        }
        if (Math.abs(scale - 1.0f) < 1e-4f) {
            return source;
        }
        long key = Math.round(scale * SCALE_KEY_FACTOR);
        return cached(SCALED, source, key, () -> RenderQualityUtils.scaleImageHighQuality(source, scale));
    }

    /**
     * 取压暗后的图（相当于 {@code ImageDarkener.darkenImage(image, ratio)}，但命中缓存）。
     *
     * @param ratio 0.5 = 压暗一半（与旧路径一致）；非法值按 0.5
     */
    public static BufferedImage darkened(BufferedImage source, float ratio) {
        if (source == null) {
            return null;
        }
        float safeRatio = Float.isFinite(ratio) ? ratio : 0.5f;
        long key = Math.round(safeRatio * SCALE_KEY_FACTOR);
        return cached(DARKENED, source, key,
                () -> {
                    BufferedImage darkened = ImageDarkener.darkenImage(source, safeRatio);
                    // 压暗失败时退回源图：调用方拿到的一定是非 null，避免"角色整块消失"
                    return darkened == null ? source : darkened;
                });
    }

    /** 清空缓存（仅测试用：验证"缓存与否结果一致"） */
    public static void clear() {
        SCALED.clear();
        DARKENED.clear();
    }

    /** 当前缓存条目数（仅测试/日志用） */
    public static int size() {
        int total = 0;
        synchronized (SCALED) {
            for (Map<Long, BufferedImage> variants : SCALED.values()) {
                total += variants.size();
            }
        }
        synchronized (DARKENED) {
            for (Map<Long, BufferedImage> variants : DARKENED.values()) {
                total += variants.size();
            }
        }
        return total;
    }

    private static BufferedImage cached(Map<BufferedImage, Map<Long, BufferedImage>> cache,
            BufferedImage source, long key, java.util.function.Supplier<BufferedImage> producer) {
        Map<Long, BufferedImage> variants;
        synchronized (cache) {
            variants = cache.get(source);
            if (variants == null) {
                variants = new LinkedHashMap<Long, BufferedImage>(8, 0.75f, true) {
                    @Override
                    protected boolean removeEldestEntry(Map.Entry<Long, BufferedImage> eldest) {
                        return size() > MAX_VARIANTS_PER_IMAGE;
                    }
                };
                cache.put(source, variants);
            }
        }
        synchronized (variants) {
            BufferedImage cachedImage = variants.get(key);
            if (cachedImage == null) {
                cachedImage = producer.get();
                if (cachedImage != null) {
                    variants.put(key, cachedImage);
                }
            }
            return cachedImage;
        }
    }

    static {
        // 缓存只在进程内共享、不持久化：换工程/换素材后源图对象会变，弱引用键自然失效
    }
}
