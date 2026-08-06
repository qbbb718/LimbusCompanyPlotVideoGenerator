
// package com.lbc_plot.render;

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

// import org.slf4j.Logger;
// import org.slf4j.LoggerFactory;

// import com.lbc_plot.render.engine.BatchVideoProcessor;
// import com.lbc_plot.render.engine.FrameComposerService;
// import com.lbc_plot.render.engine.RenderOfImage;
// import com.lbc_plot.render.service.ThumbnailService;
// import com.lbc_plot.render.audio.AudioLoudnessMeasurer;
// import com.lbc_plot.render.audio.AudioTimelineBuilder;
// import com.lbc_plot.render.video.VideoExporter;
// import com.lbc_plot.render.video.VideoConcatenator;

// import com.lbc_plot.plot.model.Record;
// import com.lbc_plot.plot.model.Dialogue;
// import com.lbc_plot.plot.model.Dialogue.Align;

// import com.lbc_plot.resource.model.Background;
// import com.lbc_plot.resource.model.MyCharacter;
// import com.lbc_plot.resource.model.Portrait;
// import com.lbc_plot.resource.model.Emotion;

// import com.lbc_plot.model.video.BackgroundVisual;
// import com.lbc_plot.model.video.CharacterRef;
// import com.lbc_plot.model.video.CharacterVisual;

// import com.lbc_plot.config.ProjectConfig;
// import com.lbc_plot.config.VolumeConfig;
// import com.lbc_plot.render.audio.model.AudioCommand;
// import com.lbc_plot.render.audio.model.AudioSegment;
// import com.lbc_plot.render.audio.model.AudioTimeline;

// import com.lbc_plot.util.io.ImageExporter;
// import com.lbc_plot.util.json.RecordsIO;

// import java.awt.Color;
// import java.awt.image.BufferedImage;
// import java.io.File;

// /**
// * 渲染模块测试类
// * 测试视频渲染相关的各项功能
// */
// class RenderTest {
// private static final Logger logger =
// LoggerFactory.getLogger(RenderTest.class);

// private BatchVideoProcessor videoProcessor;
// private ThumbnailService thumbnailService;
// private AudioLoudnessMeasurer loudnessMeasurer;
// private AudioTimelineBuilder timelineBuilder;
// private VideoExporter videoExporter;
// private VideoConcatenator videoConcatenator;

// private Path testOutputDir;

// @BeforeEach
// void setUp() throws IOException {
// // 创建测试输出目录
// testOutputDir = Paths.get("target/test-logs/render");
// if (!Files.exists(testOutputDir)) {
// Files.createDirectories(testOutputDir);
// }

// // 初始化服务
// videoProcessor = new BatchVideoProcessor();
// thumbnailService = new ThumbnailService();
// loudnessMeasurer = new AudioLoudnessMeasurer();
// timelineBuilder = new AudioTimelineBuilder();
// videoExporter = new VideoExporter();
// videoConcatenator = new VideoConcatenator();

// // 设置测试音量
// VolumeConfig.setUserVolumes(0.1f, 0.9f, 1.2f);
// }

// @AfterEach
// void tearDown() {
// // 清理测试资源
// }

// @Test
// @DisplayName("测试背景渲染")
// void testBackgroundRendering() throws IOException {
// // 创建测试背景
// Background background = new Background("test_bg.png", "测试背景");
// BackgroundVisual visual = new BackgroundVisual(background);

// // 验证背景渲染
// assertNotNull(visual, "BackgroundVisual对象不应该为null");
// assertNotNull(visual.getBackground(), "Background引用不应该为null");
// assertEquals(background, visual.getBackground(), "Background应该一致");

// // 获取图像
// BufferedImage bgImage = visual.getBgImage();
// BufferedImage originalImage = background.getImage();

// assertNotNull(bgImage, "BackgroundVisual图像不应该为null");
// assertNotNull(originalImage, "原始Background图像不应该为null");

