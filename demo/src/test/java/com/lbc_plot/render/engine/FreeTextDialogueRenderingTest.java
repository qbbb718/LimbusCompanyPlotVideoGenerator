package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.CharacterRef;

/**
 * "自由文本"说话人类型（剧情编辑 → 文本 tab）的渲染测试。
 *
 * <p>约定：
 * <ul>
 *   <li>说话人类型为自由文本时，说话人不上屏（不生成角色名片），"对话内容"使用旁白字体/字号，
 *       整段文字块水平 + 垂直居中于画面；</li>
 *   <li>加粗 / 斜体只作用于这段文字；当前中文字体没有独立 Bold 字重，加粗由轮廓描边模拟；</li>
 *   <li>"隐藏UI"默认勾选；勾选时不渲染整层 UI（对话框 / 名片 / 地点牌）。</li>
 * </ul>
 */
class FreeTextDialogueRenderingTest {

    private static final int WIDTH = 1920;
    private static final int HEIGHT = 1080;

    private static Record freeTextRecord(String text, boolean bold, boolean italic, boolean hideUI) {
        Dialogue dialogue = Dialogue.builder()
                .text(text)
                .speakerName("自由文本")
                .freeText(true)
                .bold(bold)
                .italic(italic)
                .hideUI(hideUI)
                .build();
        return new Record(null, dialogue, null, null, null, null, null, null, false, null);
    }

    /** 只渲染"自由文本"文字层（隐藏UI，画布透明），返回整幅画面。 */
    private static BufferedImage renderTextOnly(boolean bold, boolean italic) throws Exception {
        return RenderOfImage.renderUIOnly(
                freeTextRecord("自由文本居中测试", bold, italic, true), true, WIDTH, HEIGHT);
    }

    @Test
    @DisplayName("hideUI 默认勾选；只有自由文本才可能隐藏UI")
    void hideUiDefaultsAndGuard() {
        Dialogue normal = Dialogue.builder().text("普通对话").speakerName("旁白").build();
        assertFalse(normal.isFreeText(), "默认不是自由文本");
        assertTrue(normal.isHideUI(), "hideUI 默认勾选");
        assertFalse(normal.isBold(), "默认不加粗");
        assertFalse(normal.isItalic(), "默认不斜体");
        assertTrue(RenderOfImage.shouldRenderUI(normal), "普通对话必须渲染 UI");

        Dialogue freeText = Dialogue.builder().text("自由文本").freeText(true).build();
        assertFalse(RenderOfImage.shouldRenderUI(freeText), "自由文本 + 默认隐藏UI → 不渲染 UI");

        freeText.setHideUI(false);
        assertTrue(RenderOfImage.shouldRenderUI(freeText), "取消隐藏UI后要渲染 UI");
    }

    @Test
    @DisplayName("自由文本居中于画面：文字块中心 ≈ (960, 540)")
    void freeTextIsHorizontallyAndVerticallyCentered() throws Exception {
        BufferedImage textOnly = renderTextOnly(false, false);
        int[] bounds = alphaBounds(textOnly);

        double centerX = (bounds[0] + bounds[2]) / 2.0;
        double centerY = (bounds[1] + bounds[3]) / 2.0;

        assertEquals(WIDTH / 2.0, centerX, 8.0,
                "自由文本应水平居中，实际中心 x=" + centerX);
        assertEquals(HEIGHT / 2.0, centerY, 8.0,
                "自由文本应垂直居中，实际中心 y=" + centerY);
    }

    @Test
    @DisplayName("加粗/斜体确实改变字形（加粗墨量明显增加，斜体像素与常规不同）")
    void boldAndItalicChangeGlyphs() throws Exception {
        BufferedImage plain = renderTextOnly(false, false);
        BufferedImage bold = renderTextOnly(true, false);
        BufferedImage italic = renderTextOnly(false, true);

        long plainInk = alphaSum(plain);
        long boldInk = alphaSum(bold);
        assertTrue(boldInk > plainInk * 1.2,
                "加粗后的墨量应明显大于常规文字（常规=" + plainInk + ", 加粗=" + boldInk + "）");
        assertTrue(countDifferentPixels(plain, italic) > 200,
                "斜体后的像素应与常规文字不同");
    }

