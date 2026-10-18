package com.lbc_plot.render.video;

import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.plot.model.Record;

/**
 * @module 视频渲染 - 记录起始转场
 *
 *         <p>"起始转场"是一类记录级特效：勾选后，本条记录导出视频时会在开头 {@link #FRAMES} 帧里，
 *         往<b>自己原本的画面之上</b>叠一层图像，并让这层图像的不透明度从 100% 线性降到 0%，
 *         于是视频从"叠加层画面"过渡到"本条记录的画面"。按叠加内容分三种：
 *         <ul>
 *         <li><b>交叉溶解</b>（{@link EffectVisual#TYPE_CROSS_DISSOLVE}）：叠<b>上一条记录的最后一帧</b>，
 *         把硬切变成叠化；</li>
 *         <li><b>黑屏转场</b>（{@link EffectVisual#TYPE_FADE_FROM_BLACK}）：叠一层纯黑，即从黑屏淡入；</li>
 *         <li><b>白屏转场</b>（{@link EffectVisual#TYPE_FADE_FROM_WHITE}）：叠一层纯白，即从白屏淡入。</li>
 *         </ul>
 *
 *         <p>规则：
 *         <ul>
 *         <li>淡出只占记录开头 {@link #FRAMES} 帧（30fps 下约 0.67 秒），不延长记录时长，
 *         后面的帧完全是记录自己的画面；</li>
 *         <li>第 0 帧不透明度 100%，第 {@code FRAMES - 1} 帧降到 0%（线性、含两端），之后不再叠加；</li>
 *         <li>交叉溶解需要"上一条记录"，第一条记录即使勾选也不叠加；黑屏/白屏不依赖其它记录，
 *         第一条记录同样生效；</li>
 *         <li>三种转场互斥（前端勾一种会取消其它两种）。如果工程文件里同时存在多种，
 *         按 <b>交叉溶解 &gt; 黑屏 &gt; 白屏</b> 的优先级取一种并打警告日志。</li>
 *         </ul>
 *
 * @relatesTo EffectVisual
 */
public final class StartTransition {

    private static final Logger logger = LoggerFactory.getLogger(StartTransition.class);

    /**
     * 转场帧数：开头这 20 帧里叠加层的不透明度从 100% 线性降到 0%。
     *
     * <p>帧数是固定的（与帧率无关）：用户说的"共 20 帧"就是这里；帧率越高这段转场越短。
     */
    public static final int FRAMES = 20;

    /** 转场叠加层的内容 */
    public enum Kind {
        /** 没有启用任何起始转场 */
        NONE,
        /** 上一条记录的最后一帧（交叉溶解） */
        PREVIOUS_FRAME,
        /** 纯黑（从黑屏淡入） */
        BLACK,
        /** 纯白（从白屏淡入） */
        WHITE
    }

    private StartTransition() {
    }

    /**
     * @function 判断记录启用了哪一种起始转场
     *
     *           <p>三种转场互斥，正常只会命中一种；若数据里同时存在多种（手改工程文件等），
     *           按 {@code 交叉溶解 > 黑屏 > 白屏} 的优先级取一种，避免出现"黑屏盖在叠化上"这种画面。
     *
     * @param record 要判断的记录（可为 null）
     * @return 启用的转场类型；没有启用时返回 {@link Kind#NONE}
     */
    public static Kind kindOf(Record record) {
        if (record == null) {
            return Kind.NONE;
        }
        List<EffectVisual> effects = record.getEffects();
        if (effects == null || effects.isEmpty()) {
            return Kind.NONE;
        }

        boolean crossDissolve = false;
        boolean fadeFromBlack = false;
        boolean fadeFromWhite = false;
        for (EffectVisual effect : effects) {
            if (effect == null) {
                continue;
            }
            crossDissolve |= effect.isCrossDissolve();
            fadeFromBlack |= effect.isFadeFromBlack();
            fadeFromWhite |= effect.isFadeFromWhite();
        }

        final Kind kind;
        int enabledCount;
        if (crossDissolve) {
            kind = Kind.PREVIOUS_FRAME;
            enabledCount = (fadeFromBlack ? 1 : 0) + (fadeFromWhite ? 1 : 0) + 1;
        } else if (fadeFromBlack) {
            kind = Kind.BLACK;
            enabledCount = (fadeFromWhite ? 1 : 0) + 1;
        } else if (fadeFromWhite) {
            kind = Kind.WHITE;
            enabledCount = 1;
        } else {
            kind = Kind.NONE;
            enabledCount = 0;
        }

        if (enabledCount > 1) {
            logger.warn("记录 {} 同时勾选了 {} 种起始转场，按优先级只使用 {}（交叉溶解 > 黑屏 > 白屏）",
                    record.getUuid(), enabledCount, kind);
        }
        return kind;
    }