// // 检查图像尺寸
// assertEquals(originalImage.getWidth(), bgImage.getWidth(), "图像宽度应该一致");
// assertEquals(originalImage.getHeight(), bgImage.getHeight(), "图像高度应该一致");

// // 导出测试图像
// ImageExporter.exportImage(bgImage,
// testOutputDir.resolve("background_test.png").toString());
// logger.info("背景测试图像已导出");
// }

// @Test
// @DisplayName("测试角色渲染")
// void testCharacterRendering() throws IOException {
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

// CharacterRef charRef = new CharacterRef(character);
// CharacterVisual visual = new CharacterVisual(charRef, portrait, 100, 100,
// false);

// // 验证角色渲染
// assertNotNull(visual, "CharacterVisual对象不应该为null");
// assertNotNull(visual.getChara(), "CharacterRef引用不应该为null");
// assertNotNull(visual.getPortrait(), "Portrait引用不应该为null");

// // 导出测试图像
// BufferedImage charImage = visual.getPortrait().getImage();
// if (charImage != null) {
// ImageExporter.exportImage(charImage,
// testOutputDir.resolve("character_test.png").toString());
// logger.info("角色测试图像已导出");
// }
// }

// @Test
// @DisplayName("测试帧合成")
// void testFrameComposition() throws IOException {
// // 创建测试记录
// Record record = createTestRecord();

// // 执行帧合成
// FrameComposerService composer = new FrameComposerService();
// BufferedImage frame = RenderOfImage.renderPre(
// record,
// true,
// ProjectConfig.VIDEO_WIDTH,
// ProjectConfig.VIDEO_HEIGHT);

// // 验证合成结果
// assertNotNull(frame, "合成的帧不应该为null");
// assertEquals(ProjectConfig.VIDEO_WIDTH, frame.getWidth(), "帧宽度应该匹配配置");
// assertEquals(ProjectConfig.VIDEO_HEIGHT, frame.getHeight(), "帧高度应该匹配配置");

// // 导出测试图像
// ImageExporter.exportImage(frame,
// testOutputDir.resolve("frame_composition_test.png").toString());
// logger.info("帧合成测试图像已导出");
// }

// @Test
// @DisplayName("测试音频处理")
// void testAudioProcessing() {
// // 测试音频时间线构建
// AudioTimeline timeline =
// timelineBuilder.buildTimeline(createTestAudioSegments());
// assertNotNull(timeline, "音频时间线不应该为null");

// // 测试音频响度测量
// // 注意：这里需要实际的音频文件才能完整测试
// // loudnessMeasurer.measureLoudness("test_audio.wav");

// logger.info("音频处理测试完成");
// }

// @Test
// @DisplayName("测试视频导出")
// void testVideoExport() throws IOException {
// // 创建测试记录
// Record record = createTestRecord();

// // 创建临时目录
// Path tempDir = testOutputDir.resolve("temp_videos");
// if (!Files.exists(tempDir)) {
// Files.createDirectories(tempDir);
// }

// try {
// // 导出视频
// String outputPath = testOutputDir.resolve("test_video.mp4").toString();
// boolean success = videoExporter.exportRecordVideo(
// record,
// true,
// ProjectConfig.VIDEO_WIDTH,
// ProjectConfig.VIDEO_HEIGHT,
// outputPath,
// ProjectConfig.FRAME_RATE);

// assertTrue(success, "视频导出应该成功");
// assertTrue(Files.exists(Paths.get(outputPath)), "导出的视频文件应该存在");

// logger.info("视频导出测试完成");
// } catch (Exception e) {
// logger.error("视频导出测试失败", e);
// fail("视频导出测试失败: " + e.getMessage());
// }
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

// /**
// * 创建测试音频片段
// */
// private List<AudioSegment> createTestAudioSegments() {
// // 这里应该创建实际的音频片段
// // 由于没有实际的音频文件，这里返回空列表
// return List.of();
// }
// }
