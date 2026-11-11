package com.lbc_plot.render.video;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;

import com.lbc_plot.plot.model.Record;

/**
 * @model T 巢滤镜（{@link EffectVisual#TYPE_T_CORP_FILTER}）
 *
 * <h2>它是什么</h2>
 * 把整幅画面压成 T 巢（T Corp）那种<b>棕褐色老照片</b>色调：先按 Rec.601 权重算出亮度，
 * 再把亮度映射成一条"暗部偏红褐、亮部偏米白"的单色带。只做逐像素的点运算：
 * 不改几何、不读时钟、不读随机数，因此**同一条记录、同一帧，无论渲多少次、什么分辨率，
 * 结果都一样**（前后端各算一次也是同一张表）。
 *
 * <h2>只染"画面层"，UI 不参与</h2>
 * 调用点在 {@code RenderOfImage} 的两趟合成之间：第一趟把<b>背景 / 立绘 / 临时图片</b>合成成
 * 场景画布，调色就作用在这一张画布上；第二趟才把场景缩到 80% 叠上<b>对话框、地点牌、角色名片、
 * 台词文字</b>。所以"UI 不被染色"是<b>结构性的</b>（UI 还没画上去），不是靠逐层判断排除的——
 * 与 {@link CameraShake} 只晃世界层是同一个思路。
 *
 * <p>边框暗角（{@code buildBorderMask}）画在场景画布上，但它在调色<b>之后</b>才压上去
 * （见 {@code RenderOfImage#composeSceneCanvas}），因此遮罩保持纯黑，不会被染成 #070300。
 *
 * <h2>曲线从哪来</h2>
 * 不是拍脑袋定的两个端点，而是从参考画面（T 巢场景截图）按亮度分箱取 RGB 中位数拟合出来的
 * 16 个控制点，见 {@link #CONTROL_LUMA} / {@link #CONTROL_RGB}。两点线性插值做不出
 * "暗部 R:G:B ≈ 1:0.4:0、亮部 ≈ 1:0.93:0.84" 这种随亮度变化的色偏（实测中段暖色偏
 * 比两点线性强约一倍），所以这里直接存曲线。
 *
 * <h2>与前端逐像素对拍</h2>
 * 浏览器侧用一张等价的 SVG 滤镜：{@code feColorMatrix}（同一个 Rec.601 矩阵）+
 * {@code feComponentTransfer}（同样 16 个控制点插值出来的 256 级表），见
 * {@code preview/tCorpFilter.ts}。两边都从控制点导出 256 级查找表，公式相同：
 * <pre>
 *   y = round(0.299R + 0.587G + 0.114B)        // 0~255
 *   (R', G', B') = TABLE[y]                    // alpha 原样保留
 * </pre>
 *
 * <h2>性能</h2>
 * 每个像素只做"三乘一加 + 一次查表"（表在类加载时算好），1080p 一帧是 2M 次查表，
 * 实测约 2~4 ms；而且一帧只对<b>场景画布</b>调色一次，UI 层与整块输出不会再跑一遍。
 * 关掉时不查表（{@link #applyInPlace} 根本不会被调用），逐像素与改造前一致。
 *
 * @relatesTo com.lbc_plot.render.engine.RenderOfImage#composeSceneCanvas
 */
public final class TCorpFilter {

    /**
     * 控制点的亮度位置（0~1，递增），与 {@link #CONTROL_RGB} 一一对应。
     *
     * <p>末端两点的颜色几乎相同（(251,225,202) → (251,233,210)）：参考画面的高光已经贴到
     * 255，这一段是"软肩"，避免把白衬衫压成一块死白。
     */
    private static final double[] CONTROL_LUMA = {
            0.000, 0.015, 0.045, 0.080, 0.125, 0.185, 0.260, 0.350,
            0.450, 0.560, 0.670, 0.760, 0.835, 0.900, 0.965, 1.000
    };

    /** 控制点的目标颜色（0~255，R/G/B 顺序）：暗部偏红、亮部偏米白 */
    private static final int[][] CONTROL_RGB = {
            { 7, 3, 0 }, { 10, 5, 0 }, { 17, 11, 4 }, { 25, 18, 11 },
            { 38, 28, 20 }, { 65, 41, 26 }, { 85, 60, 42 }, { 106, 83, 66 },
            { 132, 108, 91 }, { 164, 136, 116 }, { 194, 165, 143 }, { 218, 189, 166 },
            { 235, 206, 183 }, { 251, 225, 202 }, { 251, 233, 210 }, { 251, 233, 210 }
    };

    /**
     * 256 级查找表（下标 = 亮度 0~255，值 = 打包好的 {@code 0x00RRGGBB}）。
     *
     * <p>类加载时算一次：16 个控制点插值 256 次远比"每帧、每像素插值"便宜。
     * 表里已强制单调（见 {@link #buildTable()}），保证暗→亮的映射不会反相。
     */
    private static final int[] TABLE = buildTable();

    private TCorpFilter() {
    }

    /**
     * @function 这条记录是否开启了 T 巢滤镜
     *
     * @param record 记录（可为 null）
     * @return {@code record.effects} 里存在已启用的 {@link EffectVisual#TYPE_T_CORP_FILTER} 时 true
     */
    public static boolean isActive(Record record) {
        if (record == null || record.getEffects() == null) {
            return false;
        }
        for (EffectVisual effect : record.getEffects()) {
            if (effect != null && effect.isTCorpFilter()) {
                return true;
            }
        }
        return false;
    }

