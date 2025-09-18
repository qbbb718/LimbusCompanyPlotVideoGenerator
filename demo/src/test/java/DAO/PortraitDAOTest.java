package DAO;


import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.DAO.Impl.PortraitDAOImpl;
import com.lbc_plot.application.service.impl.ThumbnailServiceImpl;
import com.lbc_plot.model.storage.Emotion;
import com.lbc_plot.util.db.SQLiteTestDatabaseManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.junit.jupiter.api.DisplayName;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PortraitDAO 测试类
 */
@DisplayName("PortraitDAO 测试")
class PortraitDAOTest {
    private static final Logger logger = LoggerFactory.getLogger(PortraitDAOTest.class);

    
    private PortraitDAO portraitDAO;
    private SQLiteTestDatabaseManager testDbManager;
    
    // 测试数据
    private static final String CHARACTER_ID_1 = "char_001";
    private static final String CHARACTER_ID_2 = "char_002";
    private static final String PORTRAIT_ID_1 = "port_001";
    private static final String PORTRAIT_ID_2 = "port_002";
    private static final String PORTRAIT_ID_3 = "port_003";
    
    @BeforeEach
    void setUp() {
        logger.info("开始设置测试环境");
        testDbManager = new SQLiteTestDatabaseManager();
        
        // 运行诊断
        testDbManager.diagnose();
        
        // 检查表是否存在
        if (!testDbManager.tableExists("portraits")) {
            logger.error("portraits表不存在，显示详细数据库信息:");
            testDbManager.listAllTables();
            testDbManager.diagnose();
            throw new RuntimeException("portraits表创建失败");
        }
        
        portraitDAO = new PortraitDAOImpl(testDbManager.getConnection());
        logger.info("测试环境设置完成");
    }
    
    @AfterEach
    void tearDown() {
        if (testDbManager != null) {
            testDbManager.closeConnection();
        }
    }
    
    private Portrait createTestPortrait(String portraitId, String characterId, String portraitName, String portName, Emotion emotion) {
        // 构建Portrait对象
        Portrait portrait = Portrait.builder(portraitName)
            .portraitID(portraitId)
            .characterID(characterId)
            .portName(portName)
            .emotion(emotion)
            .faceX(100)
            .faceY(50)
            .length(80)
            .adjX(0)
            .adjY(0)
            .thumbnailPath("thumbnails/" + portraitId + ".png")
            .build();
        
        // 在返回前记录日志，输出创建的Portrait对象信息
        logger.debug("创建测试立绘对象: {}", portrait.toString());

        // 或者直接使用 logger.debug("创建测试立绘对象: {}", portrait); 因为toString()会被自动调用
        
        return portrait;
    }
    
    @Test
    @DisplayName("测试基本功能")
    void testBasicFunctionality() {
        // 先测试表是否存在
        assertTrue(testDbManager.tableExists("portraits"));
        
        // 然后进行其他测试...
    }

    @Test
    @DisplayName("测试保存和查找立绘")
    void testSaveAndFindById() {
        // 给定
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1,  "格里高尔-face_idle_R.png", "默认立绘",Emotion.NORMAL);
        
        // 当
        Portrait savedPortrait = portraitDAO.save(portrait);
        Optional<Portrait> foundPortrait = portraitDAO.findById(PORTRAIT_ID_1);
        
