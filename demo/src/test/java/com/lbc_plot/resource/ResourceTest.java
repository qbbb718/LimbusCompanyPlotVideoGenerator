
// package com.lbc_plot.resource;

// import org.junit.jupiter.api.Test;
// import org.junit.jupiter.api.BeforeEach;
// import org.junit.jupiter.api.AfterEach;
// import org.junit.jupiter.api.DisplayName;
// import static org.junit.jupiter.api.Assertions.*;

// import java.io.IOException;
// import java.nio.file.Files;
// import java.nio.file.Path;
// import java.nio.file.Paths;
// import java.util.List;
// import java.util.Optional;

// import org.slf4j.Logger;
// import org.slf4j.LoggerFactory;

// import com.lbc_plot.resource.controller.AudioController;
// import com.lbc_plot.resource.controller.BackgroundController;
// import com.lbc_plot.resource.controller.CharacterController;
// import com.lbc_plot.resource.controller.PortraitController;
// import com.lbc_plot.resource.controller.CharacterCardController;

// import com.lbc_plot.resource.model.Audio;
// import com.lbc_plot.resource.model.Background;
// import com.lbc_plot.resource.model.MyCharacter;
// import com.lbc_plot.resource.model.Portrait;
// import com.lbc_plot.resource.model.Emotion;

// import com.lbc_plot.resource.service.BackgroundService;
// import com.lbc_plot.resource.service.CharacterService;

// import com.lbc_plot.resource.storage.ResourceStorage;
// import com.lbc_plot.resource.character.CharacterCardImageCache;

// import java.awt.Color;
// import java.awt.image.BufferedImage;
// import java.io.File;

// /**
// * 资源模块测试类
// * 测试资源管理相关的各项功能
// */
// class ResourceTest {
// private static final Logger logger =
// LoggerFactory.getLogger(ResourceTest.class);

// private AudioController audioController;
// private BackgroundController backgroundController;
// private CharacterController characterController;
// private PortraitController portraitController;
// private CharacterCardController characterCardController;

// private BackgroundService backgroundService;
// private CharacterService characterService;

// private ResourceStorage resourceStorage;
// private CharacterCardImageCache imageCache;

// private Path testOutputDir;

// @BeforeEach
// void setUp() throws IOException {
// // 创建测试输出目录
// testOutputDir = Paths.get("target/test-logs/resource");
// if (!Files.exists(testOutputDir)) {
// Files.createDirectories(testOutputDir);
// }

// // 初始化服务
// audioController = new AudioController();
// backgroundController = new BackgroundController();
// characterController = new CharacterController();
// portraitController = new PortraitController();
// characterCardController = new CharacterCardController();

// backgroundService = new BackgroundService();
// characterService = new CharacterService();

// resourceStorage = new ResourceStorage();
// imageCache = new CharacterCardImageCache();
// }

// @AfterEach
// void tearDown() {
// // 清理测试资源
// }

// @Test
// @DisplayName("测试音频资源管理")
// void testAudioResourceManagement() {
// // 创建测试音频
// Audio audio = new Audio("test_audio.wav", "测试音频", "test", 3.5f);

// // 验证音频对象
// assertNotNull(audio, "Audio对象不应该为null");
// assertEquals("test_audio.wav", audio.getPath(), "音频路径应该一致");
// assertEquals("测试音频", audio.getDisplayName(), "音频显示名称应该一致");
// assertEquals("test", audio.getCategory(), "音频分类应该一致");
// assertEquals(3.5f, audio.getDuration(), "音频时长应该一致");

// logger.info("音频资源管理测试完成");
// }

// @Test
// @DisplayName("测试背景资源管理")
// void testBackgroundResourceManagement() throws IOException {
// // 创建测试背景
// Background background = new Background("test_bg.png", "测试背景");

// // 验证背景对象
// assertNotNull(background, "Background对象不应该为null");
// assertEquals("test_bg.png", background.getPath(), "背景路径应该一致");
// assertEquals("测试背景", background.getDisplayName(), "背景显示名称应该一致");

// // 测试背景图像
// BufferedImage bgImage = background.getImage();
// if (bgImage != null) {
// assertNotNull(bgImage, "背景图像不应该为null");

