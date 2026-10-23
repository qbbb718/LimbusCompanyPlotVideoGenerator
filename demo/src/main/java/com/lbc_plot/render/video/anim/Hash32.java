package com.lbc_plot.render.video.anim;

/**
 * @module 立绘动画求值内核
 * 确定性整数哈希（抖动/噪波用）。
 *
 * <h2>为什么必须是整数哈希</h2>
 * 抖动的轨迹要"每次导出都一样、预览和成片一样、换机器也一样"，所以随机数只能由
 * {@code (seed, 帧号, 轴)} 算出，不能用 {@code Random}、也不能用 {@code Math.sin(seed)} 这类
 * 浮点技巧——Java 与 JS 的 {@code sin} 在最后一位可能不同，6 位小数的对拍会随机失败。
 *
 * <h2>跨语言一致性</h2>
 * 全部运算都在 **32 位有符号整数**上：
 * <ul>
 *   <li>Java 的 {@code int * int} 天然补码截断；</li>
 *   <li>JS 必须用 {@code Math.imul(a, b)}（用 {@code *} 会先升格成 double，溢出部分丢失）；</li>
 *   <li>无符号化时 JS 用 {@code >>> 0}，Java 用 {@code & 0xFFFFFFFFL}。</li>
 * </ul>
 *
 * <p>与前端 {@code features/record/animation/hash32.ts} 逐行对应。
 */
public final class Hash32 {

    private Hash32() {
    }

    /**
     * MurmurHash3 的 finalizer（雪崩混合）。
     *
     * <p>直接用 {@code i} 当随机数会看出明显规律（相邻帧的偏移只差一点点），混合之后才是"白噪声"。
     */
    public static int fmix32(int h) {
        h ^= h >>> 16;
        h *= 0x85ebca6b;
        h ^= h >>> 13;
        h *= 0xc2b2ae35;
        h ^= h >>> 16;
        return h;
    }

    /**
     * 取一个 [0, 1) 的确定性随机数。
     *
     * @param seed  工程里存的随机种子（缺省由编辑器掷出并入库）
     * @param index 变化的整数（抖动用"第几次换向"，即 {@code floor(local / periodFrames)}）
     * @param axis  轴号（x=0 / y=1 / rotate=2 …），让同一帧的不同轴拿到不同的值
     */
    public static double hash01(long seed, int index, int axis) {
        int bits = fmix32(index * 374761393 + (int) seed * 668265263 + axis);
        return (bits & 0xFFFFFFFFL) / 4294967296d;
    }

    /** 取一个 [-1, 1) 的确定性随机数 */
    public static double signed(long seed, int index, int axis) {
        return hash01(seed, index, axis) * 2d - 1d;
    }
}
