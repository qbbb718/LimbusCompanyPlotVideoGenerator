package com.lbc_plot.render.engine.manager;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Shape;
import java.awt.font.FontRenderContext;
import java.awt.font.LineBreakMeasurer;
import java.awt.font.LineMetrics;
import java.awt.font.TextAttribute;
import java.awt.font.TextLayout;
import java.awt.geom.AffineTransform;
import java.text.AttributedCharacterIterator;
import java.text.AttributedString;
import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.render.engine.model.TextAlignment;

/**
 * 多行文字排版 + 绘制（预览图与视频帧共用）。
 *
 * <h2>为什么不能只用 {@link LineBreakMeasurer}</h2>
 * 对话内容支持用户手打换行（剧情编辑 → 文本 → 对话内容），而 JDK 的
 * {@code LineBreakMeasurer} 只做「宽度不够就折行」，<b>不认 '\n'</b>：
 * 一段 "第一行\n第二行" 会被排成一行、换行符被直接吞掉，画面上看不出任何换行。
 *
 * <p>所以这里先按 '\n' 把文本切成若干<b>段落</b>（硬换行），每个段落再交给
 * {@code LineBreakMeasurer} 按宽度自动折行。空段落（如 "第一段\n\n第二段" 中间那一行）
 * 保留成一个"空行"，它没有字形但占一行行高。
 *
 * <h2>为什么把绘制也放在这里</h2>
 * 预览图（{@link com.lbc_plot.render.engine.RenderOfImage} → {@link TextLayerManager}）与
 * 视频逐帧（{@link com.lbc_plot.render.engine.RenderOfVideo}）原本各有一份"换行 + 对齐 + 加粗"
 * 的绘制代码，两边的字体度量/换行细节一旦不一致，同一条台词在预览里和成片里就会错位
 * （淡出结束时文字跳一下就是这么来的）。现在两边都调用 {@link #layout} + {@link #drawLines}，
 * 同一段文字在两条渲染路径上逐像素一致。
 */
public final class TextLineBreaker {

    /** 空行（段落之间的空白行）的占位行高：用字体自身的行高，让空行与有字的一行等高。 */
    private static final String BLANK_LINE_REFERENCE = " ";

    private TextLineBreaker() {
        // 工具类
    }

    /**
     * 规范化换行符：把 CRLF / CR 统一成 LF。
     *
     * <p>前端 textarea 提交的本来就是 '\n'，但工程文件可能被外部工具存成 CRLF（Windows 记事本），
     * 渲染只认 '\n'，这里统一一次，避免 '\r' 被当成一个"看不见的字符"占掉一帧、或画成方块。
     *
     * @param text 原始文本；null 视为空串
     * @return 只含 '\n' 的文本
     */
    public static String normalizeLineBreaks(String text) {
        if (text == null || text.isEmpty()) {
            return "";
        }
        return text.replace("\r\n", "\n").replace('\r', '\n');
    }

    /**
     * 把一段文本排成多行。
     *
     * <p>规则：
     * <ol>
     *   <li>先按 '\n' 切段落（硬换行），空段落保留为空行；</li>
     *   <li>段落内按 {@code wrapWidth} 自动折行（与改造前的观感完全一致）；</li>
     *   <li><b>末尾的空段落不占行高</b>：打字动画打到 "abc\n" 这一帧时画面应还是 "abc"，
     *       而不是整块文字突然往上跳半行、等下一个字出现再跳回来。</li>
     * </ol>
     *
     * @param text      文本（可含 \r\n，内部会规范化）
     * @param font      字体（预览与视频都用 {@link FontLoader} 加载的中文字体）
     * @param frc       字体渲染上下文（取自实际绘制用的 Graphics2D）
     * @param wrapWidth 自动折行宽度；<=0 表示只按硬换行分段、不做宽度折行
     * @return 逐行结果；文本为空 / 只有空白行时返回空列表
     */
    public static List<Line> layout(String text, Font font, FontRenderContext frc, float wrapWidth) {
        String normalized = normalizeLineBreaks(text);
        if (normalized.isEmpty() || font == null || frc == null) {
            return List.of();
        }

        String[] paragraphs = normalized.split("\n", -1);
        int lastParagraph = paragraphs.length - 1;
        // 末尾的空段落（打字动画刚敲下回车时会出现）不产生行
        while (lastParagraph >= 0 && paragraphs[lastParagraph].isEmpty()) {
            lastParagraph--;
        }
        if (lastParagraph < 0) {
            return List.of();
        }

        float width = wrapWidth > 0 ? wrapWidth : Float.MAX_VALUE;
        LineMetrics blankLineMetrics = font.getLineMetrics(BLANK_LINE_REFERENCE, frc);

        List<Line> lines = new ArrayList<>();
        for (int index = 0; index <= lastParagraph; index++) {
            String paragraph = paragraphs[index];
            if (paragraph.isEmpty()) {
                lines.add(Line.blank(blankLineMetrics));
                continue;
            }

            AttributedString attributed = new AttributedString(paragraph);
            // 只加字体属性：颜色由 drawLines 用 Graphics2D 的颜色决定，
            // 这样同一次排版结果可以被画两遍（投影一遍、正文一遍）而不必重新排版。
            attributed.addAttribute(TextAttribute.FONT, font);
            AttributedCharacterIterator iterator = attributed.getIterator();
            LineBreakMeasurer measurer = new LineBreakMeasurer(iterator, frc);
            while (measurer.getPosition() < iterator.getEndIndex()) {
                lines.add(new Line(measurer.nextLayout(width)));
            }
        }
        return lines;
    }

