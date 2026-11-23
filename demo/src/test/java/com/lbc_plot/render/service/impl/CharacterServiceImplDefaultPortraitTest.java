package com.lbc_plot.render.service.impl;

import com.lbc_plot.resource.model.Emotion;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 默认立绘的取值回归测试。
 *
 * <p>立绘列表支持拖拽排序之后，默认立绘可以在任意位置；渲染 / 文本解析等后端路径
 * 必须认 {@code is_default} 标记，而不是取列表第一张。
 */
class CharacterServiceImplDefaultPortraitTest {

    private final CharacterServiceImpl service = new CharacterServiceImpl(null, null);

    @Test
    @DisplayName("默认立绘在中间时取带标记的那张，不取第一张")
    void usesDefaultFlagInsteadOfFirstPosition() {
        MyCharacter character = MyCharacter.builder()
                .characterID("char_default_service_test")
                .characterName("测试角色")
                .portraits(new ArrayList<>(Arrays.asList(
                        portrait("a", false),
                        portrait("b", true),
                        portrait("c", false))))
                .build();

        assertEquals("b", service.getDefaultPortrait(character).getPortraitID());
    }

    @Test
    @DisplayName("默认立绘在末尾时也取它")
    void usesDefaultFlagAtTheEnd() {
        MyCharacter character = MyCharacter.builder()
                .characterID("char_default_service_test")
                .characterName("测试角色")
                .portraits(new ArrayList<>(Arrays.asList(
                        portrait("a", false),
                        portrait("b", false),
                        portrait("c", true))))
                .build();

        assertEquals("c", service.getDefaultPortrait(character).getPortraitID());
    }

    @Test
    @DisplayName("一个默认标记都没有时退回第一张（老数据兜底）")
    void fallsBackToFirstWhenNoFlag() {
        MyCharacter character = MyCharacter.builder()
                .characterID("char_default_service_test")
                .characterName("测试角色")
                .portraits(new ArrayList<>(Arrays.asList(
                        portrait("a", false),
                        portrait("b", false))))
                .build();

        assertEquals("a", service.getDefaultPortrait(character).getPortraitID());
    }

    @Test
    @DisplayName("没有立绘且没有 DAO 兜底时返回 null，不抛异常")
    void returnsNullWhenNoPortraits() {
        MyCharacter character = MyCharacter.builder()
                .characterID("char_default_service_empty")
                .characterName("空角色")
                .build();

        assertNull(service.getDefaultPortrait(character));
    }

    private static Portrait portrait(String portraitId, boolean defaultPortrait) {
        return Portrait.builder(portraitId + ".png")
                .portraitID(portraitId)
                .characterID("char_default_service_test")
                .portName("立绘-" + portraitId)
                .emotion(Emotion.NORMAL)
                .defaultPortrait(defaultPortrait)
                .build();
    }
}
