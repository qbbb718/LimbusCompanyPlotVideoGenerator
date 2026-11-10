package com.lbc_plot.resource.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.resource.controller.PortraitPreviewController.CompareSpec;

/**
 * 立绘预览「对比角色」参数的解析规则。
 *
 * <p>参数是重复出现的 multipart 字段，每个值形如 {@code 立绘ID:水平偏移}。
 * 这里只测解析（不启动数据库 / 渲染），保证三种情况的行为都稳定：
 * <ol>
 *   <li>正常值原样解析（负偏移=左侧）；</li>
 *   <li>偏移越界时收进 ±画面宽度，不会把角色甩到看不见的地方；</li>
 *   <li>格式不对时立刻报错 —— 静默忽略只会让用户看到"加了对比角色但画面没变"。</li>
 * </ol>
 */
class PortraitPreviewControllerCompareTest {

    /** 与 PortraitPreviewController.MAX_COMPARE_PORTRAITS 保持一致 */
    private static final int MAX_COMPARE_PORTRAITS = 4;

    @Test
    @DisplayName("没有 compare 参数时返回空列表（预览功能对老前端保持兼容）")
    void emptySpecsYieldEmptyList() {
        assertTrue(PortraitPreviewController.parseCompareSpecs(null).isEmpty());
        assertTrue(PortraitPreviewController.parseCompareSpecs(List.of()).isEmpty());
        assertTrue(PortraitPreviewController.parseCompareSpecs(Arrays.asList("", "   ")).isEmpty());
    }

    @Test
    @DisplayName("解析 立绘ID:水平偏移，负偏移表示在左侧")
    void parsesPortraitIdAndOffset() {
        List<CompareSpec> parsed = PortraitPreviewController.parseCompareSpecs(
                List.of("p_right:461", "p_left:-461"));

        assertEquals(2, parsed.size());
        assertEquals("p_right", parsed.get(0).portraitId());
        assertEquals(461, parsed.get(0).offsetX());
        assertEquals("p_left", parsed.get(1).portraitId());
        assertEquals(-461, parsed.get(1).offsetX(), "负号必须保留（表示站在左边）");
    }

    @Test
    @DisplayName("水平偏移超出一个画面宽度时收进 ±1920")
    void clampsOffsetToVideoWidth() {
        List<CompareSpec> parsed = PortraitPreviewController.parseCompareSpecs(
                List.of("p_far:99999", "p_far_left:-99999"));

        assertEquals(1920, parsed.get(0).offsetX());
        assertEquals(-1920, parsed.get(1).offsetX());
    }

    @Test
    @DisplayName("最多只认 4 个对比角色，多余的丢掉")
    void capsCompareCount() {
        List<CompareSpec> parsed = PortraitPreviewController.parseCompareSpecs(List.of(
                "p1:100", "p2:-100", "p3:200", "p4:-200", "p5:300", "p6:-300"));

        assertEquals(MAX_COMPARE_PORTRAITS, parsed.size());
        assertEquals("p4", parsed.get(parsed.size() - 1).portraitId(), "保留的是前 4 个");
    }

    @Test
    @DisplayName("格式不对时给出能看懂的中文报错，而不是静默忽略")
    void rejectsMalformedSpecs() {
        assertMalformed(List.of("p_without_offset"));
        assertMalformed(List.of("p_id:not-a-number"));
        assertMalformed(List.of(":461"));
        assertMalformed(List.of("p_id:"));
    }

    private static void assertMalformed(List<String> specs) {
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> PortraitPreviewController.parseCompareSpecs(specs));
        assertTrue(error.getMessage().contains("对比角色参数"),
                "报错要说明是「对比角色参数」，实际: " + error.getMessage());
    }
}
