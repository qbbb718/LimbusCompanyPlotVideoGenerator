package com.lbc_plot.resource.controller;

import com.lbc_plot.resource.dao.PortraitDAO;
import com.lbc_plot.resource.dao.PortraitMapper;
import com.lbc_plot.resource.model.Emotion;
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
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 立绘拖拽排序接口（{@code PUT /api/characters/{id}/portraits/order}）的回归测试。
 *
 * <p>锁住三件事：
 * <ol>
 *   <li>顺序写进 {@code character_portraits.display_order}，重新查询按它返回；</li>
 *   <li>默认立绘随卡片一起移动，不因排序被清掉 / 被顶到第一；</li>
 *   <li>请求里混入还没入库的立绘ID / 重复ID / 空列表时不报错（前端可能带着刚上传的立绘）。</li>
 * </ol>
 */
class PortraitControllerPortraitOrderTest {

    private static final String CHARACTER_ID = "char_reorder_test";
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
                .registerRowMapper(new PortraitMapper());
        portraitDao = jdbi.onDemand(PortraitDAO.class);

        savePortrait(PORTRAIT_A, "A-普通");
        savePortrait(PORTRAIT_B, "B-严肃");
        savePortrait(PORTRAIT_C, "C-微笑");

        // 初始顺序 A → B → C，默认立绘 B 在中间（刻意不是第一张）
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
    @DisplayName("按请求顺序重建 display_order，默认立绘跟着卡片走")
    void reorderPersistsAndKeepsDefaultPortrait() {
        controller.updatePortraitOrder(CHARACTER_ID,
                Arrays.asList(PORTRAIT_C, PORTRAIT_B, PORTRAIT_A));

        List<Portrait> reloaded = portraitDao.findByCharacterId(CHARACTER_ID);
        assertEquals(Arrays.asList(PORTRAIT_C, PORTRAIT_B, PORTRAIT_A), ids(reloaded),
                "重新查询应按新顺序返回");

        Portrait defaultPortrait = reloaded.stream()
                .filter(Portrait::isDefaultPortrait)
                .findFirst()
                .orElseThrow(() -> new AssertionError("默认标记不应丢失"));
        assertEquals(PORTRAIT_B, defaultPortrait.getPortraitID(),
                "默认立绘随卡片移动到第二位，仍然只有一个");
        assertEquals(1, reloaded.stream().filter(Portrait::isDefaultPortrait).count());
        assertEquals(PORTRAIT_B, portraitDao.findDefaultPortraitId(CHARACTER_ID));
    }

    @Test
    @DisplayName("混入刚上传、还没入库的立绘ID：跳过它，其余顺序照常保存")
    void skipsPortraitIdsNotYetPersisted() {
        assertDoesNotThrow(() -> controller.updatePortraitOrder(CHARACTER_ID,
                Arrays.asList(PORTRAIT_C, "portrait_just_uploaded", PORTRAIT_A, PORTRAIT_B)));

        List<Portrait> reloaded = portraitDao.findByCharacterId(CHARACTER_ID);
        assertEquals(Arrays.asList(PORTRAIT_C, PORTRAIT_A, PORTRAIT_B), ids(reloaded),
                "未入库的ID不占用结果，但已入库立绘的相对顺序与请求一致");
        assertTrue(reloaded.get(2).isDefaultPortrait(), "默认标记仍然在 B 上");
    }

    @Test
    @DisplayName("重复ID / 空ID / 空列表：安静处理，不报错、不乱改顺序")
    void handlesDuplicateBlankAndEmptyInput() {
        controller.updatePortraitOrder(CHARACTER_ID,
                Arrays.asList(PORTRAIT_C, PORTRAIT_C, null, "  ", PORTRAIT_A));
        assertEquals(Arrays.asList(PORTRAIT_C, PORTRAIT_A, PORTRAIT_B),
                ids(portraitDao.findByCharacterId(CHARACTER_ID)),
                "重复 / 空ID 只认第一次出现的有效值");

        // 空列表不动现有顺序
        controller.updatePortraitOrder(CHARACTER_ID, Collections.emptyList());
        assertEquals(Arrays.asList(PORTRAIT_C, PORTRAIT_A, PORTRAIT_B),
                ids(portraitDao.findByCharacterId(CHARACTER_ID)));

        // 请求体可空（老前端 / 异常调用）也不抛
        assertDoesNotThrow(() -> controller.updatePortraitOrder(CHARACTER_ID, null));
    }

    @Test
    @DisplayName("历史数据一个默认标记都没有：排序后把第一张补为默认，身份不再随顺序漂移")
    void backfillsDefaultWhenLegacyDataHasNone() {
        portraitDao.clearDefaultPortraits(CHARACTER_ID);
        assertEquals(0, portraitDao.countDefaultPortraits(CHARACTER_ID),
                "用例前提：先清空默认标记");

        controller.updatePortraitOrder(CHARACTER_ID,
                Arrays.asList(PORTRAIT_C, PORTRAIT_A, PORTRAIT_B));

        // 排序后的第一张（C）被补为默认，其它立绘不带标记
        List<Portrait> reloaded = portraitDao.findByCharacterId(CHARACTER_ID);
        assertEquals(PORTRAIT_C, reloaded.get(0).getPortraitID());
        assertTrue(reloaded.get(0).isDefaultPortrait(), "应给第一张补上默认标记");
        assertEquals(1, reloaded.stream().filter(Portrait::isDefaultPortrait).count(),
                "补标记后仍然只有一个默认立绘");
    }

    @Test
    @DisplayName("排序后追加新立绘的序号接在最大值后面")
    void nextDisplayOrderFollowsReorder() {
        controller.updatePortraitOrder(CHARACTER_ID,
                Arrays.asList(PORTRAIT_C, PORTRAIT_A, PORTRAIT_B));

        assertEquals(3, portraitDao.findNextDisplayOrder(CHARACTER_ID),
                "三张立绘占 0/1/2，下一张应是 3");
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

    private static List<String> ids(List<Portrait> portraits) {
        return portraits.stream().map(Portrait::getPortraitID).toList();
    }
}