    @Test
    @DisplayName("勾选隐藏UI时 UI 层为全透明；取消勾选后有 UI 元素")
    void hideUiSkipsUiLayer() throws Exception {
        Dialogue dialogue = freeTextRecord("自由文本", false, false, true).getDialogue();
        BufferedImage hidden = RenderOfImage.renderUI(true, dialogue);
        assertTrue(isFullyTransparent(hidden), "隐藏UI时不应渲染任何 UI 元素");

        dialogue.setHideUI(false);
        BufferedImage shown = RenderOfImage.renderUI(true, dialogue);
        assertTrue(alphaSum(shown) > 0, "取消隐藏UI后应渲染出 UI 元素");
    }

    @Test
    @DisplayName("自由文本的 X/Y 偏移作用于文字块中心")
    void freeTextPositionOffsetsMoveTextCenter() throws Exception {
        Dialogue dialogue = Dialogue.builder()
                .text("位置偏移测试")
                .speakerName("自由文本")
                .freeText(true)
                .freeTextX(120)
                .freeTextY(-60)
                .build();
        Record record = new Record(null, dialogue, null, null, null, null, null, null, false, null);
        BufferedImage image = RenderOfImage.renderUIOnly(record, true, WIDTH, HEIGHT);

        int[] bounds = alphaBounds(image);
        double centerX = (bounds[0] + bounds[2]) / 2.0;
        double centerY = (bounds[1] + bounds[3]) / 2.0;
        assertEquals(WIDTH / 2.0 + 120, centerX, 8.0,
                "freeTextX=120 时文字中心应右移 120，实际 x=" + centerX);
        assertEquals(HEIGHT / 2.0 - 60, centerY, 8.0,
                "freeTextY=-60 时文字中心应上移 60，实际 y=" + centerY);
    }

    @Test
    @DisplayName("自由文本支持自定义文字颜色")
    void freeTextUsesCustomColor() throws Exception {
        Dialogue dialogue = Dialogue.builder()
                .text("自由文本颜色测试")
                .speakerName("自由文本")
                .freeText(true)
                .freeTextColor("#FF0000")
                .build();
        Record record = new Record(null, dialogue, null, null, null, null, null, null, false, null);
        BufferedImage image = RenderOfImage.renderUIOnly(record, true, WIDTH, HEIGHT);

        int strongest = strongestColor(image);
        int r = (strongest >> 16) & 0xFF;
        int g = (strongest >> 8) & 0xFF;
        int b = strongest & 0xFF;
        assertTrue(r > 200 && g < 100 && b < 100,
                String.format("自由文本应使用自定义红色，实际最实像素 RGB=(%d,%d,%d)", r, g, b));
    }

    @Test
    @DisplayName("旁白不渲染说话人名片：speakerC 残留角色也不影响画面")
    void narratorSkipsSpeakerCardEvenWithLeftoverSpeakerC() throws Exception {
        CharacterRef leftover = new CharacterRef("char-1", "残留角色", 170, "某阵营",
                ProjectConfig.DEFAULT_BG_COLOR, ProjectConfig.DEFAULT_TEXT_COLOR);

        // hideUI=false，确保 UI 层（对话框/名片）真的会走渲染流程，对比才有意义
        Dialogue narratorWithLeftover = Dialogue.builder()
                .text("旁白测试")
                .speakerName("旁白")
                .speakerC(List.of(leftover))
                .hideUI(false)
                .build();
        Dialogue narratorClean = Dialogue.builder()
                .text("旁白测试")
                .speakerName("旁白")
                .hideUI(false)
                .build();

        BufferedImage withLeftover = RenderOfImage.renderUI(true, narratorWithLeftover);
        BufferedImage clean = RenderOfImage.renderUI(true, narratorClean);

        assertEquals(0, countDifferentPixels(withLeftover, clean),
                "旁白不应因 speakerC 残留角色而渲染说话人名片");
    }

