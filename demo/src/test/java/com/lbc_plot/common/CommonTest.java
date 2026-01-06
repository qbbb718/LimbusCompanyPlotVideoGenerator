
// package com.lbc_plot.common;

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

// import com.lbc_plot.util.ImageCropper;
// import com.lbc_plot.util.ImageDarkener;
// import com.lbc_plot.util.RecordDurationCalculator;
// import com.lbc_plot.util.RenderQualityUtils;
// import com.lbc_plot.util.ResourceChecker;
// import com.lbc_plot.util.TextureColorizer;
// import com.lbc_plot.util.VideoAudioMerger;
// import com.lbc_plot.util.db.SQLiteDatabaseManager;
// import com.lbc_plot.util.io.ImageExporter;
// import com.lbc_plot.util.io.ImageReader;
// import com.lbc_plot.util.io.SequenceFrameExporter;
// import com.lbc_plot.util.json.ColorDeserializer;
// import com.lbc_plot.util.json.ColorSerializer;
// import com.lbc_plot.util.json.RecordsIO;
// import com.lbc_plot.common.controller.HealthController;
// import com.lbc_plot.common.util.ColorUtils;
// import com.lbc_plot.common.util.PathUtils;
// import com.lbc_plot.service.StorageService;

// import java.awt.Color;
// import java.awt.image.BufferedImage;
// import java.io.File;
// import java.sql.SQLException;

// /**
// * 通用模块测试类
// * 测试通用功能相关的各项功能
// */
// class CommonTest {
// private static final Logger logger =
// LoggerFactory.getLogger(CommonTest.class);

// private SQLiteDatabaseManager dbManager;
// private HealthController healthController;
// private StorageService storageService;

// private Path testOutputDir;

// @BeforeEach
// void setUp() throws IOException, SQLException {
// // 创建测试输出目录
// testOutputDir = Paths.get("target/test-logs/common");
// if (!Files.exists(testOutputDir)) {
// Files.createDirectories(testOutputDir);
// }

// // 初始化服务
// dbManager = new SQLiteDatabaseManager();
// healthController = new HealthController();
// storageService = new StorageService();
// }

// @AfterEach
// void tearDown() throws SQLException {
// // 清理测试资源
// if (dbManager != null) {
// dbManager.closeConnection();
// }
// }

// @Test
// @DisplayName("测试颜色工具")
// void testColorUtils() {
// // 测试颜色转换
// Color color = new Color(76, 54, 31);
// String colorString = ColorUtils.colorToString(color);
// assertEquals("76,54,31,255", colorString, "颜色字符串应该一致");

// Color parsedColor = ColorUtils.stringToColor(colorString);
// assertEquals(color, parsedColor, "解析后的颜色应该一致");

// // 测试颜色混合
// Color color1 = new Color(255, 0, 0);
// Color color2 = new Color(0, 255, 0);
// Color mixed = ColorUtils.mixColors(color1, color2, 0.5f);
// assertEquals(127, mixed.getRed(), "混合后红色分量应该正确");
// assertEquals(127, mixed.getGreen(), "混合后绿色分量应该正确");
// assertEquals(0, mixed.getBlue(), "混合后蓝色分量应该正确");

// logger.info("颜色工具测试完成");
// }

// @Test
// @DisplayName("测试路径工具")
// void testPathUtils() {
// // 测试路径规范化
// String path1 = "path//to//file";
// String normalized1 = PathUtils.normalize(path1);
// assertEquals("path/to/file", normalized1, "路径规范化应该正确");

// // 测试路径组合
// String combined = PathUtils.combine("path", "to", "file");
// assertEquals("path/to/file", combined, "路径组合应该正确");

// // 测试文件扩展名
// String extension = PathUtils.getExtension("test.png");
// assertEquals("png", extension, "文件扩展名应该正确");

// logger.info("路径工具测试完成");
// }