    /**
     * @function 就地把一张图调成 T 巢色调。
     *
     * <p><b>会修改入参</b>：只用在"刚由 {@code FrameComposerService.compose()} 新分配、没人共享"
     * 的场景画布上，省掉一张 1080p（8MB）的中间图。要保留原图请用 {@link #apply(BufferedImage)}。
     *
     * <p>alpha 原样保留：全透明像素直接跳过（不给它塞颜色，缩小时也不会把颜色渗到边上），
     * 半透明像素（立绘边缘）只改 RGB 不改 alpha。
     *
     * @param image 待调色的图（可为 null，null 时什么都不做）
     */
    public static void applyInPlace(BufferedImage image) {
        if (image == null) {
            return;
        }
        if (image.getRaster().getDataBuffer() instanceof DataBufferInt buffer) {
            int[] pixels = buffer.getData();
            for (int i = 0; i < pixels.length; i++) {
                int argb = pixels[i];
                if ((argb & 0xFF000000) == 0) {
                    continue; // 全透明：没有颜色可染
                }
                int r = (argb >> 16) & 0xFF;
                int g = (argb >> 8) & 0xFF;
                int b = argb & 0xFF;
                // 与前端 feColorMatrix 同一个 Rec.601 矩阵，+500 是为了四舍五入
                int y = (299 * r + 587 * g + 114 * b + 500) / 1000;
                pixels[i] = (argb & 0xFF000000) | TABLE[y];
            }
            return;
        }
        // 兜底：非 int 缓冲（正常渲染路径不会走到，这里只保证正确性）
        int width = image.getWidth();
        int height = image.getHeight();
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int argb = image.getRGB(x, y);
                if ((argb & 0xFF000000) == 0) {
                    continue;
                }
                int r = (argb >> 16) & 0xFF;
                int g = (argb >> 8) & 0xFF;
                int b = argb & 0xFF;
                int luma = (299 * r + 587 * g + 114 * b + 500) / 1000;
                image.setRGB(x, y, (argb & 0xFF000000) | TABLE[luma]);
            }
        }
    }

    /**
     * @function 返回调色后的副本（不改入参）。
     *
     * @param image 原图
     * @return 新的 ARGB 图；{@code image} 为 null 时返回 null
     */
    public static BufferedImage apply(BufferedImage image) {
        if (image == null) {
            return null;
        }
        BufferedImage copy = new BufferedImage(image.getWidth(), image.getHeight(),
                BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2d = copy.createGraphics();
        try {
            g2d.drawImage(image, 0, 0, null);
        } finally {
            g2d.dispose();
        }
        applyInPlace(copy);
        return copy;
    }

    /**
     * @function 某个亮度对应的目标颜色（供测试与前端对拍使用）
     *
     * @param luma 亮度 0~255（越界会被夹住）
     * @return 打包好的 {@code 0x00RRGGBB}
     */
    public static int colorOf(int luma) {
        int index = Math.max(0, Math.min(255, luma));
        return TABLE[index];
    }

    /** 控制点的亮度位置（只读副本，供测试对拍前端的表） */
    public static double[] controlLuma() {
        return CONTROL_LUMA.clone();
    }

    /** 控制点的颜色（只读副本，深拷贝） */
    public static int[][] controlRgb() {
        int[][] copy = new int[CONTROL_RGB.length][];
        for (int i = 0; i < CONTROL_RGB.length; i++) {
            copy[i] = CONTROL_RGB[i].clone();
        }
        return copy;
    }

    /**
     * 由控制点插值出 256 级查找表，并强制每个通道单调不减。
     *
     * <p>为什么强制单调：参考画面高光区那两个控制点有 ±1 的抖动（251 → 250），
     * 不处理的话亮部会出现一个 1/255 的"回跌"，肉眼看不出但测试会很脆；
     * 顺手也保证"更亮的地方一定不会更暗"这条不变量。
     */
    private static int[] buildTable() {
        int[] table = new int[256];
        int[] previous = { CONTROL_RGB[0][0], CONTROL_RGB[0][1], CONTROL_RGB[0][2] };
        for (int i = 0; i < 256; i++) {
            double luma = i / 255.0;
            int r = Math.max(previous[0], (int) Math.round(interpolate(luma, 0)));
            int g = Math.max(previous[1], (int) Math.round(interpolate(luma, 1)));
            int b = Math.max(previous[2], (int) Math.round(interpolate(luma, 2)));
            r = Math.min(255, r);
            g = Math.min(255, g);
            b = Math.min(255, b);
            previous[0] = r;
            previous[1] = g;
            previous[2] = b;
            table[i] = (r << 16) | (g << 8) | b;
        }
        return table;
    }

    /** 在控制点上线性插值：{@code luma} 落在相邻两点之间，取 {@code channel} 通道。 */
    private static double interpolate(double luma, int channel) {
        int last = CONTROL_LUMA.length - 1;
        if (luma <= CONTROL_LUMA[0]) {
            return CONTROL_RGB[0][channel];
        }
        if (luma >= CONTROL_LUMA[last]) {
            return CONTROL_RGB[last][channel];
        }
        for (int i = 0; i < last; i++) {
            double left = CONTROL_LUMA[i];
            double right = CONTROL_LUMA[i + 1];
            if (luma >= left && luma <= right) {
                double span = right - left;
                double t = span <= 0 ? 1.0 : (luma - left) / span;
                double from = CONTROL_RGB[i][channel];
                double to = CONTROL_RGB[i + 1][channel];
                return from + (to - from) * t;
            }
        }
        return CONTROL_RGB[last][channel];
    }
}
