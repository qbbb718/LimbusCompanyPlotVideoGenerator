

import org.junit.jupiter.api.Test;

import com.lbc_plot.model.repository.MyCharacter;
import com.lbc_plot.model.repository.Portrait;
import com.lbc_plot.model.repository.Background;
import com.lbc_plot.model.video.BackgroundVisual;
import com.lbc_plot.model.video.CharacterVisual;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.model.video.Dialogue.Align;
import com.lbc_plot.project.audio.AudioCommand;
import com.lbc_plot.project.audio.AudioCommandType;
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


    @Test
    void testBasicRenderPre() throws IOException {
        // Record record = creatTestRecord();
        // BufferedImage pre = RenderOfImage.renderPre(record, true, ProjectConfig.VIDEO_WIDTH, ProjectConfig.VIDEO_HEIGHT);
        // ImageExporter.exportImage(pre, "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/test4.png");
        
    }

    @Test
    void testRenderOfVedio() throws IOException {

        Record record = creatTestRecord();

        

        //BufferedImage pre = RenderOfImage.renderPreExceptDialogue(record, true, ProjectConfig.VIDEO_WIDTH, ProjectConfig.VIDEO_HEIGHT);
        //ImageExporter.exportImage(pre, "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/test2-1.png");

        try {
            // 导出视频
            RenderOfVideo.exportRecordVideo(
                record, 
                ProjectConfig.DEFAULT_EIALOGUE_SPEED, 
                true, 
                ProjectConfig.VIDEO_WIDTH, 
                ProjectConfig.VIDEO_HEIGHT, 
                "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/test.mp4", 
                ProjectConfig.FRAME_RATE
            );
            
            System.out.println("视频导出成功！");
            
        } catch (Exception e) {
            System.err.println("视频导出失败: " + e.getMessage());
            e.printStackTrace();
        }
    }

    // 创建一个测试类
    public Record creatTestRecord() throws IOException{
        // 使用建造者模式（推荐）
        
        // 加载角色
        Portrait portrait_1, portrait_2;
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
            .speed(6)
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
    public Record creatSupersTestRecord() throws IOException{
        // 使用建造者模式（推荐）
        
        // 加载角色
        Portrait portrait_1, portrait_2;
        portrait_1 = Portrait.builder("Gregor-face_serious_R.png")
            .faceX(282)
            .build();


        MyCharacter character = MyCharacter.builder()
            .characterName("格里高尔")
            .height(168)
            .faction("13号罪人")
            .addPortrait(portrait_1)
            .color_bg(new Color(105, 53, 11))
            .build();
        
        MyCharacter character_2 = MyCharacter.getDefaultNarrator();
        
        CharacterVisual characterVisual = CharacterVisual.builder(character, portrait_1)
            .dim(false)
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
            .speed(6)
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
    
}