// @Test
// @DisplayName("测试图像工具")
// void testImageUtils() throws IOException {
// // 创建测试图像
// BufferedImage testImage = new BufferedImage(100, 100,
// BufferedImage.TYPE_INT_ARGB);
// for (int x = 0; x < 100; x++) {
// for (int y = 0; y < 100; y++) {
// testImage.setRGB(x, y, Color.RED.getRGB());
// }
// }

// // 测试图像裁剪
// BufferedImage cropped = ImageCropper.crop(testImage, 10, 10, 50, 50);
// assertEquals(50, cropped.getWidth(), "裁剪后宽度应该正确");
// assertEquals(50, cropped.getHeight(), "裁剪后高度应该正确");

// // 测试图像变暗
// BufferedImage darkened = ImageDarkener.darken(testImage, 0.5f);
// Color darkenedColor = new Color(darkened.getRGB(50, 50));
// assertTrue(darkenedColor.getRed() < 255, "变暗后红色分量应该减小");

// // 测试图像导出
// Path outputPath = testOutputDir.resolve("test_image.png");
// ImageExporter.exportImage(testImage, outputPath.toString());
// assertTrue(Files.exists(outputPath), "导出的图像文件应该存在");

// // 测试图像读取
// BufferedImage loadedImage = ImageReader.readImage(outputPath.toString());
// assertNotNull(loadedImage, "读取的图像不应该为null");
// assertEquals(testImage.getWidth(), loadedImage.getWidth(), "读取的图像宽度应该一致");
// assertEquals(testImage.getHeight(), loadedImage.getHeight(), "读取的图像高度应该一致");

// logger.info("图像工具测试完成");
// }

// @Test
// @DisplayName("测试记录时长计算")
// void testRecordDurationCalculator() {
// // 测试记录时长计算
// // 这里需要实际的记录对象才能完整测试
// // RecordDurationCalculator calculator = new RecordDurationCalculator();
// // float duration = calculator.calculateDuration(record);

// logger.info("记录时长计算测试完成");
// }

// @Test
// @DisplayName("测试渲染质量工具")
// void testRenderQualityUtils() {
// // 测试渲染质量设置
// RenderQualityUtils.setQuality(RenderQualityUtils.Quality.HIGH);
// assertEquals(RenderQualityUtils.Quality.HIGH,
// RenderQualityUtils.getCurrentQuality(),
// "当前渲染质量应该正确");

// // 测试渲染参数
// int[] params = RenderQualityUtils.getRenderParameters();
// assertNotNull(params, "渲染参数不应该为null");
// assertTrue(params.length > 0, "渲染参数数组长度应该大于0");

// logger.info("渲染质量工具测试完成");
// }

// @Test
// @DisplayName("测试资源检查器")
// void testResourceChecker() {
// // 测试资源检查
// ResourceChecker checker = new ResourceChecker();

// // 测试文件存在性检查
// assertTrue(checker.fileExists("pom.xml"), "pom.xml文件应该存在");
// assertFalse(checker.fileExists("non_existent_file.txt"), "不存在的文件应该返回false");

// // 测试目录存在性检查
// assertTrue(checker.directoryExists("src"), "src目录应该存在");
// assertFalse(checker.directoryExists("non_existent_dir"), "不存在的目录应该返回false");

// logger.info("资源检查器测试完成");
// }

// @Test
// @DisplayName("测试纹理着色器")
// void testTextureColorizer() throws IOException {
// // 创建测试图像
// BufferedImage testImage = new BufferedImage(100, 100,
// BufferedImage.TYPE_INT_ARGB);
// for (int x = 0; x < 100; x++) {
// for (int y = 0; y < 100; y++) {
// testImage.setRGB(x, y, Color.WHITE.getRGB());
// }
// }

// // 测试纹理着色
// Color color = new Color(255, 0, 0, 128); // 半透明红色
// BufferedImage colored = TextureColorizer.colorize(testImage, color);

// // 验证着色结果
// Color coloredPixel = new Color(colored.getRGB(50, 50), true);
// assertTrue(coloredPixel.getRed() > 0, "着色后红色分量应该大于0");

