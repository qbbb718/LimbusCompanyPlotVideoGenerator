import org.junit.jupiter.api.Test;

import java.util.List;

import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.plot.model.Dialogue.Align;
import com.lbc_plot.plot.parser.PlainTextRecordsParser;
import com.lbc_plot.render.controller.TimelineController;
import com.lbc_plot.render.engine.BatchVideoProcessor;
import com.lbc_plot.render.engine.FrameComposerService;
import com.lbc_plot.render.engine.RenderOfImage;
import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.dao.CharacterMapper;
import com.lbc_plot.resource.dao.PortraitDAO;
import com.lbc_plot.resource.model.Background;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;
import com.lbc_plot.resource.service.CharacterService;

import helpers.RecordsCreater;

import com.lbc_plot.common.util.io.ImageExporter;
import com.lbc_plot.common.util.json.RecordsIO;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.config.VolumeConfig;
import com.lbc_plot.render.audio.model.AudioCommand;
import com.lbc_plot.render.audio.model.AudioSegment;
import com.lbc_plot.render.audio.model.AudioTimeline;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.render.service.impl.CharacterServiceImpl;
import com.lbc_plot.render.video.BackgroundVisual;
import com.lbc_plot.render.video.CharacterRef;
import com.lbc_plot.render.video.CharacterVisual;

import java.nio.file.Files;
import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.sqlobject.SqlObjectPlugin;

import helpers.SQLiteTestDatabaseManager;

/**
 * FrameComposerService 测试类
 */
class FrameComposerServiceTest {
    private static final Logger logger = LoggerFactory.getLogger(FrameComposerServiceTest.class);
    private FrameComposerService composer;

    @BeforeEach
    void setUp() {
        composer = new FrameComposerService();
    }

    /**
     * 将 RecordsCreater 中用到的角色与立绘写入测试数据库
     */
    private void seedCharactersToTestDb(SQLiteTestDatabaseManager dbManager) throws IOException {
        // 创建立绘对象（与 RecordsCreater 保持一致）
        com.lbc_plot.resource.model.Portrait p1 = com.lbc_plot.resource.model.Portrait.builder("格里高尔-face_idle_R.png")
                .portraitID("idle").characterID("gregor-id").portName("idle").faceX(282)
                .emotion(com.lbc_plot.resource.model.Emotion.NORMAL)
                .build();
        com.lbc_plot.resource.model.Portrait p2 = com.lbc_plot.resource.model.Portrait
                .builder("格里高尔-face_depressed_L.png")
                .portraitID("depressed").characterID("gregor-id").portName("depressed").faceX(282)
                .emotion(com.lbc_plot.resource.model.Emotion.SAD)
                .build();
        com.lbc_plot.resource.model.Portrait p3 = com.lbc_plot.resource.model.Portrait.builder("格里高尔-face_smile2_L.png")
                .portraitID("smile2").characterID("gregor-id").portName("smile2").faceX(282)
                .emotion(com.lbc_plot.resource.model.Emotion.HAPPY)
                .build();
        com.lbc_plot.resource.model.Portrait p4 = com.lbc_plot.resource.model.Portrait
                .builder("Gregor-face_serious_R.png")
                .portraitID("serious").characterID("gregor-id").portName("serious").faceX(282)
                .emotion(com.lbc_plot.resource.model.Emotion.ANGRY)
                .build();

        // 创建角色并指定一些属性（与 RecordsCreater 保持一致）
        com.lbc_plot.resource.model.MyCharacter ch = com.lbc_plot.resource.model.MyCharacter.builder()
                .characterID("gregor-id")
                .characterName("格里高尔")
                .height(168)
                .faction("13号罪人")
                .addPortrait(p1)
                .addPortrait(p2)
                .addPortrait(p3)
                .addPortrait(p4)
                .colorBg(new Color(105, 53, 11))
                .build();

        // 将角色与立绘写入DB
        Jdbi jdbi = Jdbi.create(dbManager.getConnection()).installPlugin(new SqlObjectPlugin());
        CharacterDAO characterDao = jdbi.onDemand(CharacterDAO.class);
        PortraitDAO portraitDao = jdbi.onDemand(PortraitDAO.class);
        // 将背景写入测试数据库，display_name = "办公室"（通过 BackgroundService）
        com.lbc_plot.resource.dao.BackgroundDAO backgroundDao = jdbi
                .onDemand(com.lbc_plot.resource.dao.BackgroundDAO.class);
        com.lbc_plot.resource.service.BackgroundService bgService = new com.lbc_plot.render.service.impl.BackgroundServiceImpl(
                backgroundDao);
        bgService.findOrCreateByPath(ProjectConfig.BACKGROUNDS_PATH + "Story_private_room.png", "办公室", "test");

        // 使用 DAO 保存
        characterDao.saveWithPortraits(ch, portraitDao);
    }

