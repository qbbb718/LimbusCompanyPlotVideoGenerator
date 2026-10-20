package com.lbc_plot.resource.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lbc_plot.resource.character.CharacterCardImageCache;
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

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/**
 * 「设置默认立绘」接口的回归测试。
 *
 * <p>背景（修复的 bug）：前端新加的立绘在上传后只存在于本地状态，portraits 表里的记录
 * 要等用户点「保存」（PUT /api/characters/{id}）才写。用户在保存前点「设为默认」时，
 * 后端在 portraits 表里查不到这条立绘，直接抛"立绘不存在"，界面上弹出
 * "设置默认立绘失败，请重试"。
 *
 * <p>修复方式：接口允许前端把立绘数据一起带过来，库里没有记录时先用它补写，
 * 再补角色-立绘关联、设默认。这里直接调用控制器方法，覆盖"补写"、"照旧报错"、
 * "立绘已入库"三条分支。
 */
class PortraitControllerDefaultPortraitTest {

    private static final String CHARACTER_ID = "char_default_endpoint_test";
    private static final String PORTRAIT_ID = "portrait_pending_save";

    private SQLiteTestDatabaseManager dbManager;
    private PortraitDAO portraitDao;
    private PortraitController controller;

    @BeforeEach
    void setUp() throws Exception {
        dbManager = new SQLiteTestDatabaseManager();

        Jdbi jdbi = Jdbi.create(dbManager.getConnection())
                .installPlugin(new SqlObjectPlugin())
                .registerRowMapper(new PortraitMapper())
                // 与 SpringBootConfig 里的全局注册保持一致，CharacterDAO.findById 才能映射角色
                .registerRowMapper(MyCharacter.class, new MyCharacterMapper());
        portraitDao = jdbi.onDemand(PortraitDAO.class);

        // 角色必须已经入库：立绘上传、设默认都以角色存在为前提
        jdbi.useExtension(CharacterDAO.class, dao -> dao.save(
                MyCharacter.builder()
                        .characterID(CHARACTER_ID)
                        .characterName("默认立绘接口测试角色")
                        .build()));

        controller = new PortraitController();
        ReflectionTestUtils.setField(controller, "jdbi", jdbi);
        // 名片缓存在这条用例里只是副作用；用 mock 免去 Spring 容器依赖
        ReflectionTestUtils.setField(controller, "characterCardImageCache",
                mock(CharacterCardImageCache.class));
    }

    @AfterEach
    void tearDown() {
        if (dbManager != null) {
            dbManager.closeConnection();
        }
    }

    @Test
    @DisplayName("立绘还没入库时，用请求体里的立绘数据补写记录并设为默认")
    void createsMissingPortraitRecordThenMarksDefault() {
        assertFalse(portraitDao.existsById(PORTRAIT_ID),
                "用例前提：portraits 表里还没有这条立绘（只上传了文件）");

        // 模拟前端本地状态里那张"刚上传、还没保存"的立绘
        Portrait pending = Portrait.builder(CHARACTER_ID + "/" + PORTRAIT_ID + ".png")
                .portraitID(PORTRAIT_ID)
                .characterID(CHARACTER_ID)
                .portName("还没保存的立绘")
                .emotion(Emotion.HAPPY)
                .faceX(12)
                .faceY(34)
                .length(56)
                .thumbnailPath("/assets/characters/" + CHARACTER_ID
                        + "/thumbnails/thumbnail_" + PORTRAIT_ID + ".png")
                .build();

        controller.setDefaultPortrait(CHARACTER_ID, PORTRAIT_ID, pending);

        Portrait saved = portraitDao.findById(PORTRAIT_ID)
                .orElseThrow(() -> new AssertionError("接口应当用请求体补写立绘记录"));
        assertEquals(CHARACTER_ID, saved.getCharacterID(), "立绘应属于请求里的角色");
        assertEquals("还没保存的立绘", saved.getPortName());
        assertEquals(Emotion.HAPPY, saved.getEmotion());
        assertEquals(56, saved.getLength(), "裁剪参数应一并写进记录");

        assertEquals(PORTRAIT_ID, portraitDao.findDefaultPortraitId(CHARACTER_ID),
                "补写完成后应当把这张立绘设为默认");

        List<Portrait> reloaded = portraitDao.findByCharacterId(CHARACTER_ID);
        assertEquals(1, reloaded.size());
        assertTrue(reloaded.get(0).isDefaultPortrait(), "重新加载后应带默认立绘标记");
    }