    /** 所有行的总高度（= 各行 ascent + descent + leading 之和），用于垂直居中。 */
    public static float totalHeight(List<Line> lines) {
        float total = 0;
        for (Line line : lines) {
            total += line.getHeight();
        }
        return total;
    }

    /** 所有行里最宽一行的 advance，用于居中对齐时的水平边界与画布撑大。 */
    public static float maxAdvance(List<Line> lines) {
        float max = 0;
        for (Line line : lines) {
            max = Math.max(max, line.getAdvance());
        }
        return max;
    }

    /**
     * 绘制已经排好版的多行文字。
     *
     * <p>锚点语义与原实现完全一致（不能改，否则所有记录的构图都会变）：
     * <ul>
     *   <li>{@link TextAlignment#CENTER}：锚点是整块文字的中心（水平 + 垂直）；</li>
     *   <li>{@link TextAlignment#RIGHT}：锚点是文字块的右上角；</li>
     *   <li>{@link TextAlignment#LEFT}：锚点是文字块的左上角。</li>
     * </ul>
     *
     * @param g2d       目标画布
     * @param lines     {@link #layout} 的结果
     * @param x         锚点 X
     * @param y         锚点 Y
     * @param alignment 对齐方式
     * @param color     文字颜色
     * @param bold      是否模拟加粗（当前中文字体没有独立 Bold 字重，用"填充 + 轮廓描边"模拟）
     * @param fontSize  字号（加粗描边宽度按它缩放，保证高低分辨率观感一致）
     */
    public static void drawLines(Graphics2D g2d, List<Line> lines, float x, float y,
            TextAlignment alignment, Color color, boolean bold, float fontSize) {
        if (lines == null || lines.isEmpty()) {
            return;
        }

        TextAlignment effectiveAlignment = alignment == null ? TextAlignment.LEFT : alignment;
        float currentY = effectiveAlignment == TextAlignment.CENTER
                ? y - totalHeight(lines) / 2
                : y;

        g2d.setColor(color);

        for (Line line : lines) {
            float drawX;
            if (effectiveAlignment == TextAlignment.CENTER) {
                drawX = x - line.getAdvance() / 2;
            } else if (effectiveAlignment == TextAlignment.RIGHT) {
                drawX = x - line.getAdvance();
            } else {
                drawX = x;
            }

            currentY += line.getAscent();
            if (!line.isEmpty()) {
                if (bold) {
                    Shape outline = line.getLayout()
                            .getOutline(AffineTransform.getTranslateInstance(drawX, currentY));
                    g2d.setStroke(boldStroke(fontSize));
                    g2d.fill(outline);
                    g2d.draw(outline);
                } else {
                    line.getLayout().draw(g2d, drawX, currentY);
                }
            }
            currentY += line.getDescent() + line.getLeading();
        }
    }

    /**
     * 模拟加粗时的描边宽度：随字号线性缩放（28px 设计字号约 1.4px），
     * 这样预览（1080p 设计画布）与低分辨率视频导出的观感一致。
     */
    private static BasicStroke boldStroke(float fontSize) {
        float width = Math.max(0.6f, fontSize * 0.05f);
        return new BasicStroke(width, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND);
    }

    /**
     * 排版后的一行。
     *
     * <p>空行（段落之间的空白行）没有 {@link TextLayout}（JDK 不接受空字符串构造 TextLayout），
     * 只有行高，绘制时跳过字形、只推进 Y。
     */
    public static final class Line {
        private final TextLayout layout;
        private final float advance;
        private final float ascent;
        private final float descent;
        private final float leading;

        private Line(TextLayout layout, float advance, float ascent, float descent, float leading) {
            this.layout = layout;
            this.advance = advance;
            this.ascent = ascent;
            this.descent = descent;
            this.leading = leading;
        }

        private Line(TextLayout layout) {
            this(layout, layout.getAdvance(), layout.getAscent(), layout.getDescent(), layout.getLeading());
        }

        private static Line blank(LineMetrics metrics) {
            return new Line(null, 0f, metrics.getAscent(), metrics.getDescent(), metrics.getLeading());
        }

        /** 该行的 TextLayout；空行返回 null。 */
        public TextLayout getLayout() {
            return layout;
        }

        /** 该行的水平前进宽度（居中对齐与边界计算用）。 */
        public float getAdvance() {
            return advance;
        }

        public float getAscent() {
            return ascent;
        }

        public float getDescent() {
            return descent;
        }

        public float getLeading() {
            return leading;
        }

        /** 该行占用的总高度。 */
        public float getHeight() {
            return ascent + descent + leading;
        }

        /** 是否为空行（没有字形）。 */
        public boolean isEmpty() {
            return layout == null;
        }
    }
}