    @AfterEach
    void tearDown() {
        composer.clearLayers();
    }

    /**
     * 创建测试用的虚拟图像
     */
    private BufferedImage createTestImage(int width, int height, Color color) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, width, height);
        g.dispose();
        return image;
    }

    /**
     * 检查图像是否包含特定颜色（简化版）
     */
    private boolean imageContainsColor(BufferedImage image, Color expectedColor) {
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                if (image.getRGB(x, y) == expectedColor.getRGB()) {
                    return true;
                }
            }
        }
        return false;
    }

    // @Test
    // void testBasicRenderPre() throws IOException {
    // Record record = creatTestRecord();
    // BufferedImage pre = RenderOfImage.renderPre(record, true,
    // ProjectConfig.VIDEO_WIDTH, ProjectConfig.VIDEO_HEIGHT);
    // ImageExporter.exportImage(pre,
    // "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/test4.png");

    // }

    // @Test
    // void testRenderOfVedio() throws IOException {

    // List<Record> records = creatSupersTestRecord();
    // Record record = records.get(4);

    // //BufferedImage pre = RenderOfImage.renderPreExceptDialogue(record, true,
    // ProjectConfig.VIDEO_WIDTH, ProjectConfig.VIDEO_HEIGHT);
    // //ImageExporter.exportImage(pre,
    // "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/test2-1.png");

    // try {
    // // 导出视频
    // RenderOfVideo.exportRecordVideo(
    // record,
    // true,
    // ProjectConfig.VIDEO_WIDTH,
    // ProjectConfig.VIDEO_HEIGHT,
    // "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/test.mp4",
    // ProjectConfig.FRAME_RATE
    // );

    // System.out.println("视频导出成功！");

    // } catch (Exception e) {
    // System.err.println("视频导出失败: " + e.getMessage());
    // e.printStackTrace();
    // }
    // }

    @Test
    void testRenderOfPreImage() throws IOException {
        try {
            // 1. 获取测试数据
            List<Record> records = RecordsCreater.creatSupersTestRecord();
            Record record = records.get(0);

            // 2. 只关注CharacterVisual的定位数据
            logger.info("===== 立绘位置/偏移检查 =====");
            logger.info("当前记录ID: {}", record.getUuid());

            int index = 0;
            for (CharacterVisual cv : record.getCharacters()) {
                logger.info("\n[立绘 {}]", ++index);

                // 核心定位数据
                logger.info("  角色ID: {}", cv.getChara().getCharacterID());
                logger.info("  基础位置: ({}, {})", cv.getPosX(), cv.getPosY());
                logger.info("  手动调整: ({}, {})", cv.getAdjX(), cv.getAdjY());
                logger.info("  最终坐标: ({}, {})",
                        cv.getPosX() + cv.getAdjX(),
                        cv.getPosY() + cv.getAdjY());

                // 关联数据检查
                logger.info("  立绘资源: {}", cv.getPortrait().getPortraitID());
                logger.info("  是否压暗: {}", cv.isDim());

                // 图像状态
                try {
                    BufferedImage img = cv.getPortrait().getImage();
                    if (img != null) {
                        logger.info("  图片尺寸: {}x{}", img.getWidth(), img.getHeight());
                    } else {
                        logger.warn("  图片未加载!");
                    }
                } catch (Exception e) {
                    logger.error("  图片加载失败", e);
                }
            }

            // 3. 执行渲染并保存调试快照
            BufferedImage debugImage = RenderOfImage.renderPre(
                    record,
                    true,
                    ProjectConfig.VIDEO_WIDTH,
                    ProjectConfig.VIDEO_HEIGHT);
            ImageExporter.exportImage(
                    debugImage,
                    "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\position_check.png");
            logger.info("调试快照已保存");

        } catch (Exception e) {
            logger.error("调试失败", e);
        }
    }

    @Test
    void testRenderOfRecords() throws IOException {
        try {
            // 你的Record列表
            List<Record> records = RecordsCreater.creatSupersTestRecord();

            VolumeConfig.setUserVolumes(0.1f, 0.9f, 1.2f);

            // // 如果你的BGM文件普遍偏小声，可以增加BGM增益
            // VolumeConfig.setBgmGain(1.5f); // BGM增加50%音量
            // // 如果音效文件普遍太大声，可以减少音效增益
            // VolumeConfig.setSfxGain(0.8f); // 音效减少20%音量
            // // 语音保持原样
            // VolumeConfig.setVoiceGain(1.0f);

            // 处理整个Record列表
            BatchVideoProcessor.processRecordList(
                    records,
                    "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\final_video.mp4",
                    "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\temp_videos",
                    true,
                    ProjectConfig.VIDEO_WIDTH,
                    ProjectConfig.VIDEO_HEIGHT,
                    ProjectConfig.FRAME_RATE);

            System.out.println("批量视频处理完成！");

            // 更新
            // BatchVideoProcessor.updateSingleRecord(4, records,
            // "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\final_video.mp4",
            // "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\temp_videos");

        } catch (Exception e) {
            System.err.println("处理失败: " + e.getMessage());
            e.printStackTrace();
        }

    }

    @Test
    void testRenderFromPlainText() throws IOException {
        // 这个字符串根据 helpers/RecordsCreater.creatSupersTestRecord() 构造
        String script = "[BusInside (online-audio-converter.com)]\n" +
                "{Story_private_room.png}\n" +
                "格里高尔: 嘿，老兄(NOLMAL)\n" +
                "格里高尔: 或者是女士，我不确定(SAD)\n" +
                "格里高尔: 咳，总之呢……(HAPPY)\n" +
                "[-STOP]\n" +
                "格里高尔: 别用你那该死的代码让我说些奇怪的话了！听到了吗? 喂, 别在那别过头装作听不见的样子. 该死的. 喂!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!(ANGRY)\n" +
                "旁白: ……好可爱!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";

        // 写入临时文件
        Path tmp = Files.createTempFile("script_for_render", ".txt");
        Files.writeString(tmp, script);

        // 使用真实测试数据库并写入角色/立绘数据
        SQLiteTestDatabaseManager dbManager = new SQLiteTestDatabaseManager();
        seedCharactersToTestDb(dbManager);

        Jdbi jdbi = Jdbi.create(dbManager.getConnection())
                .installPlugin(new SqlObjectPlugin());

        // 注册CharacterMapper，需要jdbi实例
        jdbi.registerRowMapper(CharacterMapper.class, new CharacterMapper(jdbi));
        CharacterDAO characterDao = jdbi.onDemand(CharacterDAO.class);
        PortraitDAO portraitDao = jdbi.onDemand(PortraitDAO.class);

        CharacterService svcReal = new CharacterServiceImpl(characterDao, portraitDao);

        // 使用 BackgroundService（来自测试数据库）让解析器能读取到 display_name
        com.lbc_plot.resource.dao.BackgroundDAO backgroundDao = jdbi
                .onDemand(com.lbc_plot.resource.dao.BackgroundDAO.class);
        com.lbc_plot.resource.service.BackgroundService bgService = new com.lbc_plot.render.service.impl.BackgroundServiceImpl(
                backgroundDao);

        // 解析并生成 records（真实服务 + 背景 service）
        List<Record> records = PlainTextRecordsParser.parse(tmp, svcReal, bgService);

        // 导出解析结果为 JSON 以便检查
        try {
            Path jsonFile = Paths
                    .get("E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\plaintext_records.json");
            RecordsIO.exportRecords(records, jsonFile);
            logger.info("解析得到的 records 已导出为 JSON: {}", jsonFile.toAbsolutePath());
        } catch (Exception e) {
            logger.warn("导出 records 为 JSON 失败: {}", e.getMessage());
        }

        // 输出视频到 target/test-logs/plaintext_render.mp4
        try {
            VolumeConfig.setUserVolumes(0.1f, 0.9f, 1.2f);
            BatchVideoProcessor.processRecordList(
                    records,
                    "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\plaintext_render.mp4",
                    "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\temp_videos",
                    true,
                    ProjectConfig.VIDEO_WIDTH,
                    ProjectConfig.VIDEO_HEIGHT,
                    ProjectConfig.FRAME_RATE);
            System.out.println("Plain text -> records 渲染完成，文件: target/test-logs/plaintext_render.mp4");
        } catch (Exception e) {
            System.err.println("处理失败: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Test
    void testExportJson() throws IOException {
        try {
            // 你的Record列表
            List<Record> records = RecordsCreater.creatSupersTestRecord();

            Path jsonFile = Paths.get("E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\my_records.json");
            RecordsIO.exportRecords(records, jsonFile);

        } catch (Exception e) {
            System.err.println("处理失败: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @Test
    void testImportJson() throws IOException {
        final Logger logger = LoggerFactory.getLogger(this.getClass());

        try {
            // 1. 读取JSON文件
            Path jsonFile = Paths.get("E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\my_records.json");
            logger.info("开始导入JSON文件: {}", jsonFile);

            // 2. 反序列化记录
            List<Record> records = RecordsIO.importRecords(jsonFile);
            logger.info("成功导入 {} 条记录", records.size());

            // 3. 详细检查每条记录
            for (int i = 0; i < records.size(); i++) {
                Record record = records.get(i);
                logger.info("\n===== 记录 {} =====", i + 1);
                logger.info("UUID: {}", record.getUuid());
                logger.info("持续时间: {} 帧", record.getDurationFrames());

                // 检查背景
                logger.info("背景数量: {}", record.getBackgroundVisuals().size());
                for (BackgroundVisual bg : record.getBackgroundVisuals()) {
                    logger.info(" - 背景: {} (位置: {},{} 缩放: {})",
                            bg.getBackground().getPath(),
                            bg.getPosX(), bg.getPosY(),
                            bg.getScale());
                }

                // 重点检查角色立绘
                logger.info("角色立绘数量: {}", record.getCharacters().size());
                for (CharacterVisual cv : record.getCharacters()) {
                    logger.info("\n[角色立绘]");
                    logger.info(" - 角色ID: {}", cv.getChara().getCharacterID());
                    logger.info(" - 立绘ID: {}", cv.getPortrait().getPortraitID());
                    logger.info(" - 位置: ({},{}) + 调整: ({},{}) → 最终: ({},{})",
                            cv.getPosX(), cv.getPosY(),
                            cv.getAdjX(), cv.getAdjY(),
                            cv.getPosX() + cv.getAdjX(),
                            cv.getPosY() + cv.getAdjY());

                    // 检查图片加载状态
                    try {
                        BufferedImage img = cv.getPortrait().getImage();

                        String path = "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\"
                                + record.getUuid() + ".png";
                        ImageExporter.exportImage(
                                img,
                                path);

                        if (img != null) {
                            logger.info(" - 图片状态: 已加载 ({}x{})", img.getWidth(), img.getHeight());
                        } else {
                            logger.warn(" - 图片状态: 未加载 (路径: {})", cv.getPortrait().getImagePath());
                        }
                    } catch (Exception e) {
                        logger.error(" - 图片加载异常: {}", e.getMessage());
                    }
                }
            }

            // 4. 处理视频

            VolumeConfig.setUserVolumes(0.1f, 0.9f, 1.2f);

            logger.info("\n开始视频处理...");
            BatchVideoProcessor.processRecordList(
                    records,
                    "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\testImportJson.mp4",
                    "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\temp_videos",
                    true,
                    ProjectConfig.VIDEO_WIDTH,
                    ProjectConfig.VIDEO_HEIGHT,
                    ProjectConfig.FRAME_RATE);
            logger.info("批量视频处理完成！");

        } catch (Exception e) {
            logger.error("处理失败", e);
        }
    }

}