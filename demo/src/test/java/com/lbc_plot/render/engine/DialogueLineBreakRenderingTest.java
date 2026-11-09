package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.engine.manager.FontLoader;
import com.lbc_plot.render.engine.manager.TextLineBreaker;
import com.lbc_plot.render.engine.model.TextAlignment;

/**
 * 对话内容支持换行（剧情编辑 → 文本 → 对话内容）的排版与渲染测试。
 *
 * <p>为什么需要这一层测试：JDK 的 {@code LineBreakMeasurer} 只按宽度折行，<b>不认 '\n'</b>，
 * 改造前 "第一行\n第二行" 会被画成一整行、换行被吞掉（预览图与成片都是）。
 * 这里锁住四件事：
 * <ol>
 *   <li>切段落：硬换行拆成多行，末尾空行不占高，段落之间的空行保留；</li>
 *   <li>预览图路径（{@link RenderOfImage} → {@code TextLayerManager}）真的画出了多行；</li>
 *   <li>视频逐帧路径（{@link RenderOfVideo}）与预览图路径用的是同一套排版；</li>
 *   <li>工程 JSON 往返、{@link Dialogue#setText} 都不会丢换行（CRLF 会被规范成 LF）。</li>
 * </ol>
 */
class DialogueLineBreakRenderingTest {

    private static final int WIDTH = 1920;
    private static final int HEIGHT = 1080;

    /** 多行短句：两行之间有明显空行，便于按"墨迹带"数行数 */
    private static final String TWO_LINES = "第一行\n第二行";

    // ==================== 排版（TextLineBreaker） ====================

    @Test
    @DisplayName("硬换行切成多行：换行符不再被当成普通字符吞进同一行")
    void layoutSplitsOnHardLineBreaks() {
        Font font = FontLoader.getChineseFont(28);
        FontRenderContextHolder holder = new FontRenderContextHolder(font);

        List<TextLineBreaker.Line> lines = TextLineBreaker.layout(TWO_LINES, font, holder.frc, 1120);
        assertEquals(2, lines.size(), "两个段落应排成两行");
        assertFalse(lines.get(0).isEmpty(), "第一行有字");
        assertFalse(lines.get(1).isEmpty(), "第二行有字");
    }

    @Test
    @DisplayName("末尾换行不占行高：打字动画刚敲下回车时画面不跳")
    void layoutIgnoresTrailingLineBreak() {
        Font font = FontLoader.getChineseFont(28);
        FontRenderContextHolder holder = new FontRenderContextHolder(font);

        List<TextLineBreaker.Line> withoutTrailing = TextLineBreaker.layout("第一行", font, holder.frc, 1120);
        List<TextLineBreaker.Line> withTrailing = TextLineBreaker.layout("第一行\n", font, holder.frc, 1120);

        assertEquals(1, withoutTrailing.size());
        assertEquals(1, withTrailing.size(), "末尾空段落不应排出一行");
        assertEquals(TextLineBreaker.totalHeight(withoutTrailing),
                TextLineBreaker.totalHeight(withTrailing), 0.01f,
                "末尾多一个换行不应改变文字块高度（否则打字到换行那一帧会上下跳）");
    }

    @Test
    @DisplayName("段落之间的空行保留（占一行行高，但没有字形）")
    void layoutKeepsInteriorBlankLine() {
        Font font = FontLoader.getChineseFont(28);
        FontRenderContextHolder holder = new FontRenderContextHolder(font);

        List<TextLineBreaker.Line> lines = TextLineBreaker.layout("第一行\n\n第二行", font, holder.frc, 1120);
        assertEquals(3, lines.size(), "中间的空段落应保留为空行");
        assertTrue(lines.get(1).isEmpty(), "第二行应为空行");
        assertTrue(lines.get(1).getHeight() > 0, "空行也要占行高");
        assertFalse(lines.get(2).isEmpty(), "空行之后仍应有正文");
    }

