package com.lbc_plot.resource.controller;

import com.lbc_plot.resource.model.Emotion;
import com.lbc_plot.resource.model.Portrait;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PUT /api/characters/{id} 响应里的立绘顺序与默认标记。
 *
 * <p>约定（默认立绘不再强制第一）：
 * <ol>
 *   <li>响应顺序 = 请求体顺序（也就是刚写进 {@code display_order} 的顺序），
 *       默认立绘在中间 / 末尾也不会被挪到第一位；</li>
 *   <li>{@code defaultPortrait} 标记按库里实际写进去的结果回填，
 *       入参一个标记都没带也能补上，同一角色只保留一个标记。</li>
 * </ol>
 */
class CharacterControllerPortraitOrderTest {

    @Test
    @DisplayName("保持入参顺序：默认立绘在中间也不会被挪到第一位")
    void keepsInputOrderWithDefaultInTheMiddle() {
        List<Portrait> input = Arrays.asList(
                portrait("a", false),
                portrait("default", false),
                portrait("b", false),
                portrait("c", false));

        List<Portrait> ordered = CharacterController.applyDefaultPortraitFlags(input, "default");

        assertEquals(Arrays.asList("a", "default", "b", "c"), ids(ordered));
        assertTrue(ordered.get(1).isDefaultPortrait(), "默认立绘应在原位置带上标记");
        assertFalse(ordered.get(0).isDefaultPortrait());
        // 入参顺序不被改动
        assertEquals(Arrays.asList("a", "default", "b", "c"), ids(input));
    }

    @Test
    @DisplayName("defaultPortrait 标记按库里结果回填：入参一个标记都没有也能补上")
    void backfillsDefaultFlag() {
        List<Portrait> input = Arrays.asList(
                portrait("a", false),
                portrait("b", false),
                portrait("c", false));

        List<Portrait> ordered = CharacterController.applyDefaultPortraitFlags(input, "c");

        assertEquals(Arrays.asList("a", "b", "c"), ids(ordered));
        assertFalse(ordered.get(0).isDefaultPortrait());
        assertFalse(ordered.get(1).isDefaultPortrait());
        assertTrue(ordered.get(2).isDefaultPortrait(), "默认立绘应带上标记，且留在末尾");
    }

    @Test
    @DisplayName("入参带了多个（或带错）默认标记时，只保留库里那一个")
    void keepsExactlyOneDefaultFlag() {
        List<Portrait> input = Arrays.asList(
                portrait("a", true),
                portrait("b", true),
                portrait("c", false));

        List<Portrait> ordered = CharacterController.applyDefaultPortraitFlags(input, "b");

        assertEquals(Arrays.asList("a", "b", "c"), ids(ordered));
        assertEquals(1, ordered.stream().filter(Portrait::isDefaultPortrait).count(),
                "同一角色只能有一个默认立绘");
        assertTrue(ordered.get(1).isDefaultPortrait());
    }

    @Test
    @DisplayName("库里没有默认立绘（ID为空）时清空所有标记，不凭空造一个")
    void nullDefaultClearsAllFlags() {
        List<Portrait> input = Arrays.asList(
                portrait("a", true),
                portrait("b", false));

        List<Portrait> ordered = CharacterController.applyDefaultPortraitFlags(input, null);

        assertEquals(Arrays.asList("a", "b"), ids(ordered));
        assertTrue(ordered.stream().noneMatch(Portrait::isDefaultPortrait));
    }

    @Test
    @DisplayName("列表为空 / null 时原样返回（不抛空指针）")
    void nullInputsReturnAsIs() {
        List<Portrait> input = Arrays.asList(portrait("a", false));
        assertNull(CharacterController.applyDefaultPortraitFlags(null, "a"));
        assertEquals(input, CharacterController.applyDefaultPortraitFlags(input, "a"));
        assertEquals(Collections.emptyList(),
                CharacterController.applyDefaultPortraitFlags(new ArrayList<>(), "a"));
    }

    // ========== 辅助方法 ==========

    private static Portrait portrait(String portraitId, boolean defaultPortrait) {
        return Portrait.builder(portraitId + ".png")
                .portraitID(portraitId)
                .characterID("char_order_test")
                .portName("立绘-" + portraitId)
                .emotion(Emotion.NORMAL)
                .defaultPortrait(defaultPortrait)
                .build();
    }

    private static List<String> ids(List<Portrait> portraits) {
        List<String> ids = new ArrayList<>();
        for (Portrait portrait : portraits) {
            ids.add(portrait.getPortraitID());
        }
        return ids;
    }
}
