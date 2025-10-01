

import org.junit.jupiter.api.Test;
import org.sqlite.SQLiteDataSource;

import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.model.video.BackgroundVisual;
import com.lbc_plot.model.video.CharacterRef;
import com.lbc_plot.model.video.CharacterVisual;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.model.video.Dialogue.Align;
import com.lbc_plot.project.audio.AudioCommand;
import com.lbc_plot.project.audio.AudioCommandType;
import com.lbc_plot.util.io.ImageExporter;
import com.lbc_plot.util.io.VideoExporter;
import com.lbc_plot.util.json.RecordsIO;

import helpers.SQLiteTestDatabaseManager;

import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.CharacterMapper;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.DAO.PortraitMapper;
import com.lbc_plot.application.Composer.BatchVideoProcessor;
import com.lbc_plot.application.Composer.FrameComposerService;
import com.lbc_plot.application.Composer.RenderOfImage;
import com.lbc_plot.application.Composer.RenderOfVideo;
import com.lbc_plot.application.service.CharacterService;
import com.lbc_plot.application.service.impl.CharacterServiceImpl;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.model.Record;
import com.lbc_plot.model.storage.Background;
import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;

import org.junit.jupiter.api.BeforeEach;
import org.bytedeco.flycapture.FlyCapture2.ImageEventCallback;
import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.sqlobject.SqlObjectPlugin;
import org.junit.jupiter.api.AfterEach;
import static org.junit.jupiter.api.Assertions.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * FrameComposerService 测试类
 */
class FrameComposerServiceTest {
    private static final Logger logger = LoggerFactory.getLogger(FrameComposerServiceTest.class);

    
    private FrameComposerService composer;
    
    private CharacterDAO characterDao;
    private PortraitDAO portraitDao;
    private SQLiteTestDatabaseManager dbManager;
    
    @BeforeEach
    void setUp() {
        composer = new FrameComposerService();
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
    //     Record record = creatTestRecord();
    //     BufferedImage pre = RenderOfImage.renderPre(record, true, ProjectConfig.VIDEO_WIDTH, ProjectConfig.VIDEO_HEIGHT);
    //     ImageExporter.exportImage(pre, "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/test4.png");
        
    // }

    // @Test
    // void testRenderOfVedio() throws IOException {

    //     List<Record> records = creatSupersTestRecord();
    //     Record record = records.get(4);

    //     //BufferedImage pre = RenderOfImage.renderPreExceptDialogue(record, true, ProjectConfig.VIDEO_WIDTH, ProjectConfig.VIDEO_HEIGHT);
    //     //ImageExporter.exportImage(pre, "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/test2-1.png");

    //     try {
    //         // 导出视频
    //         RenderOfVideo.exportRecordVideo(
    //             record, 
    //             true, 
    //             ProjectConfig.VIDEO_WIDTH, 
    //             ProjectConfig.VIDEO_HEIGHT, 
    //             "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/test.mp4", 
    //             ProjectConfig.FRAME_RATE
    //         );
            
    //         System.out.println("视频导出成功！");
            
    //     } catch (Exception e) {
    //         System.err.println("视频导出失败: " + e.getMessage());
    //         e.printStackTrace();
    //     }
    // }


    @Test
    void testRenderOfPreImage() throws IOException {
        try {
            // 1. 获取测试数据
            List<Record> records = creatSupersTestRecord();
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
                ProjectConfig.VIDEO_HEIGHT
            );
            ImageExporter.exportImage(
                debugImage, 
                "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\position_check.png"
            );
            logger.info("调试快照已保存");
            
        } catch (Exception e) {
            logger.error("调试失败", e);
        }
    }
    

    
    @Test
    void testRenderOfVedioList() throws IOException {
        try {
            // 你的Record列表
            List<Record> records = creatSupersTestRecord();


            // 处理整个Record列表
            BatchVideoProcessor.processRecordList(
                records,
                "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\final_video.mp4",
                "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\temp_videos",
                true,
                ProjectConfig.VIDEO_WIDTH,
                ProjectConfig.VIDEO_HEIGHT,
                ProjectConfig.FRAME_RATE
            );
            
            System.out.println("批量视频处理完成！");


            // 更新
            // BatchVideoProcessor.updateSingleRecord(4, records,
            //     "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\final_video.mp4",
            //      "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\temp_videos");

            
        } catch (Exception e) {
            System.err.println("处理失败: " + e.getMessage());
            e.printStackTrace();
        }

    }


