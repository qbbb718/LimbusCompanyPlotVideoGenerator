
// package com.lbc_plot.config;

// import org.junit.jupiter.api.Test;
// import org.junit.jupiter.api.BeforeEach;
// import org.junit.jupiter.api.AfterEach;
// import org.junit.jupiter.api.DisplayName;
// import static org.junit.jupiter.api.Assertions.*;

// import java.sql.SQLException;
// import java.util.Optional;

// import org.jdbi.v3.core.Jdbi;
// import org.jdbi.v3.sqlobject.SqlObjectPlugin;
// import org.slf4j.Logger;
// import org.slf4j.LoggerFactory;

// import com.lbc_plot.DAO.CharacterDAO;
// import com.lbc_plot.DAO.BackgroundDAO;
// import com.lbc_plot.DAO.PortraitDAO;
// import com.lbc_plot.DAO.CharacterMapper;
// import com.lbc_plot.DAO.PortraitMapper;
// import com.lbc_plot.DAO.ColorMapper;
// import com.lbc_plot.DAO.EmotionMapper;

// import com.lbc_plot.resource.model.MyCharacter;
// import com.lbc_plot.resource.model.Portrait;
// import com.lbc_plot.resource.model.Background;
// import com.lbc_plot.resource.model.Emotion;

// import com.lbc_plot.util.ColorUtils;
// import com.lbc_plot.util.db.SQLiteDatabaseManager;

// import java.awt.Color;
// import java.util.Arrays;
// import java.util.List;

// /**
// * DAO测试类
// * 测试数据访问对象的各项功能
// */
// class DAOTest {
// private static final Logger logger = LoggerFactory.getLogger(DAOTest.class);

// private CharacterDAO characterDao;
// private PortraitDAO portraitDao;
// private BackgroundDAO backgroundDao;
// private SQLiteDatabaseManager dbManager;

// // 测试用的常量
// private static final String CHARACTER_ID_1 = "char_test_001";
// private static final String CHARACTER_ID_2 = "char_test_002";
// private static final String CHARACTER_ID_3 = "char_test_003";
// private static final String FACTION_1 = "测试阵营A";
// private static final String FACTION_2 = "测试阵营B";

// @BeforeEach
// void setUp() throws SQLException {
// logger.info("======== 测试初始化 ========");
// dbManager = new SQLiteDatabaseManager();

// // 关键：使用同一个连接
// Jdbi jdbi = Jdbi.create(dbManager.getConnection())
// .installPlugin(new SqlObjectPlugin())
// .registerRowMapper(new CharacterMapper(jdbi))
// .registerRowMapper(new PortraitMapper())
// .registerRowMapper(new ColorMapper())
// .registerRowMapper(new EmotionMapper());

// characterDao = jdbi.onDemand(CharacterDAO.class);
// portraitDao = jdbi.onDemand(PortraitDAO.class);
// backgroundDao = jdbi.onDemand(BackgroundDAO.class);

// // 验证连接和表状态
// assertFalse(dbManager.getConnection().isClosed(), "连接必须开启");
// }

// @AfterEach
// void tearDown() {
// if (dbManager != null) {
// dbManager.closeConnection();
// logger.info("测试数据库连接已关闭");
// }
// }

// @Test
// @DisplayName("测试保存和查询单个角色")
// void testCharacterSaveAndFindById() {
// MyCharacter character = createTestCharacter(CHARACTER_ID_1, "测试角色1", 170,
// "076,054,031", "251,219,179", FACTION_1);

// // 保存角色
// characterDao.save(character);

// // 验证数据库记录是否存在
// assertTrue(dbManager.recordExists("characters", "character_id",
// CHARACTER_ID_1),
// "数据库中应存在对应记录");

// // 执行查询操作
// Optional<MyCharacter> found = characterDao.findById(CHARACTER_ID_1);

// // 验证查询结果
// assertTrue(found.isPresent(), "角色应能被查询到");
// MyCharacter actualCharacter = found.get();

// assertEquals(CHARACTER_ID_1, actualCharacter.getCharacterID(),
// "查询到的角色ID应与保存时一致");
// assertEquals("测试角色1", actualCharacter.getCharacterName(),
// "角色名称应与保存时一致");
// assertEquals(170, actualCharacter.getHeight(),
// "角色身高应与保存时一致");
// assertEquals(FACTION_1, actualCharacter.getFaction(),
// "角色阵营应与保存时一致");

// // 验证颜色转换是否正确
// assertEquals("76,54,31,255", // 去前导零 + 忽略Alpha
// ColorUtils.colorToString(actualCharacter.getColorBg()),
// "背景色应与保存时一致");
// assertEquals("251,219,179,255",
// ColorUtils.colorToString(actualCharacter.getColorText()),
// "文字色应与保存时一致");
// }

// @Test
// @DisplayName("测试保存和查询立绘")
// void testPortraitSaveAndFind() {
// // 创建测试立绘
// Portrait portrait = Portrait.builder("test_portrait.png")
// .portraitID("port_test_001")
// .characterID(CHARACTER_ID_1)
// .portName("测试立绘")
// .emotion(Emotion.NORMAL)
// .build();

// // 保存立绘
// portraitDao.save(portrait);

// // 验证数据库记录
// assertTrue(dbManager.recordExists("portraits", "portrait_id",
// "port_test_001"),
// "数据库中应存在对应记录");

// // 执行查询操作
// Optional<Portrait> found = portraitDao.findById("port_test_001");

// // 验证结果
// assertTrue(found.isPresent(), "立绘应能被查询到");
// Portrait actualPortrait = found.get();

// assertEquals("port_test_001", actualPortrait.getPortraitID(),
// "查询到的立绘ID应与保存时一致");
// assertEquals("测试立绘", actualPortrait.getPortName(),
// "立绘名称应与保存时一致");
// assertEquals(Emotion.NORMAL, actualPortrait.getEmotion(),
// "立绘情绪状态应与保存时一致");
// }

// @Test
// @DisplayName("测试保存和查询背景")
// void testBackgroundSaveAndFind() {
// // 创建测试背景
// Background background = new Background("test_bg.png", "测试背景");

// // 保存背景
// backgroundDao.save(background);

// // 验证数据库记录
// assertTrue(dbManager.recordExists("backgrounds", "path", "test_bg.png"),
// "数据库中应存在对应记录");

// // 执行查询操作
// Optional<Background> found = backgroundDao.findByPath("test_bg.png");

// // 验证结果
// assertTrue(found.isPresent(), "背景应能被查询到");
// Background actualBackground = found.get();

// assertEquals("test_bg.png", actualBackground.getPath(),
// "查询到的背景路径应与保存时一致");
// assertEquals("测试背景", actualBackground.getDisplayName(),
// "背景显示名称应与保存时一致");
// }

// /**
// * 创建测试角色
// */
// private MyCharacter createTestCharacter(String id, String name, int height,
// String bgColor, String textColor, String faction) {
// return MyCharacter.builder()
// .characterID(id)
// .characterName(name)
// .height(height)
// .faction(faction)
// .colorBg(ColorUtils.stringToColor(bgColor))
// .colorText(ColorUtils.stringToColor(textColor))
// .build();
// }
// }