    @Test
    @DisplayName("CRLF / CR 统一成 LF（外部工程文件不会多画出不可见字符）")
    void lineBreaksAreNormalized() {
        assertEquals("第一行\n第二行", TextLineBreaker.normalizeLineBreaks("第一行\r\n第二行"));
        assertEquals("第一行\n第二行", TextLineBreaker.normalizeLineBreaks("第一行\r第二行"));
        assertEquals("", TextLineBreaker.normalizeLineBreaks(null));

        Font font = FontLoader.getChineseFont(28);
        FontRenderContextHolder holder = new FontRenderContextHolder(font);
        assertEquals(2, TextLineBreaker.layout("第一行\r\n第二行", font, holder.frc, 1120).size(),
                "CRLF 文本也应排成两行");
    }

    // ==================== 绘制（对齐 / 加粗） ====================

    @Test
    @DisplayName("左对齐：两行都从锚点 X 开始，且上下分开")
    void drawLinesLeftAlignment() {
        Font font = FontLoader.getChineseFont(28);
        BufferedImage canvas = new BufferedImage(800, 300, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2d = canvas.createGraphics();
        try {
            g2d.setFont(font);
            List<TextLineBreaker.Line> lines = TextLineBreaker.layout(
                    TWO_LINES, font, g2d.getFontRenderContext(), 600);
            TextLineBreaker.drawLines(g2d, lines, 20, 30, TextAlignment.LEFT, Color.WHITE, false, 28);
        } finally {
            g2d.dispose();
        }

        List<int[]> bands = inkBands(canvas);
        assertEquals(2, bands.size(), "应画成上下两行");
        int firstLineMinX = minInkX(canvas, bands.get(0)[0], bands.get(0)[1]);
        int secondLineMinX = minInkX(canvas, bands.get(1)[0], bands.get(1)[1]);
        assertEquals(20, firstLineMinX, 3, "第一行左边界应在锚点 X=20");
        assertEquals(20, secondLineMinX, 3, "第二行左边界也应回到锚点 X=20（不是接在第一行后面）");
    }

    @Test
    @DisplayName("居中 / 右对齐：每一行各自对齐，不再整段挤在一行")
    void drawLinesCenterAndRightAlignment() {
        Font font = FontLoader.getChineseFont(28);

        BufferedImage centered = new BufferedImage(800, 300, BufferedImage.TYPE_INT_ARGB);
        Graphics2D centerG = centered.createGraphics();
        try {
            centerG.setFont(font);
            List<TextLineBreaker.Line> lines = TextLineBreaker.layout(
                    "第一行\n第二行更长一些", font, centerG.getFontRenderContext(), 700);
            TextLineBreaker.drawLines(centerG, lines, 400, 150, TextAlignment.CENTER, Color.WHITE, false, 28);
        } finally {
            centerG.dispose();
        }
        int[] bounds = alphaBounds(centered);
        assertEquals(400, (bounds[0] + bounds[2]) / 2.0, 6,
                "居中：文字块中心应落在锚点 X=400");
        assertEquals(2, inkBands(centered).size(), "居中：两行必须是两行");

        BufferedImage right = new BufferedImage(800, 300, BufferedImage.TYPE_INT_ARGB);
        Graphics2D rightG = right.createGraphics();
        try {
            rightG.setFont(font);
            List<TextLineBreaker.Line> lines = TextLineBreaker.layout(
                    "第一行\n第二行", font, rightG.getFontRenderContext(), 700);
            TextLineBreaker.drawLines(rightG, lines, 780, 30, TextAlignment.RIGHT, Color.WHITE, false, 28);
        } finally {
            rightG.dispose();
        }
        int[] rightBounds = alphaBounds(right);
        assertEquals(780, rightBounds[2], 4, "右对齐：文字块右边界应贴住锚点 X=780");
    }

    // ==================== 预览图路径（RenderOfImage） ====================

    @Test
    @DisplayName("预览图路径画出多行：两行台词上下分开，整块仍垂直居中")
    void previewRendersMultipleLinesAndStaysCentered() throws Exception {
        BufferedImage twoLines = RenderOfImage.renderUIOnly(freeTextRecord(TWO_LINES), true, WIDTH, HEIGHT);
        BufferedImage oneLine = RenderOfImage.renderUIOnly(freeTextRecord("第一行第二行"), true, WIDTH, HEIGHT);

        List<int[]> bands = inkBands(twoLines);
        assertEquals(2, bands.size(), "带换行的台词应画成两行（改造前只有一行）");

        int[] bounds = alphaBounds(twoLines);
        double centerX = (bounds[0] + bounds[2]) / 2.0;
        double centerY = (bounds[1] + bounds[3]) / 2.0;
        assertEquals(WIDTH / 2.0, centerX, 8.0, "水平仍居中，实际 x=" + centerX);
        assertEquals(HEIGHT / 2.0, centerY, 8.0, "垂直仍居中（按整块两行算），实际 y=" + centerY);

        int twoLineHeight = bounds[3] - bounds[1] + 1;
        int[] oneLineBounds = alphaBounds(oneLine);
        int oneLineHeight = oneLineBounds[3] - oneLineBounds[1] + 1;
        assertTrue(twoLineHeight > oneLineHeight * 1.6,
                "两行的文字块应明显高于单行（单行=" + oneLineHeight + ", 两行=" + twoLineHeight + "）");
    }

    @Test
    @DisplayName("没有换行时仍按宽度自动折行（原有行为不变）")
    void autoWrapStillWorksWithoutLineBreaks() throws Exception {
        String wrapped = "自动换行测试".repeat(20); // 140 字，28px 下远超 1120px 的折行宽度
        BufferedImage image = RenderOfImage.renderUIOnly(freeTextRecord(wrapped), true, WIDTH, HEIGHT);

        // 折行后的行距很紧（排版行高 ≈ 字号），所以按"比单行高多少倍"判断，而不是按墨迹带数
        BufferedImage singleLine = RenderOfImage.renderUIOnly(freeTextRecord("自动换行"), true, WIDTH, HEIGHT);
        int[] singleBounds = alphaBounds(singleLine);
        int singleHeight = singleBounds[3] - singleBounds[1] + 1;

        int[] bounds = alphaBounds(image);
        int height = bounds[3] - bounds[1] + 1;
        assertTrue(height > singleHeight * 2.2,
                "长台词应自动折成多行（单行墨迹高=" + singleHeight + ", 长台词墨迹高=" + height + "）");
        assertEquals(WIDTH / 2.0, (bounds[0] + bounds[2]) / 2.0, 8.0, "自动折行后仍水平居中");
    }

    // ==================== 视频逐帧路径（RenderOfVideo） ====================

    @Test
    @DisplayName("成片逐帧路径同样按换行分段（与预览图同一套排版）")
    void videoFrameHonorsLineBreaks() throws Exception {
        Record record = freeTextRecord(TWO_LINES);
        BufferedImage frame = RenderOfVideo.renderLastFrame(record, false, WIDTH, HEIGHT,
                RenderOfVideo.LAYER_UI_ONLY);

        List<int[]> bands = inkBands(frame);
        assertEquals(2, bands.size(), "成片里带换行的台词也应是两行");

        int[] bounds = alphaBounds(frame);
        assertEquals(WIDTH / 2.0, (bounds[0] + bounds[2]) / 2.0, 8.0, "成片里文字块仍水平居中");
        assertEquals(HEIGHT / 2.0, (bounds[1] + bounds[3]) / 2.0, 8.0, "成片里文字块仍垂直居中");
    }

    // ==================== 模型 / 工程文件 ====================

    @Test
    @DisplayName("Dialogue 保存时统一换行符并保留内部换行")
    void dialogueKeepsLineBreaks() {
        Dialogue dialogue = Dialogue.builder().text("第一行\r\n第二行").speakerName("旁白").build();
        assertEquals("第一行\n第二行", dialogue.getText(), "CRLF 应规范成 LF，内部换行要保留");

        dialogue.setText("甲\r乙");
        assertEquals("甲\n乙", dialogue.getText(), "单独的 CR 也要规范");

        dialogue.setText("\n开头和结尾的空行会被去掉\n");
        assertEquals("开头和结尾的空行会被去掉", dialogue.getText(), "首尾空白去掉，内部换行保留");

        Dialogue blank = Dialogue.builder().text("   ").speakerName("旁白").build();
        assertEquals(Dialogue.DEFAULT_TEXT, blank.getText(), "空白台词仍回落到默认文本");
    }

    @Test
    @DisplayName("工程 JSON 往返保留换行")
    void jsonRoundTripKeepsLineBreaks() throws Exception {
        Dialogue dialogue = Dialogue.builder().text(TWO_LINES).speakerName("旁白").build();

        ObjectMapper mapper = new ObjectMapper();
        String json = mapper.writeValueAsString(dialogue);
        assertTrue(json.contains("第一行\\n第二行"),
                "JSON 里换行应转义成 \\n，实际: " + json);

        Dialogue restored = mapper.readValue(json, Dialogue.class);
        assertEquals(TWO_LINES, restored.getText(), "读回工程后换行不能丢，也不能变成空格");
    }

    // ==================== 工具方法 ====================

    /** 自由文本 + 隐藏UI：不依赖背景/立绘/数据库，正文直接画在透明画布上，行数最容易数。 */
    private static Record freeTextRecord(String text) {
        Dialogue dialogue = Dialogue.builder()
                .text(text)
                .speakerName("自由文本")
                .freeText(true)
                .hideUI(true)
                .freeTextColor("#FFFFFF")
                .build();
        return new Record.Builder()
                .uuid("linebreak-" + text.length())
                .dialogue(dialogue)
                .isDirty(true)
                .build();
    }

    /** 一个便于反复取 FontRenderContext 的临时画布（测量排版用，不参与绘制）。 */
    private static final class FontRenderContextHolder {
        final java.awt.font.FontRenderContext frc;

        FontRenderContextHolder(Font font) {
            BufferedImage probe = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g2d = probe.createGraphics();
            try {
                g2d.setFont(font);
                this.frc = g2d.getFontRenderContext();
            } finally {
                g2d.dispose();
            }
        }
    }

    /** 非透明像素的包围盒：[minX, minY, maxX, maxY] */
    private static int[] alphaBounds(BufferedImage image) {
        int minX = image.getWidth();
        int minY = image.getHeight();
        int maxX = -1;
        int maxY = -1;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                if ((image.getRGB(x, y) >>> 24) > 0) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        assertTrue(maxX >= 0 && maxY >= 0, "期望存在可见文字，但画面全透明");
        return new int[] { minX, minY, maxX, maxY };
    }

    /** 从上到下把"有墨迹的连续行"分成若干带，每个带是 [首行, 末行]；用来数实际画了几行字。 */
    private static List<int[]> inkBands(BufferedImage image) {
        List<int[]> bands = new ArrayList<>();
        int start = -1;
        for (int y = 0; y < image.getHeight(); y++) {
            boolean hasInk = false;
            for (int x = 0; x < image.getWidth(); x++) {
                if ((image.getRGB(x, y) >>> 24) > 0) {
                    hasInk = true;
                    break;
                }
            }
            if (hasInk && start < 0) {
                start = y;
            } else if (!hasInk && start >= 0) {
                bands.add(new int[] { start, y - 1 });
                start = -1;
            }
        }
        if (start >= 0) {
            bands.add(new int[] { start, image.getHeight() - 1 });
        }
        return bands;
    }

    /** 指定行范围内最左侧的有墨迹像素的 X。 */
    private static int minInkX(BufferedImage image, int fromY, int toY) {
        for (int x = 0; x < image.getWidth(); x++) {
            for (int y = fromY; y <= toY; y++) {
                if ((image.getRGB(x, y) >>> 24) > 0) {
                    return x;
                }
            }
        }
        return -1;
    }
}