// // 导出测试图像
// Path outputPath = testOutputDir.resolve("colored_texture.png");
// ImageExporter.exportImage(colored, outputPath.toString());
// assertTrue(Files.exists(outputPath), "导出的着色图像文件应该存在");

// logger.info("纹理着色器测试完成");
// }

// @Test
// @DisplayName("测试视频音频合并器")
// void testVideoAudioMerger() {
// // 测试视频音频合并
// // 这里需要实际的视频和音频文件才能完整测试
// // VideoAudioMerger merger = new VideoAudioMerger();
// // boolean success = merger.merge("video.mp4", "audio.wav", "output.mp4");

// logger.info("视频音频合并器测试完成");
// }

// @Test
// @DisplayName("测试序列帧导出器")
// void testSequenceFrameExporter() throws IOException {
// // 创建测试图像
// BufferedImage testImage = new BufferedImage(100, 100,
// BufferedImage.TYPE_INT_ARGB);
// for (int x = 0; x < 100; x++) {
// for (int y = 0; y < 100; y++) {
// testImage.setRGB(x, y, Color.BLUE.getRGB());
// }
// }

// // 创建图像列表
// List<BufferedImage> frames = new ArrayList<>();
// for (int i = 0; i < 5; i++) {
// frames.add(testImage);
// }

// // 测试序列帧导出
// Path outputDir = testOutputDir.resolve("sequence_frames");
// if (!Files.exists(outputDir)) {
// Files.createDirectories(outputDir);
// }

// SequenceFrameExporter exporter = new SequenceFrameExporter();
// exporter.exportFrames(frames, outputDir.toString(), "frame_", "png");

// // 验证导出结果
// for (int i = 0; i < 5; i++) {
// Path framePath = outputDir.resolve("frame_" + String.format("%04d", i) +
// ".png");
// assertTrue(Files.exists(framePath), "导出的帧文件应该存在: " + framePath);
// }

// logger.info("序列帧导出器测试完成");
// }

// @Test
// @DisplayName("测试JSON工具")
// void testJsonUtils() {
// // 测试颜色序列化
// ColorSerializer serializer = new ColorSerializer();
// ColorDeserializer deserializer = new ColorDeserializer();

// Color color = new Color(76, 54, 31, 255);
// String json = serializer.serialize(color);
// assertNotNull(json, "序列化的JSON不应该为null");

// Color parsedColor = deserializer.deserialize(json);
// assertEquals(color, parsedColor, "解析后的颜色应该一致");

// // 测试记录IO
// // 这里需要实际的记录对象才能完整测试
// // RecordsIO.saveRecords(records, "test.json");
// // List<Record> loadedRecords = RecordsIO.loadRecords("test.json");

// logger.info("JSON工具测试完成");
// }

// @Test
// @DisplayName("测试数据库管理器")
// void testDatabaseManager() throws SQLException {
// // 测试数据库连接
// assertNotNull(dbManager.getConnection(), "数据库连接不应该为null");
// assertFalse(dbManager.getConnection().isClosed(), "数据库连接应该是开启状态");

// // 测试表存在性检查
// // 这里需要实际的表名才能完整测试
// // boolean exists = dbManager.tableExists("test_table");

// // 测试记录存在性检查
// // 这里需要实际的表名和字段才能完整测试
// // boolean recordExists = dbManager.recordExists("test_table", "id",
// "test_id");

// logger.info("数据库管理器测试完成");
// }

// @Test
// @DisplayName("测试健康控制器")
// void testHealthController() {
// // 测试健康控制器
// assertNotNull(healthController, "HealthController对象不应该为null");

// // 这里可以添加更多健康控制器相关的测试
// // 例如：健康检查、状态报告等

// logger.info("健康控制器测试完成");
// }

// @Test
// @DisplayName("测试存储服务")
// void testStorageService() {
// // 测试存储服务
// assertNotNull(storageService, "StorageService对象不应该为null");

// // 这里可以添加更多存储服务相关的测试
// // 例如：文件存储、资源加载等

// logger.info("存储服务测试完成");
// }
// }
