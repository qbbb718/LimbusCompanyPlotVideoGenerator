

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.model.repository.MyCharacter;
import com.lbc_plot.model.repository.Portrait;
import com.lbc_plot.model.repository.Background;
import com.lbc_plot.model.video.BackgroundVisual;
import com.lbc_plot.model.video.CharacterVisual;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.model.video.Dialogue.Align;
import com.lbc_plot.project.audio.AudioCommand;
import com.lbc_plot.project.audio.AudioCommandType;
import com.lbc_plot.service.BatchVideoProcessor;
import com.lbc_plot.service.RenderOfImage;
import com.lbc_plot.service.RenderOfVideo;
import com.lbc_plot.service.Composer.FrameComposerService;
import com.lbc_plot.util.ImageExporter;
import com.lbc_plot.util.VideoExporter;
import com.lbc_plot.core.ProjectConfig;
import com.lbc_plot.model.Record;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import static org.junit.jupiter.api.Assertions.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.IOException;

/**
 * FrameComposerService 测试类
 */
class FrameComposerServiceTest {
    
    private FrameComposerService composer;
    
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





    // 创建一个测试类
    public Record creatTestRecord() throws IOException{
        // 使用建造者模式（推荐）
        
        // 加载角色
        Portrait portrait_1, portrait_2, portrait_3, portrait_4;
        portrait_1 = Portrait.builder("Gregor-face_serious_R.png")
            .build();
        portrait_1.setfaceX(282);

        portrait_2 = Portrait.builder("Rodion-face_happy_L.png")
            .build();
        portrait_2.setfaceX(200);
        //ImageExporter.exportImage(portrait.getImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_chara.png");

        MyCharacter character = MyCharacter.builder()
            .characterName("格里高尔")
            .height(168)
            .faction("13号罪人")
            .addPortrait(portrait_1)
            .color_bg(new Color(105, 53, 11))
            .build();
        
        MyCharacter character_2 = MyCharacter.builder()
            .characterName("罗佳")
            .height(182)
            .faction("9号罪人")
            .addPortrait(portrait_2)
            .color_bg(new Color(105, 53, 11))
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

        // 组合对话
        Dialogue dialogue = Dialogue.builder()
            .text("别TM嬷我了")
            .location("不XX就出不去的房间")
            .addSpeaker(character)
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
        
        // 四个id
        String 
        ID_1 = "idle",
        ID_2 = "depressed",
        ID_3 = "smile2",
        ID_4 = "serious",
        ID_5 = "旁白";

        // 四张立绘
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
        MyCharacter character = MyCharacter.builder()
            .characterName("格里高尔")
            .height(168)
            .faction("13号罪人")
            .addPortrait(portrait_1)
            .addPortrait(portrait_2)
            .addPortrait(portrait_3)
            .addPortrait(portrait_4)
            .color_bg(new Color(105, 53, 11))
            .build();
        
        //旁白
        MyCharacter character_2 = MyCharacter.getDefaultNarrator();
        


        // 5个角色立绘(一个暗的)
        CharacterVisual characterVisual_1, characterVisual_2, characterVisual_3, characterVisual_4, characterVisual_5;
        characterVisual_1 = CharacterVisual.builder(
            character, 
            character.getPortraitById(ID_1))
            .dim(false)
            .build();
        characterVisual_2 = CharacterVisual.builder(
            character, 
            character.getPortraitById(ID_2))
            .dim(false)
            .build();
        characterVisual_3 = CharacterVisual.builder(
            character, 
            character.getPortraitById(ID_3))
            .dim(false)
            .build();
        characterVisual_4 = CharacterVisual.builder(
            character, 
            character.getPortraitById(ID_4))
            .dim(false)
            .build();
        characterVisual_5 = CharacterVisual.builder(
            character, 
            character.getPortraitById(ID_4))
            .dim(true)
            .build();


        // 加载背景
        Background background = new Background("Story_private_room.png");
        //ImageExporter.exportImage(background.getImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_bg.png");

        BackgroundVisual backgroundVisual = new BackgroundVisual(background);
        //ImageExporter.exportImage(backgroundVisual.getBgImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_bgV.png");


        // 组合5条对话
        Dialogue dialogue_1, dialogue_2, dialogue_3, dialogue_4, dialogue_5;
        
        dialogue_1 = Dialogue.builder()
            .text("嘿，老兄")
            .location("不XX就出不去的房间")
            .addSpeaker(character)
            .build();
        dialogue_2 = Dialogue.builder()
            .text("或者是女士，我不确定")
            .location("不XX就出不去的房间")
            .addSpeaker(character)
            .build();
        dialogue_3 = Dialogue.builder()
            .text("咳，总之呢……")
            .location("不XX就出不去的房间")
            .addSpeaker(character)
            .build();
        dialogue_4 = Dialogue.builder()
            .text("别用你那该死的代码让我说些奇怪的话了！")
            .location("不XX就出不去的房间")
            .addSpeaker(character)
            .speed(1)
            .build();

        dialogue_5 = Dialogue.builder()
            .text("……好可爱")
            .location("不XX就出不去的房间")
            .addSpeaker(character_2)
            .build();
        
        // 组合5条record
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