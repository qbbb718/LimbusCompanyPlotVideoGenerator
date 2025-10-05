package DAO;

import java.util.Optional;

import org.jdbi.v3.core.Jdbi;
import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.CharacterMapper;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.DAO.PortraitMapper;
import com.lbc_plot.model.storage.Emotion;
import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.util.ColorUtils;
import helpers.SQLiteTestDatabaseManager;

import org.junit.jupiter.api.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.jdbi.v3.sqlobject.SqlObjectPlugin;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class CharacterDAOTest {
    private static final Logger logger = LoggerFactory.getLogger(CharacterDAOTest.class);
    
    private CharacterDAO characterDao;
    private PortraitDAO portraitDao;
    private SQLiteTestDatabaseManager dbManager;
    
    // 测试用的常量
    private static final String CHARACTER_ID_1 = "char_test_001";
    private static final String CHARACTER_ID_2 = "char_test_002";
    private static final String CHARACTER_ID_3 = "char_test_003";
    private static final String FACTION_1 = "测试阵营A";
    private static final String FACTION_2 = "测试阵营B";

    @BeforeEach
    void setUp() throws SQLException {
        logger.info("======== 测试初始化 ========");
        dbManager = new SQLiteTestDatabaseManager();
        
        // 关键：使用同一个连接
        Jdbi jdbi = Jdbi.create(dbManager.getConnection())
            .installPlugin(new SqlObjectPlugin())
            .registerRowMapper(new CharacterMapper());
        
        characterDao = jdbi.onDemand(CharacterDAO.class);
        
        portraitDao = jdbi.onDemand(PortraitDAO.class);
        
        // 验证连接和表状态
        assertFalse(dbManager.getConnection().isClosed(), "连接必须开启");
        //assertTrue(dbManager.tableExists("characters"), "characters表必须存在");
    }

    @AfterEach
    void tearDown() {
        if (dbManager != null) {
            dbManager.closeConnection();
            logger.info("测试数据库连接已关闭");
        }
    }

    // ========== 基础CRUD测试 ==========
    @Test
    @DisplayName("测试保存和查询单个角色")
    void testSaveAndFindById() {
        MyCharacter character = createTestCharacter(CHARACTER_ID_1, "测试角色1", 170, "076,054,031", "251,219,179", FACTION_1);
        
        // 保存角色（不再接收返回值）
        characterDao.save(character);
        
        // 验证数据库记录是否存在
        assertTrue(dbManager.recordExists("characters", "character_id", CHARACTER_ID_1),
            "数据库中应存在对应记录");
        
        // 执行查询操作
        Optional<MyCharacter> found = characterDao.findById(CHARACTER_ID_1);
        
        // 验证查询结果
        assertTrue(found.isPresent(), "角色应能被查询到");
        MyCharacter actualCharacter = found.get();
        
        assertEquals(CHARACTER_ID_1, actualCharacter.getCharacterID(), 
            "查询到的角色ID应与保存时一致");
        assertEquals("测试角色1", actualCharacter.getCharacterName(),
            "角色名称应与保存时一致");
        assertEquals(170, actualCharacter.getHeight(),
            "角色身高应与保存时一致");
        assertEquals(FACTION_1, actualCharacter.getFaction(),
            "角色阵营应与保存时一致");
        
        // 验证颜色转换是否正确
        // 测试类中修改断言（忽略Alpha和前导零）
        assertEquals("76,54,31,255",  // 去前导零 + 忽略Alpha
            ColorUtils.colorToString(actualCharacter.getColorBg()),
            "背景色应与保存时一致");
        assertEquals("251,219,179,255", 
            ColorUtils.colorToString(actualCharacter.getColorText()),
            "文字色应与保存时一致");
    }
    
    @Test
    @DisplayName("测试查询不存在的角色")
    void testFindNonExistentCharacter() {
        Optional<MyCharacter> found = characterDao.findById("non_existent_id");
        assertFalse(found.isPresent(), "不存在的角色ID应返回空Optional");
    }
    
    @Test
    @DisplayName("测试更新角色")
    void testUpdate() {
        MyCharacter character = createTestCharacter(CHARACTER_ID_1, "原始名称", 170, "076,054,031", "251,219,179", FACTION_1);
        characterDao.save(character);
        
        // 修改角色属性
        character.setCharacterName("新名称");
        character.setHeight(180);
        character.setFaction(FACTION_2);
        
        boolean updated = characterDao.update(character);
        assertTrue(updated, "更新操作应返回true");
        
        Optional<MyCharacter> updatedCharacter = characterDao.findById(CHARACTER_ID_1);
        assertEquals("新名称", updatedCharacter.get().getCharacterName(), "角色名称应已更新");
        assertEquals(180, updatedCharacter.get().getHeight(), "角色身高应已更新");
        assertEquals(FACTION_2, updatedCharacter.get().getFaction(), "角色阵营应已更新");
    }
    
    @Test
    @DisplayName("测试删除角色")
    void testDelete() {
        MyCharacter character = createTestCharacter(CHARACTER_ID_1, "待删除角色", 170, "076,054,031", "251,219,179", FACTION_1);
        characterDao.save(character);
        
        boolean deleted = characterDao.delete(CHARACTER_ID_1);
        assertTrue(deleted, "删除操作应返回true");
        assertFalse(characterDao.existsById(CHARACTER_ID_1), "删除后角色不应再存在");
    }

    // ========== 查询操作测试 ==========
    @Test
    @DisplayName("测试查询所有角色")
    void testFindAll() {
        characterDao.save(createTestCharacter(CHARACTER_ID_1, "角色A", 170, "076,054,031", "251,219,179", FACTION_1));
        characterDao.save(createTestCharacter(CHARACTER_ID_2, "角色B", 180, "100,100,100", "200,200,200", FACTION_2));
        
        List<MyCharacter> all = characterDao.findAll();
        assertEquals(2, all.size(), "应查询到2个角色");
        assertEquals("角色A", all.get(0).getCharacterName(), "角色应按名称排序");
    }
    
    @Test
    @DisplayName("测试按阵营查询")
    void testFindByFaction() {
        characterDao.save(createTestCharacter(CHARACTER_ID_1, "角色A", 170, "076,054,031", "251,219,179", FACTION_1));
        characterDao.save(createTestCharacter(CHARACTER_ID_2, "角色B", 180, "100,100,100", "200,200,200", FACTION_1));
        characterDao.save(createTestCharacter(CHARACTER_ID_3, "角色C", 160, "200,200,200", "100,100,100", FACTION_2));
        
        List<MyCharacter> faction1Chars = characterDao.findByFaction(FACTION_1);
        assertEquals(2, faction1Chars.size(), "应查询到2个属于FACTION_1的角色");
        assertEquals(FACTION_1, faction1Chars.get(0).getFaction(), "查询结果的角色阵营应为FACTION_1");
    }
    
    @Test
    @DisplayName("测试按名称模糊查询")
    void testFindByName() {
        characterDao.save(createTestCharacter(CHARACTER_ID_1, "测试角色A", 170, "076,054,031", "251,219,179", FACTION_1));
        characterDao.save(createTestCharacter(CHARACTER_ID_2, "测试角色B", 180, "100,100,100", "200,200,200", FACTION_1));
        characterDao.save(createTestCharacter(CHARACTER_ID_3, "其他角色", 160, "200,200,200", "100,100,100", FACTION_2));
        
        List<MyCharacter> results = characterDao.findByName("测试");
        assertEquals(2, results.size(), "应查询到2个名称包含'测试'的角色");
        assertTrue(results.get(0).getCharacterName().contains("测试"), "查询结果的角色名称应包含'测试'");
    }

    // ========== 统计操作测试 ==========
    @Test
    @DisplayName("测试统计所有角色")
    void testCountAll() {
        characterDao.save(createTestCharacter(CHARACTER_ID_1, "角色A", 170, "076,054,031", "251,219,179", FACTION_1));
        characterDao.save(createTestCharacter(CHARACTER_ID_2, "角色B", 180, "100,100,100", "200,200,200", FACTION_2));
        
        assertEquals(2, characterDao.countAll(), "应统计到2个角色");
    }
    
    @Test
    @DisplayName("测试按阵营统计")
    void testCountByFaction() {
        characterDao.save(createTestCharacter(CHARACTER_ID_1, "角色A", 170, "076,054,031", "251,219,179", FACTION_1));
        characterDao.save(createTestCharacter(CHARACTER_ID_2, "角色B", 180, "100,100,100", "200,200,200", FACTION_1));
        characterDao.save(createTestCharacter(CHARACTER_ID_3, "角色C", 160, "200,200,200", "100,100,100", FACTION_2));
        
        assertEquals(2, characterDao.countByFaction(FACTION_1), "应统计到2个属于FACTION_1的角色");
        assertEquals(1, characterDao.countByFaction(FACTION_2), "应统计到1个属于FACTION_2的角色");
    }

    // ========== 存在性检查测试 ==========
    @Test
    @DisplayName("测试检查角色是否存在")
    void testExistsById() {
        MyCharacter character = createTestCharacter(CHARACTER_ID_1, "角色A", 170, "076,054,031", "251,219,179", FACTION_1);
        characterDao.save(character);
        
        assertTrue(characterDao.existsById(CHARACTER_ID_1), "存在的角色ID应返回true");
        assertFalse(characterDao.existsById("non_existent_id"), "不存在的角色ID应返回false");
    }

    @Test
    @DisplayName("测试保存角色及其立绘")
    void testSaveWithPortraits() {
        logger.info("\n===== 开始测试保存角色及其立绘 =====");
        
        // 创建测试角色
        logger.debug("\n创建测试角色对象...");
        MyCharacter character = createTestCharacter(CHARACTER_ID_1, "测试角色", 170, "076,054,031", "251,219,179", FACTION_1);
        logger.debug("创建的角色对象:\n  ID: {}\n  名称: {}\n  身高: {}\n  阵营: {}",
            character.getCharacterID(),
            character.getCharacterName(),
            character.getHeight(),
            character.getFaction());
        
        // 创建测试立绘
        logger.debug("\n创建测试立绘对象...");
        Portrait portrait1 = Portrait.builder("portrait1.png")
            .portraitID("port_test_001")
            .characterID(CHARACTER_ID_1)
            .portName("默认立绘")
            .emotion(Emotion.NORMAL)
            .build();
        logger.debug("立绘1:\n  ID: {}\n  角色ID: {}\n  名称: {}\n  情绪: {}\n  路径: {}",
            portrait1.getPortraitID(),
            portrait1.getCharacterID(),
            portrait1.getPortName(),
            portrait1.getEmotion(),
            portrait1.getImagePath());
        
        Portrait portrait2 = Portrait.builder("portrait2.png")
            .portraitID("port_test_002")
            .characterID(CHARACTER_ID_1)
            .portName("战斗立绘")
            .emotion(Emotion.ANGRY)
            .build();
        logger.debug("立绘2:\n  ID: {}\n  角色ID: {}\n  名称: {}\n  情绪: {}\n  路径: {}",
            portrait2.getPortraitID(),
            portrait2.getCharacterID(),
            portrait2.getPortName(),
            portrait2.getEmotion(),
            portrait2.getImagePath());
        
        character.setPortraits(Arrays.asList(portrait1, portrait2));
        logger.debug("\n角色关联立绘完成:\n  角色ID: {}\n  关联立绘数量: {}",
            character.getCharacterID(),
            character.getPortraits().size());
        
        // 执行测试方法
        logger.info("\n执行保存操作...");
        characterDao.saveWithPortraits(character, portraitDao);
        logger.info("保存操作完成");
        
        // 验证角色已保存
        logger.debug("\n验证角色是否已保存...");
        boolean characterExists = characterDao.existsById(CHARACTER_ID_1);
        assertTrue(characterExists, "角色应已保存");
        logger.info("角色验证通过:\n  角色ID: {} 存在于数据库中", CHARACTER_ID_1);
        
        // 验证立绘关联已保存
        logger.debug("\n查询关联立绘...");
        List<Portrait> portraits = portraitDao.findByCharacterId(CHARACTER_ID_1);
        logger.debug("查询结果:\n  角色ID: {}\n  找到立绘数量: {}", 
            CHARACTER_ID_1, 
            portraits.size());
        
        // 新增：检查立绘表中是否有数据（不关联角色ID）
        logger.debug("\n检查立绘表总数据量...");
        int totalPortraits = portraitDao.countAll();
        logger.debug("立绘表总记录数: {}", totalPortraits);
        assertTrue(totalPortraits >= 2, "立绘表应至少包含2条记录");
        
        // 新增：检查特定立绘ID是否存在
        logger.debug("\n检查立绘ID是否存在...");
        boolean portrait1Exists = portraitDao.existsById("port_test_001");
        boolean portrait2Exists = portraitDao.existsById("port_test_002");
        logger.debug("立绘存在状态:\n  port_test_001: {}\n  port_test_002: {}", 
            portrait1Exists, portrait2Exists);
        assertTrue(portrait1Exists, "立绘 port_test_001 应存在");
        assertTrue(portrait2Exists, "立绘 port_test_002 应存在");
        
        // 记录查询到的立绘详情
        portraits.forEach(portrait -> 
            logger.debug("立绘详情:\n  ID: {}\n  名称: {}\n  情绪: {}\n  路径: {}",
                portrait.getPortraitID(),
                portrait.getPortName(),
                portrait.getEmotion(),
                portrait.getImagePath())
        );

        
        assertEquals(2, portraits.size(), "应查询到2个属于该角色的立绘");
        
        logger.info("\n===== 测试保存角色及其立绘完成 =====");
    }
    
    @Test
    @DisplayName("测试删除角色及其立绘关联")
    void testDeleteWithPortraits() {
        // 创建并保存测试角色
        MyCharacter character = createTestCharacter(CHARACTER_ID_1, "测试角色", 170, "076,054,031", "251,219,179", FACTION_1);
        characterDao.save(character);
        
        // 创建测试立绘并保存
        Jdbi jdbi = Jdbi.create(dbManager.getConnection())
            .installPlugin(new SqlObjectPlugin())
            .registerRowMapper(new PortraitMapper());
        PortraitDAO portraitDao = jdbi.onDemand(PortraitDAO.class);
        
        Portrait portrait = Portrait.builder("portrait1.png")
            .portraitID("port_test_001")
            .characterID(CHARACTER_ID_1)
            .portName("默认立绘")
            .emotion(Emotion.NORMAL)
            .build();
        
        portraitDao.save(portrait);
        portraitDao.saveCharacterPortrait(CHARACTER_ID_1, "port_test_001", true, 0);
        
        // 执行测试方法
        boolean deleted = characterDao.deleteWithPortraits(CHARACTER_ID_1, portraitDao);
        assertTrue(deleted, "删除操作应返回true");
        
        // 验证角色已删除
        assertFalse(characterDao.existsById(CHARACTER_ID_1), "角色应已删除");
        
        // 验证立绘关联已删除
        List<Portrait> portraits = portraitDao.findByCharacterId(CHARACTER_ID_1);
        assertEquals(0, portraits.size(), "角色删除后应不再有立绘关联");
    }

    // ========== 辅助方法 ==========
    private MyCharacter createTestCharacter(String id, String name, int height, 
                                        String colorBg, String colorText, String faction) {
        return MyCharacter.builder()
            .characterID(id)
            .characterName(name)
            .height(height)
            .colorBg(ColorUtils.stringToColor(colorBg)) // 使用工具类
            .colorText(ColorUtils.stringToColor(colorText))
            .faction(faction)
            .build();
    }
}