    @Test
    void testExportJson() throws IOException {
        try {
            // 你的Record列表
            List<Record> records = creatSupersTestRecord();


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

                        String path = "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\"+ record.getUuid() +".png";
                        ImageExporter.exportImage(
                            img, 
                            path
                        );

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
            logger.info("\n开始视频处理...");
            BatchVideoProcessor.processRecordList(
                records,
                "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\testImportJson.mp4",
                "E:\\LimbusCompanyPlotVideoGenerator\\demo\\target\\test-logs\\temp_videos",
                true,
                ProjectConfig.VIDEO_WIDTH,
                ProjectConfig.VIDEO_HEIGHT,
                ProjectConfig.FRAME_RATE
            );
            logger.info("批量视频处理完成！");
            
        } catch (Exception e) {
            logger.error("处理失败", e);
        }
    }





    // 创建一个测试类
    public Record creatTestRecord() throws IOException{
        // 使用建造者模式（推荐）
        
        // 加载角色
        Portrait portrait_1, portrait_2, portrait_3;
        portrait_1 = Portrait.builder("Gregor-face_serious_R.png")
            .build();
        portrait_1.setFaceX(282);

        portrait_2 = Portrait.builder("Rodion-face_happy_L.png")
            .build();
        portrait_2.setFaceX(200);
        //ImageExporter.exportImage(portrait.getImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_chara.png");

        MyCharacter character = MyCharacter.builder()
            .characterName("格里高尔")
            .height(168)
            .faction("13号罪人")
            .addPortrait(portrait_1)
            .colorBg(new Color(105, 53, 11))
            .build();
        
        MyCharacter character_2 = MyCharacter.builder()
            .characterName("罗佳")
            .height(182)
            .faction("9号罪人")
            .addPortrait(portrait_2)
            .colorBg(new Color(105, 53, 11))
            .build();
        
        CharacterVisual characterVisual = CharacterVisual.builder(character, portrait_1)
            .dim(false)
            .build();
        CharacterVisual characterVisual_2 = CharacterVisual.builder(character_2, portrait_2)
            .dim(true)
            .adjX(400)
            .build();
        //ImageExporter.exportImage(characterVisual.getImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_charaV.png");


        // 加载背景
        Background background = new Background("Story_private_room.png");
        //ImageExporter.exportImage(background.getImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_bg.png");

        BackgroundVisual backgroundVisual = new BackgroundVisual(background);
        //ImageExporter.exportImage(backgroundVisual.getBgImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_bgV.png");

        CharacterRef characterRef1 = CharacterRef.from(character);
        CharacterRef characterRef2 = CharacterRef.from(character_2);
        // 组合对话
        Dialogue dialogue = Dialogue.builder()
            .text("别TM嬷我了")
            .location("不XX就出不去的房间")
            .addSpeaker(characterRef1)
            .align(Align.LEFT)
            .build();
        
        // 组合record
        Record record = new Record.Builder()
            .dialogue(dialogue)
            .addBackground(backgroundVisual)
            .addCharacter(characterVisual_2)
            .addCharacter(characterVisual)
            .build();

        return record;
    }








