package DAO;

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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 默认立绘持久化回归测试。
 *
 * 背景（修复的 bug）：修改角色的默认立绘后，切换页面又回到修改前的默认立绘。
 * 原因有两处：
 * 1. PortraitDAO.setDefaultPortrait 只把新立绘标记为默认，没有清掉旧立绘的
 * is_default，于是"默认"不唯一，读取时可能又取回旧立绘；
 * 2. saveCharacterPortraits 无条件把列表第一个立绘设为默认，导致保存角色
 * （PUT /api/characters/{id} 会重建关联关系）时把用户的默认立绘选择重置掉。
 */
class PortraitDefaultPersistenceTest {

    private static final Logger logger = LoggerFactory.getLogger(PortraitDefaultPersistenceTest.class);

    private static final String CHARACTER_ID = "char_default_test";
    private static final String PORTRAIT_A = "portrait_a";
    private static final String PORTRAIT_B = "portrait_b";
    private static final String PORTRAIT_C = "portrait_c";

    private PortraitDAO portraitDao;
    private SQLiteTestDatabaseManager dbManager;

    @BeforeEach
    void setUp() throws SQLException {
        dbManager = new SQLiteTestDatabaseManager();

        Jdbi jdbi = Jdbi.create(dbManager.getConnection())
                .installPlugin(new SqlObjectPlugin())
                .registerRowMapper(new PortraitMapper());

        portraitDao = jdbi.onDemand(PortraitDAO.class);

        // 名称顺序：A < B < C，保证"按名称排序"与"按默认立绘排序"结果不同，
        // 否则测试无法区分默认立绘是否真的生效。
        savePortrait(PORTRAIT_A, "A-普通");
        savePortrait(PORTRAIT_B, "B-严肃");
        savePortrait(PORTRAIT_C, "C-微笑");

        // 初始关联：A 为默认（等价于 HistoricalBehavior 里"第一个立绘是默认"）
        portraitDao.saveCharacterPortraits(
                CHARACTER_ID, Arrays.asList(findById(PORTRAIT_A), findById(PORTRAIT_B), findById(PORTRAIT_C)));
    }

    @AfterEach
    void tearDown() {
        if (dbManager != null) {
            dbManager.closeConnection();
        }
    }

    @Test
    @DisplayName("设置默认立绘后，同一角色只保留一个默认标记")
    void setDefaultPortraitLeavesExactlyOneDefault() {
        logger.info("把默认立绘从 A 改为 B");

        portraitDao.setDefaultPortrait(CHARACTER_ID, PORTRAIT_B);

        assertEquals(1, countDefaults(), "同一角色应当只有一个默认立绘");
        assertEquals(PORTRAIT_B, portraitDao.findDefaultPortraitId(CHARACTER_ID));
    }

    @Test
    @DisplayName("设置默认立绘后重新查询，默认立绘排在最前且带 defaultPortrait 标记")
    void defaultPortraitSurvivesReload() {
        portraitDao.setDefaultPortrait(CHARACTER_ID, PORTRAIT_C);

        // 模拟切换页面后重新拉取角色（CharacterMapper/PortraitDAO.findByCharacterId）
        List<Portrait> reloaded = portraitDao.findByCharacterId(CHARACTER_ID);

        assertEquals(3, reloaded.size());
        assertEquals(PORTRAIT_C, reloaded.get(0).getPortraitID(),
                "重新加载后默认立绘应排在第一位");
        assertTrue(reloaded.get(0).isDefaultPortrait(),
                "重新加载后默认立绘应带 defaultPortrait 标记");

        long marked = reloaded.stream().filter(Portrait::isDefaultPortrait).count();
        assertEquals(1, marked, "只能有一个立绘带默认标记");
    }

    @Test
    @DisplayName("保存角色时不带默认标记，已有默认立绘不会被重置")
    void saveCharacterPortraitsKeepsExistingDefault() {
        portraitDao.setDefaultPortrait(CHARACTER_ID, PORTRAIT_C);

        // 复现 CharacterController.updateCharacter 的保存流程：
        // 先记下当前默认立绘，删除全部关联后重建，入参未携带 defaultPortrait 标记
        String preserved = portraitDao.findDefaultPortraitId(CHARACTER_ID);
        portraitDao.deleteCharacterPortraits(CHARACTER_ID);
        portraitDao.saveCharacterPortraits(CHARACTER_ID, Arrays.asList(
                findById(PORTRAIT_A), findById(PORTRAIT_B), findById(PORTRAIT_C)), preserved);

        assertEquals(PORTRAIT_C, portraitDao.findDefaultPortraitId(CHARACTER_ID),
                "保存角色不应把默认立绘重置回列表首项");
        assertEquals(1, countDefaults(), "同一角色应当只有一个默认立绘");
    }

    @Test
    @DisplayName("保存角色时带默认标记，以入参标记为准（默认立绘不是第一个）")
    void saveCharacterPortraitsHonoursIncomingDefaultFlag() {
        // 前端本地状态：用户选了 B，B 的 defaultPortrait = true，但 B 不在列表首位
        List<Portrait> incoming = Arrays.asList(
                findById(PORTRAIT_A),
                withDefaultFlag(PORTRAIT_B, true),
                findById(PORTRAIT_C));

        portraitDao.deleteCharacterPortraits(CHARACTER_ID);
        portraitDao.saveCharacterPortraits(CHARACTER_ID, incoming);

        assertEquals(PORTRAIT_B, portraitDao.findDefaultPortraitId(CHARACTER_ID),
                "应当以入参携带的默认标记为准");
        assertEquals(1, countDefaults(), "同一角色应当只有一个默认立绘");
    }

    @Test
    @DisplayName("关联记录缺失时设置默认立绘会自动补齐关联")
    void setDefaultPortraitRepairsMissingAssociation() {
        // 模拟：立绘刚上传、还没保存过角色，关联表里完全没有该角色的记录
        portraitDao.deleteCharacterPortraits(CHARACTER_ID);

        // PortraitController.setDefaultPortrait 的行为：先补齐关联，再设置默认
        portraitDao.ensureCharacterPortrait(CHARACTER_ID, PORTRAIT_B);
        portraitDao.setDefaultPortrait(CHARACTER_ID, PORTRAIT_B);

        assertEquals(PORTRAIT_B, portraitDao.findDefaultPortraitId(CHARACTER_ID));

        // 关联表里应当只有 B 一条记录（findByCharacterId 查的是 portraits 表，
        // 不受关联记录影响，所以这里直接断言默认立绘ID与标记唯一性）
        assertEquals(1, countDefaults(), "补齐后应当只有一个默认立绘");

        List<Portrait> reloaded = portraitDao.findByCharacterId(CHARACTER_ID);
        assertEquals(PORTRAIT_B, reloaded.get(0).getPortraitID(),
                "默认立绘应排在第一位");
        assertTrue(reloaded.get(0).isDefaultPortrait());
    }

    // ========== 辅助方法 ==========

    private void savePortrait(String portraitId, String portName) {
        portraitDao.save(Portrait.builder(portraitId + ".png")
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

    private Portrait withDefaultFlag(String portraitId, boolean isDefault) {
        Portrait portrait = findById(portraitId);
        portrait.setDefaultPortrait(isDefault);
        return portrait;
    }

    /**
     * 统计该角色带默认标记的关联记录数
     */
    private int countDefaults() {
        return (int) portraitDao.findByCharacterId(CHARACTER_ID).stream()
                .filter(Portrait::isDefaultPortrait)
                .count();
    }
}
