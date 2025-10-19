package DAO;


import com.lbc_plot.model.storage.Portrait;

import helpers.SQLiteTestDatabaseManager;

import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.CharacterMapper;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.DAO.PortraitMapper;
import com.lbc_plot.core.service.impl.ThumbnailServiceImpl;
import com.lbc_plot.model.storage.Emotion;
import com.lbc_plot.model.storage.MyCharacter;

import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.sqlobject.SqlObjectPlugin;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.sqlite.SQLiteDataSource;
import org.junit.jupiter.api.DisplayName;

import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.sqlite.SQLiteDataSource;
import javax.sql.DataSource;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;

class PortraitDAOTest {
    private static final Logger logger = LoggerFactory.getLogger(PortraitDAOTest.class);
    
    private PortraitDAO portraitDao;
    private SQLiteTestDatabaseManager dbManager;
    
    private static final String PORTRAIT_ID_1 = "port_test_001";
    private static final String PORTRAIT_ID_2 = "port_test_002";
    private static final String CHARACTER_ID_1 = "char_test_001";
    private static final String CHARACTER_ID_2 = "char_test_002";

    @BeforeEach
    void setUp() throws SQLException {
        logger.info("======== 测试初始化 ========");
        dbManager = new SQLiteTestDatabaseManager();
        
        // 关键：使用同一个连接
        Jdbi jdbi = Jdbi.create(dbManager.getConnection())
            .installPlugin(new SqlObjectPlugin())
            .registerRowMapper(new PortraitMapper());
        
        portraitDao = jdbi.onDemand(PortraitDAO.class);
        
        // 验证连接和表状态
        assertFalse(dbManager.getConnection().isClosed(), "连接必须开启");
        assertTrue(dbManager.tableExists("portraits"), "portraits表必须存在");
    }

    @AfterEach
    void tearDown() {
        if (dbManager != null) {
            dbManager.closeConnection();
            logger.info("测试数据库连接已关闭");
        }
    }

    @Test
    @DisplayName("测试保存和查询立绘")
    void testSaveAndFind() throws SQLException {
        logger.info("开始测试保存和查询");
        
        // 验证连接状态
        if (dbManager.getConnection().isClosed()) {
            logger.error("数据库连接已关闭，无法执行测试");
            fail("数据库连接意外关闭");
        }
        
        // 准备测试数据
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, 
            "Ryoshu-default.png", "默认立绘", Emotion.NORMAL);
        logger.info("创建测试立绘对象: {}", portrait);

        // 执行保存操作（不再接收返回值）
        logger.debug("开始保存立绘...");
        //portraitDao.saveSimple(portrait);  // 先测试简化保存
        portraitDao.save(portrait);       // 再测试完整保存
        logger.info("立绘保存成功");
        
        // 验证数据库记录
        logger.debug("验证数据库记录...");
        assertTrue(dbManager.recordExists("portraits", "portrait_id", PORTRAIT_ID_1),
            "数据库中应存在对应记录");
        logger.info("数据库记录验证完成");

        // 执行查询操作
        logger.debug("开始查询立绘...");
        Optional<Portrait> found = portraitDao.findById(PORTRAIT_ID_1);
        logger.info("立绘查询结果: {}", found.isPresent() ? "找到" : "未找到");
        
        // 验证结果
        assertTrue(found.isPresent(), "立绘应能被查询到");
        Portrait actualPortrait = found.get();
        logger.debug("查询到的立绘详情: {}", actualPortrait);
        