    @Test
    @DisplayName("工程 JSON 往返保留自由文本字段")
    void jsonRoundTripKeepsFreeTextFields() throws Exception {
        Dialogue dialogue = Dialogue.builder()
                .text("自由文本")
                .speakerName("自由文本")
                .freeText(true)
                .bold(true)
                .italic(true)
                .hideUI(false)
                .freeTextColor("#12AB34")
                .freeTextX(90)
                .freeTextY(-40)
                .build();

        ObjectMapper mapper = new ObjectMapper();
        String json = mapper.writeValueAsString(dialogue);
        assertTrue(json.contains("\"freeText\":true"), "JSON 应包含 freeText");
        assertTrue(json.contains("\"bold\":true"), "JSON 应包含 bold");
        assertTrue(json.contains("\"italic\":true"), "JSON 应包含 italic");
        assertTrue(json.contains("\"hideUI\":false"), "JSON 应包含 hideUI");
        assertTrue(json.contains("\"freeTextColor\":\"#12AB34\""), "JSON 应包含 freeTextColor");
        assertTrue(json.contains("\"freeTextX\":90"), "JSON 应包含 freeTextX");
        assertTrue(json.contains("\"freeTextY\":-40"), "JSON 应包含 freeTextY");

        Dialogue restored = mapper.readValue(json, Dialogue.class);
        assertTrue(restored.isFreeText());
        assertTrue(restored.isBold());
        assertTrue(restored.isItalic());
        assertFalse(restored.isHideUI());
        assertEquals("#12AB34", restored.getFreeTextColor());
        assertEquals(90, restored.getFreeTextX());
        assertEquals(-40, restored.getFreeTextY());

        // 旧工程 JSON 没有这些字段：按"非自由文本 + 隐藏UI默认勾选 + 位置居中"处理
        Dialogue legacy = mapper.readValue("{\"text\":\"旧工程对话\",\"speakerName\":\"旁白\"}",
                Dialogue.class);
        assertFalse(legacy.isFreeText(), "旧工程默认不是自由文本");
        assertFalse(legacy.isBold());
        assertFalse(legacy.isItalic());
        assertTrue(legacy.isHideUI(), "旧工程未写 hideUI 时默认勾选");
        assertNull(legacy.getFreeTextColor(), "旧工程未写 freeTextColor 时应为 null（渲染用默认色）");
        assertEquals(0, legacy.getFreeTextX(), "旧工程未写 freeTextX 时默认居中");
        assertEquals(0, legacy.getFreeTextY(), "旧工程未写 freeTextY 时默认居中");
    }

    // ==================== 工具方法 ====================

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

    /** 所有像素 alpha 之和，用来粗略衡量"墨量" */
    private static long alphaSum(BufferedImage image) {
        long sum = 0;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                sum += image.getRGB(x, y) >>> 24;
            }
        }
        return sum;
    }

    private static boolean isFullyTransparent(BufferedImage image) {
        return alphaSum(image) == 0;
    }

    /** 返回 alpha 最大的像素的 RGB（忽略 alpha），用于检查文字实际颜色 */
    private static int strongestColor(BufferedImage image) {
        int bestRgb = 0;
        int bestAlpha = -1;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int argb = image.getRGB(x, y);
                int alpha = argb >>> 24;
                if (alpha > bestAlpha) {
                    bestAlpha = alpha;
                    bestRgb = argb & 0xFFFFFF;
                }
            }
        }
        assertTrue(bestAlpha > 0, "期望存在可见文字，但画面全透明");
        return bestRgb;
    }

    private static int countDifferentPixels(BufferedImage a, BufferedImage b) {
        assertEquals(a.getWidth(), b.getWidth(), "比较双方宽度必须一致");
        assertEquals(a.getHeight(), b.getHeight(), "比较双方高度必须一致");
        int count = 0;
        for (int y = 0; y < a.getHeight(); y++) {
            for (int x = 0; x < a.getWidth(); x++) {
                if (a.getRGB(x, y) != b.getRGB(x, y)) {
                    count++;
                }
            }
        }
        return count;
    }
}
