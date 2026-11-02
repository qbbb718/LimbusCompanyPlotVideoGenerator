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

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@code GET /api/characters} 的回归测试。
 *
 * <p>背景：运行日志里这个接口对 <b>2 个角色</b> 稳定耗时 3~4 秒（20/20 次全部如此）。
 * 原因是 {@code CharacterMapper.map()} 每映射一行角色就调一次
 * {@code jdbi.withExtension(PortraitDAO...)}，而数据源是 {@code DriverManagerDataSource}
 * （没有连接池），等于"每个角色多建一条 SQLite 连接"。
 *
 * <p>修复后固定两条 SQL、共用同一条连接。这里用内存库验证：
 * <ol>
 *   <li>每个角色的立绘都被挂回去（不是空列表）</li>
 *   <li>默认立绘排在第一位（前端依赖 portraits[0] 的老约定）</li>
 *   <li>没有立绘、不存在的角色不会让接口崩掉</li>
 * </ol>
 */
class CharacterControllerGetCharactersTest {

    private static final String CHAR_A = "char_get_all_a";
    private static final String CHAR_B = "char_get_all_b";

    private SQLiteTestDatabaseManager dbManager;
    private Jdbi jdbi;
    private CharacterController controller;

    @BeforeEach
    void setUp() throws Exception {
        dbManager = new SQLiteTestDatabaseManager();
        jdbi = Jdbi.create(dbManager.getConnection())
                .installPlugin(new SqlObjectPlugin())
                .registerRowMapper(new PortraitMapper())
                .registerRowMapper(MyCharacter.class, new MyCharacterMapper());

        controller = new CharacterController();
        ReflectionTestUtils.setField(controller, "jdbi", jdbi);

        jdbi.useExtension(CharacterDAO.class, dao -> {
            dao.save(character(CHAR_A, "阿尔法"));
            dao.save(character(CHAR_B, "贝塔"));
        });
    }

    @AfterEach
    void tearDown() {
        if (dbManager != null) {
            dbManager.closeConnection();
        }
    }

    private static MyCharacter character(String id, String name) {
        return MyCharacter.builder()
                .characterID(id)
                .characterName(name)
                .faction("测试阵营")
                .build();
    }

    private static Portrait portrait(String id, String characterId, String name, Emotion emotion) {
        return Portrait.builder(characterId + "/" + id + ".png")
                .portraitID(id)
                .characterID(characterId)
                .portName(name)
                .emotion(emotion)
                .faceX(1)
                .faceY(2)
                .length(3)
                .thumbnailPath("/assets/characters/" + characterId + "/thumbnails/" + id + ".png")
                .build();
    }

    @Test
    @DisplayName("一次查询就把每个角色的立绘挂回去，且默认立绘排在最前")
    void loadsPortraitsForEveryCharacterInOnePass() {
        jdbi.useExtension(PortraitDAO.class, dao -> {
            dao.save(portrait("p_a_normal", CHAR_A, "A-普通", Emotion.NORMAL));
            dao.save(portrait("p_a_happy", CHAR_A, "A-开心", Emotion.HAPPY));
            dao.save(portrait("p_b_normal", CHAR_B, "B-普通", Emotion.NORMAL));
            dao.saveCharacterPortrait(CHAR_A, "p_a_happy", true, 0);
            dao.saveCharacterPortrait(CHAR_A, "p_a_normal", false, 1);
            dao.saveCharacterPortrait(CHAR_B, "p_b_normal", true, 0);
        });

        List<MyCharacter> characters = controller.getCharacters();

        assertEquals(2, characters.size(), "应返回两个角色");
        MyCharacter a = characters.stream()
                .filter(c -> CHAR_A.equals(c.getCharacterID())).findFirst().orElseThrow();
        MyCharacter b = characters.stream()
                .filter(c -> CHAR_B.equals(c.getCharacterID())).findFirst().orElseThrow();

        assertNotNull(a.getPortraits(), "角色的立绘列表不应为 null");
        assertEquals(2, a.getPortraits().size(), "阿尔法应有 2 张立绘");
        assertEquals(1, b.getPortraits().size(), "贝塔应有 1 张立绘");

        assertEquals("p_a_happy", a.getPortraits().get(0).getPortraitID(),
                "默认立绘必须排在第一位（前端 portraits[0] 的老约定）");
        assertTrue(a.getPortraits().get(0).isDefaultPortrait(),
                "第一张立绘应带默认标记");
        assertEquals("A-开心", a.getPortraits().get(0).getPortName());
        assertEquals(1, a.getPortraits().get(0).getFaceX(), "裁剪参数应完整映射");
        assertEquals("/assets/characters/" + CHAR_A + "/thumbnails/p_a_happy.png",
                a.getPortraits().get(0).getThumbnailPath(), "缩略图路径应完整映射");

        assertEquals(CHAR_B, b.getPortraits().get(0).getCharacterID(),
                "立绘必须只属于它自己的角色，不能串到别的角色上");
    }

    @Test
    @DisplayName("没有立绘的角色返回空列表而不是 null，也不会因为别家有立绘而错乱")
    void characterWithoutPortraitsGetsEmptyList() {
        jdbi.useExtension(PortraitDAO.class, dao -> {
            dao.save(portrait("p_b_normal", CHAR_B, "B-普通", Emotion.NORMAL));
            dao.saveCharacterPortrait(CHAR_B, "p_b_normal", true, 0);
        });

        List<MyCharacter> characters = controller.getCharacters();

        MyCharacter a = characters.stream()
                .filter(c -> CHAR_A.equals(c.getCharacterID())).findFirst().orElseThrow();
        assertTrue(a.getPortraits().isEmpty(), "没有立绘的角色应得到空列表");
    }

    @Test
    @DisplayName("数据库为空时返回空列表，不抛异常")
    void emptyDatabaseReturnsEmptyList() {
        jdbi.useExtension(CharacterDAO.class, dao -> {
            dao.delete(CHAR_A);
            dao.delete(CHAR_B);
        });

        assertTrue(controller.getCharacters().isEmpty());
    }
}