        // 则
        assertTrue(foundPortrait.isPresent());
        assertEquals(PORTRAIT_ID_1, foundPortrait.get().getPortraitID());
        assertEquals(CHARACTER_ID_1, foundPortrait.get().getCharacterID());
        assertEquals("默认立绘", foundPortrait.get().getPortName());
        assertEquals(Emotion.NORMAL, foundPortrait.get().getEmotion());
    }
    
    @Test
    @DisplayName("测试查找不存在的立绘")
    void testFindById_NotFound() {
        // 当
        Optional<Portrait> foundPortrait = portraitDAO.findById("non_existent_id");
        
        // 则
        assertFalse(foundPortrait.isPresent());
    }
    
    @Test
    @DisplayName("测试查找所有立绘")
    void testFindAll() {
        // 给定
        Portrait portrait1 = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "立绘1", "格里高尔-face_depressed_L.png", Emotion.NORMAL);
        Portrait portrait2 = createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "立绘2","Gregor-face_serious_R.png", Emotion.HAPPY);
        
        portraitDAO.save(portrait1);
        portraitDAO.save(portrait2);
        
        // 当
        List<Portrait> portraits = portraitDAO.findAll();
        
        // 则
        assertEquals(2, portraits.size());
        assertTrue(portraits.stream().anyMatch(p -> p.getPortraitID().equals(PORTRAIT_ID_1)));
        assertTrue(portraits.stream().anyMatch(p -> p.getPortraitID().equals(PORTRAIT_ID_2)));
    }
    
    @Test
    @DisplayName("测试更新立绘")
    void testUpdate() {
        // 给定
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "旧名称", "Gregor-face_serious_R.png", Emotion.NORMAL);
        portraitDAO.save(portrait);
        
        // 当
        portrait.setPortName("新名称");
        portrait.setEmotion(Emotion.HAPPY);
        boolean updateResult = portraitDAO.update(portrait);
        
        Optional<Portrait> updatedPortrait = portraitDAO.findById(PORTRAIT_ID_1);
        
        // 则
        assertTrue(updateResult);
        assertTrue(updatedPortrait.isPresent());
        assertEquals("新名称", updatedPortrait.get().getPortName());
        assertEquals(Emotion.HAPPY, updatedPortrait.get().getEmotion());
    }
    
    @Test
    @DisplayName("测试删除立绘")
    void testDelete() {
        // 给定
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "测试立绘", "Gregor-face_serious_R.png", Emotion.NORMAL);
        portraitDAO.save(portrait);
        
        // 当
        boolean deleteResult = portraitDAO.delete(PORTRAIT_ID_1);
        Optional<Portrait> foundPortrait = portraitDAO.findById(PORTRAIT_ID_1);
        
        // 则
        assertTrue(deleteResult);
        assertFalse(foundPortrait.isPresent());
    }
    
    @Test
    @DisplayName("测试按角色ID查找立绘")
    void testFindByCharacterId() {
        // 给定
        Portrait portrait1 = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "角色1立绘1","Gregor-face_serious_R.png", Emotion.NORMAL);
        Portrait portrait2 = createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "角色1立绘2", "格里高尔-face_smile2_L.png",Emotion.HAPPY);
        Portrait portrait3 = createTestPortrait(PORTRAIT_ID_3, CHARACTER_ID_2, "角色2立绘1","罗佳-face_happy_L.png", Emotion.NORMAL);
        
        portraitDAO.save(portrait1);
        portraitDAO.save(portrait2);
        portraitDAO.save(portrait3);
        
        // 当
        List<Portrait> character1Portraits = portraitDAO.findByCharacterId(CHARACTER_ID_1);
        List<Portrait> character2Portraits = portraitDAO.findByCharacterId(CHARACTER_ID_2);
        
        // 则
        assertEquals(2, character1Portraits.size());
        assertEquals(1, character2Portraits.size());
        assertTrue(character1Portraits.stream().allMatch(p -> p.getCharacterID().equals(CHARACTER_ID_1)));
        assertTrue(character2Portraits.stream().allMatch(p -> p.getCharacterID().equals(CHARACTER_ID_2)));
    }
    
    @Test
    @DisplayName("测试按名称查找立绘")
    void testFindByName() {
        // 给定
        Portrait portrait1 = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1,  "Gregor-face_serious_R.png","战斗立绘", Emotion.NORMAL);
        Portrait portrait2 = createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1,  "Gregor-face_serious_R.png","微笑立绘", Emotion.HAPPY);
        Portrait portrait3 = createTestPortrait(PORTRAIT_ID_3, CHARACTER_ID_2,  "Gregor-face_serious_R.png","战斗姿势", Emotion.ANGRY);
        
        portraitDAO.save(portrait1);
        portraitDAO.save(portrait2);
        portraitDAO.save(portrait3);
        
        // 当
        List<Portrait> battlePortraits = portraitDAO.findByName("战斗");
        List<Portrait> smilePortraits = portraitDAO.findByName("微笑");
        
        // 则
        assertEquals(2, battlePortraits.size()); // 战斗立绘, 战斗姿势
        assertEquals(1, smilePortraits.size());  // 微笑立绘
    }
    
    @Test
    @DisplayName("测试按情绪查找立绘")
    void testFindByEmotion() {
        // 给定
        Portrait portrait1 = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "立绘1", "Gregor-face_serious_R.png", Emotion.NORMAL);
        Portrait portrait2 = createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "立绘2", "Gregor-face_serious_R.png", Emotion.HAPPY);
        Portrait portrait3 = createTestPortrait(PORTRAIT_ID_3, CHARACTER_ID_2, "立绘3", "Gregor-face_serious_R.png", Emotion.NORMAL);
        
        portraitDAO.save(portrait1);
        portraitDAO.save(portrait2);
        portraitDAO.save(portrait3);
        
        // 当
        List<Portrait> normalPortraits = portraitDAO.findByEmotion(Emotion.NORMAL);
        List<Portrait> happyPortraits = portraitDAO.findByEmotion(Emotion.HAPPY);
        
        // 则
        assertEquals(2, normalPortraits.size());
        assertEquals(1, happyPortraits.size());
        assertTrue(normalPortraits.stream().allMatch(p -> p.getEmotion() == Emotion.NORMAL));
        assertTrue(happyPortraits.stream().allMatch(p -> p.getEmotion() == Emotion.HAPPY));
    }
    
    @Test
    @DisplayName("测试统计立绘数量")
    void testCountMethods() {
        // 给定
        Portrait portrait1 = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1,  "Gregor-face_serious_R.png",  "Gregor-face_serious_R.png", Emotion.NORMAL);
        Portrait portrait2 = createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1,  "Gregor-face_serious_R.png",  "Gregor-face_serious_R.png", Emotion.HAPPY);
        Portrait portrait3 = createTestPortrait(PORTRAIT_ID_3, CHARACTER_ID_2,  "Gregor-face_serious_R.png",  "Gregor-face_serious_R.png", Emotion.NORMAL);
        
        portraitDAO.save(portrait1);
        portraitDAO.save(portrait2);
        portraitDAO.save(portrait3);
        
        // 当
        int totalCount = portraitDAO.countAll();
        int character1Count = portraitDAO.countByCharacterId(CHARACTER_ID_1);
        int normalCount = portraitDAO.countByEmotion(Emotion.NORMAL);
        
        // 则
        assertEquals(3, totalCount);
        assertEquals(2, character1Count);
        assertEquals(2, normalCount);
    }
    
    @Test
    @DisplayName("测试存在性检查")
    void testExistsMethods() {
        // 给定
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1,  "Gregor-face_serious_R.png","测试立绘", Emotion.NORMAL);
        portraitDAO.save(portrait);
        
        // 当
        boolean existsById = portraitDAO.existsById(PORTRAIT_ID_1);
        boolean existsByName = portraitDAO.existsByCharacterAndName(CHARACTER_ID_1, "测试立绘");
        boolean notExists = portraitDAO.existsById("non_existent");
        
        // 则
        assertTrue(existsById);
        assertTrue(existsByName);
        assertFalse(notExists);
    }
    
    @Test
    @DisplayName("测试批量保存")
    void testSaveAll() {
        // 给定
        Portrait portrait1 = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "立绘1", "Gregor-face_serious_R.png", Emotion.NORMAL);
        Portrait portrait2 = createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "立绘2", "Gregor-face_serious_R.png", Emotion.HAPPY);
        Portrait portrait3 = createTestPortrait(PORTRAIT_ID_3, CHARACTER_ID_2, "立绘3", "Gregor-face_serious_R.png", Emotion.ANGRY);
        
        List<Portrait> portraits = List.of(portrait1, portrait2, portrait3);
        
        // 当
        boolean saveResult = portraitDAO.saveAll(portraits);
        List<Portrait> allPortraits = portraitDAO.findAll();
        
        // 则
        assertTrue(saveResult);
        assertEquals(3, allPortraits.size());
    }
    
    @Test
    @DisplayName("测试按角色删除立绘")
    void testDeleteByCharacterId() {
        // 给定
        Portrait portrait1 = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "立绘1", "Gregor-face_serious_R.png", Emotion.NORMAL);
        Portrait portrait2 = createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "立绘2", "Gregor-face_serious_R.png", Emotion.HAPPY);
        Portrait portrait3 = createTestPortrait(PORTRAIT_ID_3, CHARACTER_ID_2, "立绘3", "Gregor-face_serious_R.png", Emotion.NORMAL);
        
        portraitDAO.save(portrait1);
        portraitDAO.save(portrait2);
        portraitDAO.save(portrait3);
        
        // 当
        boolean deleteResult = portraitDAO.deleteByCharacterId(CHARACTER_ID_1);
        List<Portrait> remainingPortraits = portraitDAO.findAll();
        
        // 则
        assertTrue(deleteResult);
        assertEquals(1, remainingPortraits.size());
        assertEquals(CHARACTER_ID_2, remainingPortraits.get(0).getCharacterID());
    }
    
    @Test
    @DisplayName("测试更新缩略图路径")
    void testUpdateThumbnailPath() {
        // 给定
        Portrait portrait = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "测试立绘", "Gregor-face_serious_R.png", Emotion.NORMAL);
        portraitDAO.save(portrait);
        
        // 当
        String newThumbnailPath = "thumbnails/new_thumbnail.png";
        boolean updateResult = portraitDAO.updateThumbnailPath(PORTRAIT_ID_1, newThumbnailPath);
        Optional<Portrait> updatedPortrait = portraitDAO.findById(PORTRAIT_ID_1);
        
        // 则
        assertTrue(updateResult);
        assertTrue(updatedPortrait.isPresent());
        assertEquals(newThumbnailPath, updatedPortrait.get().getThumbnailPath());
    }
    
    @Test
    @DisplayName("测试查找有缩略图的立绘")
    void testFindPortraitsWithThumbnails() {
        // 给定
        Portrait portrait1 = createTestPortrait(PORTRAIT_ID_1, CHARACTER_ID_1, "有缩略图", "Gregor-face_serious_R.png", Emotion.NORMAL);
        Portrait portrait2 = createTestPortrait(PORTRAIT_ID_2, CHARACTER_ID_1, "无缩略图", "Gregor-face_serious_R.png", Emotion.HAPPY);
        portrait2.setThumbnailPath(null);
        
        portraitDAO.save(portrait1);
        portraitDAO.save(portrait2);
        
        // 当
        List<Portrait> withThumbnails = portraitDAO.findPortraitsWithThumbnails();
        
        // 则
        assertEquals(1, withThumbnails.size());
        assertEquals(PORTRAIT_ID_1, withThumbnails.get(0).getPortraitID());
    }
}