// // 导出测试图像
// Path outputPath = testOutputDir.resolve("background_test.png");
// javax.imageio.ImageIO.write(bgImage, "png", outputPath.toFile());
// logger.info("背景测试图像已导出到: " + outputPath);
// }

// logger.info("背景资源管理测试完成");
// }

// @Test
// @DisplayName("测试角色资源管理")
// void testCharacterResourceManagement() throws IOException {
// // 创建测试立绘
// Portrait portrait = Portrait.builder("test_portrait.png")
// .portraitID("port_test_001")
// .characterID("char_test_001")
// .portName("测试立绘")
// .emotion(Emotion.NORMAL)
// .build();

// // 创建测试角色
// MyCharacter character = MyCharacter.builder()
// .characterID("char_test_001")
// .characterName("测试角色")
// .height(170)
// .faction("测试阵营")
// .colorBg(new Color(76, 54, 31))
// .colorText(new Color(251, 219, 179))
// .addPortrait(portrait)
// .build();

// // 验证角色对象
// assertNotNull(character, "MyCharacter对象不应该为null");
// assertEquals("char_test_001", character.getCharacterID(), "角色ID应该一致");
// assertEquals("测试角色", character.getCharacterName(), "角色名称应该一致");
// assertEquals(170, character.getHeight(), "角色身高应该一致");
// assertEquals("测试阵营", character.getFaction(), "角色阵营应该一致");

// // 验证颜色
// assertEquals(new Color(76, 54, 31), character.getColorBg(), "角色背景色应该一致");
// assertEquals(new Color(251, 219, 179), character.getColorText(),
// "角色文字色应该一致");

// // 验证立绘
// List<Portrait> portraits = character.getPortraits();
// assertNotNull(portraits, "立绘列表不应该为null");
// assertEquals(1, portraits.size(), "应该有一个立绘");
// assertEquals("port_test_001", portraits.get(0).getPortraitID(), "立绘ID应该一致");

// // 测试立绘图像
// BufferedImage portraitImage = portrait.getImage();
// if (portraitImage != null) {
// assertNotNull(portraitImage, "立绘图像不应该为null");

// // 导出测试图像
// Path outputPath = testOutputDir.resolve("portrait_test.png");
// javax.imageio.ImageIO.write(portraitImage, "png", outputPath.toFile());
// logger.info("立绘测试图像已导出到: " + outputPath);
// }

// // 测试角色卡片缓存
// BufferedImage cardImage = imageCache.getOrGenerate(character);
// if (cardImage != null) {
// assertNotNull(cardImage, "角色卡片图像不应该为null");

// // 导出测试图像
// Path outputPath = testOutputDir.resolve("character_card_test.png");
// javax.imageio.ImageIO.write(cardImage, "png", outputPath.toFile());
// logger.info("角色卡片测试图像已导出到: " + outputPath);
// }

// logger.info("角色资源管理测试完成");
// }

// @Test
// @DisplayName("测试资源存储")
// void testResourceStorage() {
// // 测试资源存储功能
// assertNotNull(resourceStorage, "ResourceStorage对象不应该为null");

// // 这里可以添加更多资源存储相关的测试
// // 例如：资源加载、资源保存、资源缓存等

// logger.info("资源存储测试完成");
// }

// @Test
// @DisplayName("测试资源控制器")
// void testResourceControllers() {
// // 测试音频控制器
// assertNotNull(audioController, "AudioController对象不应该为null");

// // 测试背景控制器
// assertNotNull(backgroundController, "BackgroundController对象不应该为null");

// // 测试角色控制器
// assertNotNull(characterController, "CharacterController对象不应该为null");

// // 测试立绘控制器
// assertNotNull(portraitController, "PortraitController对象不应该为null");

// // 测试角色卡片控制器
// assertNotNull(characterCardController, "CharacterCardController对象不应该为null");

// logger.info("资源控制器测试完成");
// }

// @Test
// @DisplayName("测试资源服务")
// void testResourceServices() {
// // 测试背景服务
// assertNotNull(backgroundService, "BackgroundService对象不应该为null");

// // 测试角色服务
// assertNotNull(characterService, "CharacterService对象不应该为null");

// logger.info("资源服务测试完成");
// }
// }
