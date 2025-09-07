

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
import com.lbc_plot.service.Render;
import com.lbc_plot.service.Composer.FrameComposerService;
import com.lbc_plot.util.ImageExporter;
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
        Record record = creatTestRecord();
        //BufferedImage pre = Render.renderUI(true, record.getDialogue());
        BufferedImage pre = Render.renderPre(record, true, ProjectConfig.VIDEO_WIDTH, ProjectConfig.VIDEO_HEIGHT);
        ImageExporter.exportImage(pre, "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/test3.png");
        
    }

    // 创建一个测试类
    public Record creatTestRecord() throws IOException{
        // 使用建造者模式（推荐）
        
        // 加载角色
        Portrait portrait = Portrait.builder("Gregor-default.png")
            .build();
        //ImageExporter.exportImage(portrait.getImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_chara.png");

        MyCharacter character = MyCharacter.builder()
            .characterName("张三")
            .height(168)
            .faction("正义联盟")
            .addPortrait(portrait)
            .build();
        
        CharacterVisual characterVisual = CharacterVisual.builder(character, portrait)
            .dim(false)
            .build();
        //ImageExporter.exportImage(characterVisual.getImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_charaV.png");


        // 加载背景
        Background background = new Background("test_bg.png");
        //ImageExporter.exportImage(background.getImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_bg.png");

        BackgroundVisual backgroundVisual = new BackgroundVisual(background);
        //ImageExporter.exportImage(backgroundVisual.getBgImage(), "E:/LimbusCompanyPlotVideoGenerator/demo/target/test-logs/load_bgV.png");

        // 组合对话
        Dialogue dialogue = Dialogue.builder()
            .text("啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊")
            .location("会议室")
            .addSpeaker(character)
            .align(Align.LEFT)
            .speed(6)
            .build();
        
        // 组合record
        Record record = new Record.Builder()
            .dialogue(dialogue)
            .addBackground(backgroundVisual)
            .addCharacter(characterVisual)
            .build();

        return record;
    }
    
}