    // 创建一个超级测试类
    public List<Record> creatSupersTestRecord() throws IOException{
        logger.info("===== 开始创建超级测试记录 =====");
        
        // 四个id
        String 
        ID_1 = "idle",
        ID_2 = "depressed",
        ID_3 = "smile2",
        ID_4 = "serious",
        ID_5 = "旁白";

        // 四张立绘
        logger.debug("创建测试立绘对象...");
        Portrait portrait_1, portrait_2, portrait_3, portrait_4;
        portrait_1 = Portrait.builder("格里高尔-face_idle_R.png")
            .portraitID(ID_1)
            .faceX(282)
            .build();
        portrait_2 = Portrait.builder("格里高尔-face_depressed_L.png")
            .portraitID(ID_2)
            .faceX(282)
            .build();
        portrait_3 = Portrait.builder("格里高尔-face_smile2_L.png")
            .portraitID(ID_3)
            .faceX(282)
            .build();
        portrait_4 = Portrait.builder("Gregor-face_serious_R.png")
            .portraitID(ID_4)
            .faceX(282)
            .build();


        //一个角色
        logger.info("创建测试角色对象...");
        MyCharacter character = MyCharacter.builder()
            .characterName("格里高尔")
            .height(168)
            .faction("13号罪人")
            .addPortrait(portrait_1)
            .addPortrait(portrait_2)
            .addPortrait(portrait_3)
            .addPortrait(portrait_4)
            .colorBg(new Color(105, 53, 11))
            .build();
        

        MyCharacter character_2 = MyCharacter.getDefaultNarrator();


        // 获取DAO实例
        logger.debug("初始化数据库连接...");
        dbManager = new SQLiteTestDatabaseManager();
        Jdbi jdbi = Jdbi.create(dbManager.getConnection())
            .installPlugin(new SqlObjectPlugin())
            .registerRowMapper(new CharacterMapper());
        
        characterDao = jdbi.onDemand(CharacterDAO.class);
        
        portraitDao = jdbi.onDemand(PortraitDAO.class);
        CharacterService characterService = new CharacterServiceImpl(characterDao, portraitDao);


        // 5个角色立绘(一个暗的)
        logger.debug("构建角色可视化对象...");
        CharacterVisual characterVisual_1, characterVisual_2, characterVisual_3, characterVisual_4, characterVisual_5;
        characterVisual_1 = CharacterVisual.builder(
            character, 
            characterService.getPortraitById(character, ID_1))
            .dim(false)
            .build();
        characterVisual_2 = CharacterVisual.builder(
            character, 
            characterService.getPortraitById(character, ID_2))
            .dim(false)
            .build();
        characterVisual_3 = CharacterVisual.builder(
            character, 
            characterService.getPortraitById(character, ID_3))
            .dim(false)
            .build();
        characterVisual_4 = CharacterVisual.builder(
            character, 
            characterService.getPortraitById(character, ID_4))
            .dim(false)
            .build();
        characterVisual_5 = CharacterVisual.builder(
            character, 
            characterService.getPortraitById(character, ID_5)) //甚至顺手验证了一下不存在ID导出默认立绘
            .dim(true)
            .build();


        // 加载背景
        logger.info("加载背景资源...");
        Background background = new Background("Story_private_room.png");
        //ImageExporter.exportImage(background.getImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_bg.png");

        BackgroundVisual backgroundVisual = new BackgroundVisual(background);
        //ImageExporter.exportImage(backgroundVisual.getBgImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_bgV.png");


        CharacterRef characterRef1 = CharacterRef.from(character);
        CharacterRef characterRef2 = CharacterRef.from(character_2);

        // 组合5条对话
        logger.debug("构建对话记录...");
        Dialogue dialogue_1, dialogue_2, dialogue_3, dialogue_4, dialogue_5;
        
        dialogue_1 = Dialogue.builder()
            .text("嘿，老兄")
            .location("不XX就出不去的房间")
            .addSpeaker(characterRef1)
            .build();
        dialogue_2 = Dialogue.builder()
            .text("或者是女士，我不确定")
            .location("不XX就出不去的房间")
            .addSpeaker(characterRef1)
            .build();
        dialogue_3 = Dialogue.builder()
            .text("咳，总之呢……")
            .location("不XX就出不去的房间")
            .addSpeaker(characterRef1)
            .build();
        dialogue_4 = Dialogue.builder()
            .text("别用你那该死的代码让我说些奇怪的话了！")
            .location("不XX就出不去的房间")
            .addSpeaker(characterRef1)
            .speed(1)
            .build();

        dialogue_5 = Dialogue.builder()
            .text("……好可爱")
            .location("不XX就出不去的房间")
            .addSpeaker(characterRef2)
            .build();
        
        // 组合5条record
        logger.info("组装最终record对象...");
        Record record_1, record_2, record_3, record_4, record_5;

        record_1 = new Record.Builder()
            .uuid(ID_1)
            .dialogue(dialogue_1)
            .addBackground(backgroundVisual)
            .addCharacter(characterVisual_1)
            .build();
        record_2 = new Record.Builder()
            .uuid(ID_2)
            .dialogue(dialogue_2)
            .addBackground(backgroundVisual)
            .addCharacter(characterVisual_2)
            .build();
        record_3 = new Record.Builder()
            .uuid(ID_3)
            .dialogue(dialogue_3)
            .addBackground(backgroundVisual)
            .addCharacter(characterVisual_3)
            .build();
        record_4 = new Record.Builder()
            .uuid(ID_4)
            .dialogue(dialogue_4)
            .addBackground(backgroundVisual)
            .addCharacter(characterVisual_4)
            .build();
        record_5 = new Record.Builder()
            .uuid(ID_5)
            .dialogue(dialogue_5)
            .addBackground(backgroundVisual)
            .addCharacter(characterVisual_5)
            .build();

        List<Record> records = new ArrayList<>();
        records.add(record_1);
        records.add(record_2);
        records.add(record_3);
        records.add(record_4);
        records.add(record_5);

        return records;
    }
    
}