    /**
     * @function 记录是否启用了交叉溶解
     *
     *           <p>只有交叉溶解依赖上一条记录的画面：渲染前要找上一条记录、渲染它的最后一帧，
     *           而且它不能复用片段缓存（见 {@code BatchVideoProcessor#canReuseRenderedClip}）。
     *
     * @param record 要判断的记录
     * @return 启用了交叉溶解时返回 true
     */
    public static boolean isCrossDissolve(Record record) {
        return kindOf(record) == Kind.PREVIOUS_FRAME;
    }

    /**
     * @function 计算某一帧上叠加层的不透明度
     * @param frameIndex 本条记录内的帧序号（从 0 开始）
     * @return 0 → 1.0（100%），{@code FRAMES - 1} → 0.0，超出转场范围（或负序号）→ 0
     */
    public static float opacityAt(int frameIndex) {
        if (frameIndex < 0 || frameIndex >= FRAMES) {
            return 0f;
        }
        if (FRAMES <= 1) {
            // 只有 1 帧时"从 100 降到 0"没有中间状态，按完全覆盖处理
            return 1f;
        }
        return 1f - (float) frameIndex / (FRAMES - 1);
    }

    /**
     * @function 把叠加层按当前帧的不透明度叠到画面上
     *
     *           <p>直接在该帧图像上绘制（调用方之后马上编码，不需要额外的副本）；
     *           转场结束后（{@code frameIndex >= FRAMES}）什么都不做，画面保持记录自己的样子。
     *
     * @param frame     当前帧（会被就地修改）
     * @param overlay   叠加层（与 frame 同尺寸；黑/白屏由 {@link #solidOverlay} 生成）
     * @param frameIndex 本条记录内的帧序号（从 0 开始）
     */
    public static void apply(BufferedImage frame, BufferedImage overlay, int frameIndex) {
        if (frame == null || overlay == null) {
            return;
        }
        float opacity = opacityAt(frameIndex);
        if (opacity <= 0f) {
            return;
        }
        Graphics2D g2d = frame.createGraphics();
        try {
            g2d.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, opacity));
            g2d.drawImage(overlay, 0, 0, null);
        } finally {
            g2d.dispose();
        }
    }

    /**
     * @function 生成纯色叠加层（黑屏/白屏转场用）
     *
     * <p>黑/白屏转场叠的是一张与画面同尺寸的纯色图，和交叉溶解的"上一帧"走同一个
     * {@link #apply} 通道，所以三种转场的淡出曲线完全一致。
     *
     * @param color  叠加颜色（黑屏用 {@link Color#BLACK}，白屏用 {@link Color#WHITE}）
     * @param width  画面宽度
     * @param height 画面高度
     * @return 纯色叠加层
     */
    public static BufferedImage solidOverlay(Color color, int width, int height) {
        BufferedImage overlay = new BufferedImage(Math.max(1, width), Math.max(1, height),
                BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2d = overlay.createGraphics();
        try {
            g2d.setColor(color);
            g2d.fillRect(0, 0, overlay.getWidth(), overlay.getHeight());
        } finally {
            g2d.dispose();
        }
        return overlay;
    }
}