    @Test
    @DisplayName("请求体里的立绘ID与路径不一致时，以路径上的ID为准")
    void pathPortraitIdWinsOverRequestBodyId() {
        Portrait mismatched = Portrait.builder(CHARACTER_ID + "/" + PORTRAIT_ID + ".png")
                .portraitID("portrait_id_from_body")
                .characterID("char_id_from_body")
                .portName("ID 不一致的立绘")
                .build();

        controller.setDefaultPortrait(CHARACTER_ID, PORTRAIT_ID, mismatched);

        assertTrue(portraitDao.existsById(PORTRAIT_ID), "记录应落在路径上的立绘ID下");
        assertFalse(portraitDao.existsById("portrait_id_from_body"),
                "不应按请求体里的立绘ID建记录");
        assertEquals(PORTRAIT_ID, portraitDao.findDefaultPortraitId(CHARACTER_ID));
    }

    @Test
    @DisplayName("立绘不存在且没带请求体时，仍然报\"立绘不存在\"，不会凭空建记录")
    void stillFailsWithoutPortraitBody() {
        RuntimeException error = assertThrows(RuntimeException.class,
                () -> controller.setDefaultPortrait(CHARACTER_ID, PORTRAIT_ID, null));

        assertTrue(error.getMessage().contains("立绘不存在"),
                "异常信息应说明立绘不存在，实际为: " + error.getMessage());
        assertFalse(portraitDao.existsById(PORTRAIT_ID), "没有请求体时不应补写记录");
        assertNull(portraitDao.findDefaultPortraitId(CHARACTER_ID));
    }

    @Test
    @DisplayName("立绘已入库时，不带请求体也能照旧设为默认")
    void marksExistingPortraitAsDefault() {
        portraitDao.save(Portrait.builder(CHARACTER_ID + "/" + PORTRAIT_ID + ".png")
                .portraitID(PORTRAIT_ID)
                .characterID(CHARACTER_ID)
                .portName("已入库的立绘")
                .emotion(Emotion.NORMAL)
                .build());

        controller.setDefaultPortrait(CHARACTER_ID, PORTRAIT_ID, null);

        assertEquals(PORTRAIT_ID, portraitDao.findDefaultPortraitId(CHARACTER_ID));
    }

    @Test
    @DisplayName("前端发来的立绘 JSON（emotion 用小写 code）能直接反序列化成补写用的请求体")
    void acceptsFrontendJsonBody() throws Exception {
        // 与 ApiService.setDefaultPortrait 实际序列化的 Portrait 字段保持一致
        String json = """
                {
                  "portraitID": "%s",
                  "characterID": "%s",
                  "imagePath": "%s/%s.png",
                  "portName": "罗佳-default",
                  "emotion": "happy",
                  "faceX": 10,
                  "faceY": 20,
                  "length": 30,
                  "adjX": 0,
                  "adjY": 0,
                  "thumbnailPath": null,
                  "defaultPortrait": false
                }
                """.formatted(PORTRAIT_ID, CHARACTER_ID, CHARACTER_ID, PORTRAIT_ID);

        Portrait body = new ObjectMapper().readValue(json, Portrait.class);
        assertEquals(Emotion.HAPPY, body.getEmotion(), "小写 emotion code 应映射成枚举");

        controller.setDefaultPortrait(CHARACTER_ID, PORTRAIT_ID, body);

        Portrait saved = portraitDao.findById(PORTRAIT_ID)
                .orElseThrow(() -> new AssertionError("JSON 请求体应当被补写进 portraits 表"));
        assertEquals(Emotion.HAPPY, saved.getEmotion());
        assertEquals(30, saved.getLength());
        assertEquals(PORTRAIT_ID, portraitDao.findDefaultPortraitId(CHARACTER_ID));
    }
}