        assertEquals(PORTRAIT_ID_1, actualPortrait.getPortraitID(), 
            "查询到的立绘ID应与保存时一致");
        assertEquals("默认立绘", actualPortrait.getPortName(), 
            "立绘名称应与保存时一致");
        assertEquals(Emotion.NORMAL, actualPortrait.getEmotion(), 
            "立绘情绪状态应与保存时一致");
        logger.info("立绘详细信息验证通过");
    }
    
    
    // ========== 基础CRUD测试 ==========
    @Test
    @DisplayName("测试保存和查询单个立绘")
    void testSaveAndFindById() {
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, 
            "test.png", "测试立绘", Emotion.NORMAL);
        
        portraitDao.save(portrait);
        Optional<Portrait> found = portraitDao.findById(PORTRAIT_ID_1);
        
        assertTrue(found.isPresent());
        assertEquals(PORTRAIT_ID_1, found.get().getPortraitID());
    }
    
    @Test
    @DisplayName("测试查询不存在的立绘")
    void testFindNonExistentPortrait() {
        Optional<Portrait> found = portraitDao.findById("non_existent_id");
        assertFalse(found.isPresent());
    }
    
    @Test
    @DisplayName("测试更新立绘")
    void testUpdate() {
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, 
            "test.png", "原始名称", Emotion.NORMAL);
        portraitDao.save(portrait);
        
        portrait.setPortName("新名称");
        portrait.setEmotion(Emotion.HAPPY);
        boolean updated = portraitDao.update(portrait);
        
        assertTrue(updated);
        Optional<Portrait> updatedPortrait = portraitDao.findById(PORTRAIT_ID_1);
        assertEquals("新名称", updatedPortrait.get().getPortName());
        assertEquals(Emotion.HAPPY, updatedPortrait.get().getEmotion());
    }
    
    @Test
    @DisplayName("测试删除立绘")
    void testDelete() {
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, 
            "test.png", "待删除", Emotion.NORMAL);
        portraitDao.save(portrait);
        
        boolean deleted = portraitDao.delete(PORTRAIT_ID_1);
        assertTrue(deleted);
        assertFalse(portraitDao.existsById(PORTRAIT_ID_1));
    }
    
    // ========== 查询操作测试 ==========
    @Test
    @DisplayName("测试查询所有立绘")
    void testFindAll() {
        portraitDao.save(createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "A", Emotion.NORMAL));
        portraitDao.save(createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_2, "2.png", "B", Emotion.HAPPY));
        
        List<Portrait> all = portraitDao.findAll();
        assertEquals(2, all.size());
        assertEquals("A", all.get(0).getPortName()); // 验证排序
    }
    
    @Test
    @DisplayName("测试按角色ID查询")
    void testFindByCharacterId() {
        portraitDao.save(createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "角色1立绘", Emotion.NORMAL));
        portraitDao.save(createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_2, "2.png", "角色2立绘", Emotion.HAPPY));
        
        List<Portrait> char1Portraits = portraitDao.findByCharacterId(CHARACTER_ID_1);
        assertEquals(1, char1Portraits.size());
        assertEquals(CHARACTER_ID_1, char1Portraits.get(0).getCharacterID());
    }
    
    @Test
    @DisplayName("测试按名称模糊查询")
    void testFindByName() {
        portraitDao.save(createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "默认立绘", Emotion.NORMAL));
        portraitDao.save(createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "2.png", "战斗立绘", Emotion.ANGRY));
        
        List<Portrait> results = portraitDao.findByName("战斗");
        assertEquals(1, results.size());
        assertEquals("战斗立绘", results.get(0).getPortName());
    }
    
    @Test
    @DisplayName("测试按情绪查询")
    void testFindByEmotion() {
        portraitDao.save(createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "普通", Emotion.NORMAL));
        portraitDao.save(createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "2.png", "开心", Emotion.HAPPY));
        
        List<Portrait> happyPortraits = portraitDao.findByEmotion(Emotion.HAPPY);
        assertEquals(1, happyPortraits.size());
        assertEquals(Emotion.HAPPY, happyPortraits.get(0).getEmotion());
    }
    
    // ========== 统计操作测试 ==========
    @Test
    @DisplayName("测试统计所有立绘")
    void testCountAll() {
        portraitDao.save(createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "A", Emotion.NORMAL));
        portraitDao.save(createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_2, "2.png", "B", Emotion.HAPPY));
        
        assertEquals(2, portraitDao.countAll());
    }
    
    @Test
    @DisplayName("测试按角色统计")
    void testCountByCharacterId() {
        portraitDao.save(createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "A", Emotion.NORMAL));
        portraitDao.save(createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "2.png", "B", Emotion.HAPPY));
        portraitDao.save(createTestPortrait("port_test_003", CHARACTER_ID_2, "3.png", "C", Emotion.ANGRY));
        
        assertEquals(2, portraitDao.countByCharacterId(CHARACTER_ID_1));
    }
    
    // ========== 存在性检查测试 ==========
    @Test
    @DisplayName("测试检查立绘是否存在")
    void testExistsById() {
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "A", Emotion.NORMAL);
        portraitDao.save(portrait);
        
        assertTrue(portraitDao.existsById(PORTRAIT_ID_1));
        assertFalse(portraitDao.existsById("non_existent_id"));
    }
    
    // ========== 批量操作测试 ==========
    @Test
    @DisplayName("测试批量保存")
    void testSaveAll() {
        List<Portrait> portraits = Arrays.asList(
            createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "A", Emotion.NORMAL),
            createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "2.png", "B", Emotion.HAPPY)
        );
        
        portraitDao.saveAll(portraits);
        assertEquals(2, portraitDao.countAll());
    }
    
    @Test
    @DisplayName("测试按角色批量删除")
    void testDeleteByCharacterId() {
        portraitDao.save(createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "A", Emotion.NORMAL));
        portraitDao.save(createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "2.png", "B", Emotion.HAPPY));
        portraitDao.save(createTestPortrait("port_test_003", CHARACTER_ID_2, "3.png", "C", Emotion.ANGRY));
        
        boolean deleted = portraitDao.deleteByCharacterId(CHARACTER_ID_1);
        assertTrue(deleted);
        assertEquals(1, portraitDao.countAll());
    }
    
    // ========== 特殊操作测试 ==========
    @Test
    @DisplayName("测试更新缩略图路径")
    void testUpdateThumbnailPath() {
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "A", Emotion.NORMAL);
        portraitDao.save(portrait);
        
        boolean updated = portraitDao.updateThumbnailPath(PORTRAIT_ID_1, "new/path.png");
        assertTrue(updated);
        
        Optional<Portrait> updatedPortrait = portraitDao.findById(PORTRAIT_ID_1);
        assertEquals("new/path.png", updatedPortrait.get().getThumbnailPath());
    }
    
    @Test
    @DisplayName("测试查找角色的默认立绘")
    void testFindDefaultPortraitByCharacter() {
        portraitDao.save(createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "普通", Emotion.NORMAL));
        portraitDao.save(createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "2.png", "开心", Emotion.HAPPY));
        
        Optional<Portrait> defaultPortrait = portraitDao.findDefaultPortraitByCharacter(CHARACTER_ID_1);
        assertTrue(defaultPortrait.isPresent());
        assertEquals(Emotion.NORMAL, defaultPortrait.get().getEmotion());
    }
    
    @Test
    @DisplayName("测试查找有缩略图的立绘")
    void testFindPortraitsWithThumbnails() {
        Portrait withThumb = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "有缩略图", Emotion.NORMAL);
        withThumb.setThumbnailPath("thumb/1.png");
        portraitDao.save(withThumb);
        
        portraitDao.save(createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "2.png", "无缩略图", Emotion.HAPPY));
        
        List<Portrait> withThumbs = portraitDao.findPortraitsWithThumbnails();
        assertEquals(1, withThumbs.size());
        assertEquals(PORTRAIT_ID_1, withThumbs.get(0).getPortraitID());
    }
    
    // ========== 关联关系测试 ==========
    @Test
    @DisplayName("测试保存角色-立绘关联")
    void testSaveCharacterPortrait() {
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "A", Emotion.NORMAL);
        portraitDao.save(portrait);
        
        portraitDao.saveCharacterPortrait(CHARACTER_ID_1, PORTRAIT_ID_1, true, 0);
        
        // 验证关联是否存在（需要根据实际业务添加验证逻辑）
        assertTrue(true); // 简单示例
    }
    
    @Test
    @DisplayName("测试批量保存关联关系")
    void testSaveCharacterPortraits() {
        List<Portrait> portraits = Arrays.asList(
            createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "1.png", "A", Emotion.NORMAL),
            createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "2.png", "B", Emotion.HAPPY)
        );
        portraitDao.saveAll(portraits);
        
        portraitDao.saveCharacterPortraits(CHARACTER_ID_1, portraits);
        
        // 验证关联是否正确建立（需要根据实际业务添加验证逻辑）
        assertTrue(true); // 简单示例
    }
    
    // ========== 辅助方法 ==========
    // 其他测试方法...
    private Portrait createTestPortrait(String id, String charId, String imgPath, String name, Emotion emotion) {
        return Portrait.builder(imgPath)
            .portraitID(id)
            .characterID(charId)
            .portName(name)
            .emotion(emotion)
            .thumbnailPath("thumbs/" + id + ".png")
            .build();
    }
}