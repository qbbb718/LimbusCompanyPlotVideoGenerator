
// package com.lbc_plot.plot;

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
// import java.util.ArrayList;

// import org.slf4j.Logger;
// import org.slf4j.LoggerFactory;

// import com.lbc_plot.plot.controller.RecordController;
// import com.lbc_plot.plot.model.Record;
// import com.lbc_plot.plot.model.Dialogue;
// import com.lbc_plot.plot.model.Dialogue.Align;
// import com.lbc_plot.plot.parser.PlainTextRecordsParser;

// import com.lbc_plot.resource.model.Background;
// import com.lbc_plot.resource.model.MyCharacter;
// import com.lbc_plot.resource.model.Portrait;
// import com.lbc_plot.resource.model.Emotion;

// import com.lbc_plot.model.video.BackgroundVisual;
// import com.lbc_plot.model.video.CharacterRef;
// import com.lbc_plot.model.video.CharacterVisual;

// import com.lbc_plot.util.json.RecordsIO;

// import java.awt.Color;
// import java.io.File;
// import java.util.UUID;

// /**
// * 情节模块测试类
// * 测试情节管理相关的各项功能
// */
// class PlotTest {
// private static final Logger logger = LoggerFactory.getLogger(PlotTest.class);

// private RecordController recordController;
// private PlainTextRecordsParser parser;

// private Path testOutputDir;

// @BeforeEach
// void setUp() throws IOException {
// // 创建测试输出目录
// testOutputDir = Paths.get("target/test-logs/plot");
// if (!Files.exists(testOutputDir)) {
// Files.createDirectories(testOutputDir);
// }

// // 初始化服务
// recordController = new RecordController();
// parser = new PlainTextRecordsParser();
// }

// @AfterEach
// void tearDown() {
// // 清理测试资源
// }

// @Test
// @DisplayName("测试记录创建和管理")
// void testRecordCreationAndManagement() {
// // 创建测试记录
// Record record = createTestRecord();

// // 验证记录对象
// assertNotNull(record, "Record对象不应该为null");
// assertNotNull(record.getUuid(), "记录UUID不应该为null");

// // 验证背景
// assertNotNull(record.getBackground(), "记录背景不应该为null");
// assertTrue(record.getBackground() instanceof BackgroundVisual,
// "背景应该是BackgroundVisual类型");

// // 验证角色
// assertNotNull(record.getCharacters(), "角色列表不应该为null");
// assertFalse(record.getCharacters().isEmpty(), "角色列表不应该为空");

// // 验证对话
// assertNotNull(record.getDialogues(), "对话列表不应该为null");
// assertFalse(record.getDialogues().isEmpty(), "对话列表不应该为空");

// logger.info("记录创建和管理测试完成");
// }

// @Test
// @DisplayName("测试对话创建和管理")
// void testDialogueCreationAndManagement() {
// // 创建测试对话
// Dialogue dialogue = new Dialogue("测试对话内容", Align.LEFT);

// // 验证对话对象
// assertNotNull(dialogue, "Dialogue对象不应该为null");
// assertEquals("测试对话内容", dialogue.getContent(), "对话内容应该一致");
// assertEquals(Align.LEFT, dialogue.getAlign(), "对话对齐方式应该一致");

// // 测试对话样式
// dialogue.setStyle("color: red; font-size: 16px;");
// assertEquals("color: red; font-size: 16px;", dialogue.getStyle(),
// "对话样式应该一致");

// logger.info("对话创建和管理测试完成");
// }

// @Test
// @DisplayName("测试文本解析")
// void testTextParsing() throws IOException {
// // 创建测试文本
// String testText = "背景:办公室\n" +
// "角色:格里高尔\n" +
// "格里高尔:这是测试对话内容。\n" +
// "旁白:这是旁白内容。";

// // 解析文本
// List<Record> records = parser.parse(testText);

// // 验证解析结果
// assertNotNull(records, "解析结果不应该为null");
// assertFalse(records.isEmpty(), "解析结果不应该为空");

// // 验证第一个记录
// Record record = records.get(0);
// assertNotNull(record, "第一个记录不应该为null");
// assertNotNull(record.getBackground(), "第一个记录的背景不应该为null");
// assertNotNull(record.getCharacters(), "第一个记录的角色列表不应该为null");
// assertNotNull(record.getDialogues(), "第一个记录的对话列表不应该为null");

// logger.info("文本解析测试完成");
// }

// @Test
// @DisplayName("测试记录序列化和反序列化")
// void testRecordSerializationAndDeserialization() throws IOException {
// // 创建测试记录
// Record record = createTestRecord();

// // 序列化记录
// Path jsonPath = testOutputDir.resolve("test_record.json");
// RecordsIO.saveRecords(List.of(record), jsonPath.toString());

// // 验证文件是否创建
// assertTrue(Files.exists(jsonPath), "序列化文件应该存在");

// // 反序列化记录
// List<Record> deserializedRecords =
// RecordsIO.loadRecords(jsonPath.toString());

// // 验证反序列化结果
// assertNotNull(deserializedRecords, "反序列化结果不应该为null");
// assertEquals(1, deserializedRecords.size(), "反序列化应该有一个记录");

// Record deserializedRecord = deserializedRecords.get(0);
// assertEquals(record.getUuid(), deserializedRecord.getUuid(), "记录UUID应该一致");

// logger.info("记录序列化和反序列化测试完成");
// }

// @Test
// @DisplayName("测试记录控制器")
// void testRecordController() {
// // 测试记录控制器
// assertNotNull(recordController, "RecordController对象不应该为null");

// // 这里可以添加更多记录控制器相关的测试
// // 例如：记录创建、记录更新、记录删除等

// logger.info("记录控制器测试完成");
// }

// /**
// * 创建测试记录
// */
// private Record createTestRecord() {
// // 创建测试背景
// Background background = new Background("test_bg.png", "测试背景");

// // 创建测试角色
// Portrait portrait = Portrait.builder("test_portrait.png")
// .portraitID("port_test_001")
// .characterID("char_test_001")
// .portName("测试立绘")
// .emotion(Emotion.NORMAL)
// .build();

// MyCharacter character = MyCharacter.builder()
// .characterID("char_test_001")
// .characterName("测试角色")
// .height(170)
// .faction("测试阵营")
// .colorBg(new Color(76, 54, 31))
// .colorText(new Color(251, 219, 179))
// .addPortrait(portrait)
// .build();

// // 创建角色视觉元素
// CharacterRef charRef = new CharacterRef(character);
// CharacterVisual visual = new CharacterVisual(charRef, portrait, 100, 100,
// false);

// // 创建对话
// Dialogue dialogue = new Dialogue("测试对话内容", Align.LEFT);

// // 创建记录
// Record record = new Record.Builder()
// .setBackground(new BackgroundVisual(background))
// .addCharacter(visual)
// .addDialogue(dialogue)
// .build();

// return record;
// }
// }
