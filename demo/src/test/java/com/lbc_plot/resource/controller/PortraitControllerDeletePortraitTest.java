package com.lbc_plot.resource.controller;

import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.dao.MyCharacterMapper;
import com.lbc_plot.resource.dao.PortraitDAO;
import com.lbc_plot.resource.dao.PortraitMapper;
import com.lbc_plot.resource.model.Emotion;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

import helpers.SQLiteTestDatabaseManager;

import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.sqlobject.SqlObjectPlugin;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 删除立绘接口的回归测试（默认立绘不能被"顺手删掉"）。
 *
 * <p>背景（修复的 bug）：{@code DELETE /api/characters/{cid}/portraits/{pid}} 的旧实现
 * 调的是 {@code deleteCharacterPortraits}，即"删掉该角色**全部**关联关系"。
 * 于是删掉任意一张立绘之后，其它立绘的 {@code is_default} 标记也一起没了，
 * 角色重新打开时默认立绘退回"按名称排序的第一张" —— 用户看到的就是
 * "资源管理-角色-立绘里默认立绘不在第一位了"。
 *
 * <p>现在只删这一条关联；若删掉的正是默认立绘，则把剩下的第一张（display_order 最小）
 * 提为默认，保证"角色至少有一张默认立绘"，且它永远和前端列表首项一致。
 */
class PortraitControllerDeletePortraitTest {

    private static final String CHARACTER_ID = "char_delete_portrait_test";
    private static final String PORTRAIT_A = "portrait_a";
    private static final String PORTRAIT_B = "portrait_b";
    private static final String PORTRAIT_C = "portrait_c";

    private SQLiteTestDatabaseManager dbManager;
    private PortraitDAO portraitDao;
    private PortraitController controller;

    @BeforeEach
    void setUp() throws Exception {
        dbManager = new SQLiteTestDatabaseManager();

        Jdbi jdbi = Jdbi.create(dbManager.getConnection())
                .installPlugin(new SqlObjectPlugin())
                .registerRowMapper(new PortraitMapper())
                .registerRowMapper(MyCharacter.class, new MyCharacterMapper());
        portraitDao = jdbi.onDemand(PortraitDAO.class);

        // 角色行必须存在（真实流程里立绘总是挂在已保存的角色下）
        jdbi.useExtension(CharacterDAO.class, dao -> dao.save(
                MyCharacter.builder()
                        .characterID(CHARACTER_ID)
                        .characterName("删除立绘接口测试角色")
                        .build()));

        // 名称顺序 A < B < C：保证"按名称排序"与"按默认立绘排序"结果不同，
        // 否则测不出默认标记是否真的保留下来了
        savePortrait(PORTRAIT_A, "A-普通");
        savePortrait(PORTRAIT_B, "B-严肃");
        savePortrait(PORTRAIT_C, "C-微笑");

        // 初始关联 A/B/C（A 落为默认），再把默认改成 B
        portraitDao.saveCharacterPortraits(CHARACTER_ID, Arrays.asList(
                findById(PORTRAIT_A), findById(PORTRAIT_B), findById(PORTRAIT_C)));
        portraitDao.setDefaultPortrait(CHARACTER_ID, PORTRAIT_B);

        controller = new PortraitController();
        ReflectionTestUtils.setField(controller, "jdbi", jdbi);
    }

    @AfterEach
    void tearDown() {
        if (dbManager != null) {
            dbManager.closeConnection();
        }
    }

    @Test
    @DisplayName("删掉非默认立绘：默认标记保留，默认立绘仍排在第一位")
    void deletingOtherPortraitKeepsDefault() {
        assertEquals(PORTRAIT_B, portraitDao.findDefaultPortraitId(CHARACTER_ID),
                "用例前提：B 是默认立绘");

        controller.deletePortrait(CHARACTER_ID, PORTRAIT_A, false);

        assertFalse(portraitDao.existsById(PORTRAIT_A), "立绘记录应被删除");
        assertEquals(PORTRAIT_B, portraitDao.findDefaultPortraitId(CHARACTER_ID),
                "删掉非默认立绘不应把默认标记一起删掉");
        assertEquals(1, countDefaults(), "同一角色应当只有一个默认立绘");

        List<Portrait> reloaded = portraitDao.findByCharacterId(CHARACTER_ID);
        assertEquals(2, reloaded.size(), "另外两张立绘的关联记录应当保留");
        assertEquals(PORTRAIT_B, reloaded.get(0).getPortraitID(),
                "默认立绘应重新加载后仍排在第一位");
        assertTrue(reloaded.get(0).isDefaultPortrait(), "默认立绘应带 defaultPortrait 标记");
    }

    @Test
    @DisplayName("删掉默认立绘：把剩下的第一张提为默认，列表首位仍然是默认立绘")
    void deletingDefaultPromotesFirstRemaining() {
        controller.deletePortrait(CHARACTER_ID, PORTRAIT_B, false);

        // 剩下的 A（display_order 0）、C（display_order 2）→ 第一张 A
        assertEquals(PORTRAIT_A, portraitDao.findDefaultPortraitId(CHARACTER_ID),
                "删掉默认立绘后应把剩下的第一张提为默认");
        assertEquals(1, countDefaults(), "提为默认后仍然只能有一个默认立绘");

        List<Portrait> reloaded = portraitDao.findByCharacterId(CHARACTER_ID);
        assertEquals(2, reloaded.size());
        assertEquals(PORTRAIT_A, reloaded.get(0).getPortraitID(),
                "新的默认立绘应排在第一位");
        assertTrue(reloaded.get(0).isDefaultPortrait());
    }

    @Test
    @DisplayName("删光所有立绘：不报错，角色没有默认立绘")
    void deletingAllPortraitsLeavesNoDefault() {
        controller.deletePortrait(CHARACTER_ID, PORTRAIT_A, false);
        controller.deletePortrait(CHARACTER_ID, PORTRAIT_B, false);
        controller.deletePortrait(CHARACTER_ID, PORTRAIT_C, false);

        assertNull(portraitDao.findDefaultPortraitId(CHARACTER_ID),
                "没有立绘时不应凭空留下默认立绘");
        assertTrue(portraitDao.findByCharacterId(CHARACTER_ID).isEmpty());
    }

    @Test
    @DisplayName("立绘不存在时删除接口安静返回，不误删其它立绘的关联")
    void deletingMissingPortraitKeepsOthers() {
        controller.deletePortrait(CHARACTER_ID, "portrait_not_exists", false);

        List<Portrait> reloaded = portraitDao.findByCharacterId(CHARACTER_ID);
        assertEquals(3, reloaded.size(), "不存在的立绘不应影响其它关联记录");
        assertEquals(PORTRAIT_B, portraitDao.findDefaultPortraitId(CHARACTER_ID));
    }

    // ========== 辅助方法 ==========

    private void savePortrait(String portraitId, String portName) {
        portraitDao.save(Portrait.builder(CHARACTER_ID + "/" + portraitId + ".png")
                .portraitID(portraitId)
                .characterID(CHARACTER_ID)
                .portName(portName)
                .emotion(Emotion.NORMAL)
                .build());
    }

    private Portrait findById(String portraitId) {
        return portraitDao.findById(portraitId)
                .orElseThrow(() -> new IllegalStateException("立绘不存在: " + portraitId));
    }

    private int countDefaults() {
        return (int) portraitDao.findByCharacterId(CHARACTER_ID).stream()
                .filter(Portrait::isDefaultPortrait)
                .count();
    }
}
