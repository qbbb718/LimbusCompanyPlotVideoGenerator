package helpers;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.sqlobject.SqlObjectPlugin;

import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.CharacterMapper;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.application.service.CharacterService;
import com.lbc_plot.application.service.impl.CharacterServiceImpl;
import com.lbc_plot.model.storage.Background;
import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.model.video.BackgroundVisual;
import com.lbc_plot.model.video.CharacterRef;
import com.lbc_plot.model.video.CharacterVisual;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.project.audio.model.AudioCommand;
import com.lbc_plot.project.audio.model.AudioCommandType;

import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.model.video.BackgroundVisual;
import com.lbc_plot.model.video.CharacterRef;
import com.lbc_plot.model.video.CharacterVisual;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.model.video.Dialogue.Align;
import com.lbc_plot.util.io.ImageExporter;
import com.lbc_plot.util.json.RecordsIO;

import helpers.RecordsCreater;
import helpers.SQLiteTestDatabaseManager;

import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.CharacterMapper;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.application.Composer.BatchVideoProcessor;
import com.lbc_plot.application.Composer.FrameComposerService;
import com.lbc_plot.application.Composer.RenderOfImage;
import com.lbc_plot.application.service.CharacterService;
import com.lbc_plot.application.service.impl.CharacterServiceImpl;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.model.Record;
import com.lbc_plot.model.storage.Background;
import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;

import org.junit.jupiter.api.BeforeEach;
import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.sqlobject.SqlObjectPlugin;
import org.junit.jupiter.api.AfterEach;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class RecordsCreater {
    private static final Logger logger = LoggerFactory.getLogger(RecordsCreater.class);

    private static CharacterDAO characterDao;
    private static PortraitDAO portraitDao;
    private static SQLiteTestDatabaseManager dbManager;
    

    // 创建一个超级测试类
    public static List<Record> creatSupersTestRecord() throws IOException{
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
        

        // TODO 创建一个音频

        AudioCommand audioCommand1, audioCommand2, audioCommand3;
        audioCommand1 = new AudioCommand(
            AudioCommandType.BGM_START ,
            "BusInside (online-audio-converter.com)"
        );
        audioCommand2 = new AudioCommand(
            AudioCommandType.BGM_STOP ,
            "BusInside (online-audio-converter.com)"
        );
        audioCommand3 = new AudioCommand(
            AudioCommandType.VOICE_PLAY ,
            "台词切片"
        );


        // 组合5条records
        logger.info("组装最终record对象...");
        Record record_1, record_2, record_3, record_4, record_5;

        record_1 = new Record.Builder()
            .uuid(ID_1)
            .dialogue(dialogue_1)
            .addBackground(backgroundVisual)
            .addCharacter(characterVisual_1)
            .addAudioCommand(audioCommand1)
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
            .addAudioCommand(audioCommand3)
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