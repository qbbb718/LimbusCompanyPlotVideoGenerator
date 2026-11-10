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
 * PUT /api/characters/{id} 响应里的立绘顺序（默认立绘在第一位）。
 *
 * <p>约定：保存角色后返回给前端的立绘顺序与 GET /api/characters 一致 ——
 * 默认立绘排在第一位，其余保持入参顺序；defaultPortrait 标记按库里实际写进去的结果回填。
 * 这样前端"列表首项 = 默认立绘"的兜底约定不会因为一次保存而错位，
 * 角色卡片头像也不会挑错图。
 */
class CharacterControllerPortraitOrderTest {

    @Test
    @DisplayName("默认立绘被挪到第一位，其余立绘保持原相对顺序")
    void movesDefaultPortraitToFront() {
        List<Portrait> input = Arrays.asList(
                portrait("a", false),
                portrait("b", false),
                portrait("default", false),
                portrait("c", false));

        List<Portrait> ordered = CharacterController.orderPortraitsDefaultFirst(input, "default");

        assertEquals(Arrays.asList("default", "a", "b", "c"), ids(ordered));
        // 入参不被改动
        assertEquals(Arrays.asList("a", "b", "default", "c"), ids(input));
    }

    @Test
    @DisplayName("defaultPortrait 标记按库里结果回填：入参一个标记都没有也能补上")
    void backfillsDefaultFlag() {
        List<Portrait> input = Arrays.asList(
                portrait("a", false),
                portrait("b", false),
                portrait("c", false));

        List<Portrait> ordered = CharacterController.orderPortraitsDefaultFirst(input, "c");

        assertEquals(Arrays.asList("c", "a", "b"), ids(ordered));
        assertTrue(ordered.get(0).isDefaultPortrait(), "默认立绘应带上标记");
        assertFalse(ordered.get(1).isDefaultPortrait());
        assertFalse(ordered.get(2).isDefaultPortrait());
    }

    @Test
    @DisplayName("入参带了多个（或带错）默认标记时，只保留库里那一个")
    void keepsExactlyOneDefaultFlag() {
        List<Portrait> input = Arrays.asList(
                portrait("a", true),
                portrait("b", true),
                portrait("c", false));

        List<Portrait> ordered = CharacterController.orderPortraitsDefaultFirst(input, "b");

        assertEquals(Arrays.asList("b", "a", "c"), ids(ordered));
        assertEquals(1, ordered.stream().filter(Portrait::isDefaultPortrait).count(),
                "同一角色只能有一个默认立绘");
        assertEquals("b", ordered.get(0).getPortraitID());
    }

    @Test
    @DisplayName("顺序本来就对：内容不变")
    void alreadyOrderedStaysStable() {
        List<Portrait> input = Arrays.asList(
                portrait("default", false),
                portrait("a", false));

        List<Portrait> ordered = CharacterController.orderPortraitsDefaultFirst(input, "default");

        assertEquals(Arrays.asList("default", "a"), ids(ordered));
        assertTrue(ordered.get(0).isDefaultPortrait());
    }

    @Test
    @DisplayName("默认立绘ID为空 / 列表为空时原样返回（不抛空指针）")
    void nullInputsReturnAsIs() {
        List<Portrait> input = Arrays.asList(portrait("a", false));
        assertNull(CharacterController.orderPortraitsDefaultFirst(null, "a"));
        assertEquals(input, CharacterController.orderPortraitsDefaultFirst(input, null));
        assertEquals(Collections.emptyList(),
                CharacterController.orderPortraitsDefaultFirst(new ArrayList<>(), "a"));
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
