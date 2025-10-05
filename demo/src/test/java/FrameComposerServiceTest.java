import org.junit.jupiter.api.Test;

import java.util.List;

import com.lbc_plot.model.video.BackgroundVisual;
import com.lbc_plot.model.video.CharacterRef;
import com.lbc_plot.model.video.CharacterVisual;
import com.lbc_plot.model.video.Dialogue;
import com.lbc_plot.model.video.Dialogue.Align;
import com.lbc_plot.util.io.ImageExporter;
import com.lbc_plot.util.json.RecordsIO;

import helpers.RecordsCreater;
import com.lbc_plot.application.Composer.BatchVideoProcessor;
import com.lbc_plot.application.Composer.FrameComposerService;
import com.lbc_plot.application.Composer.RenderOfImage;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.model.Record;
import com.lbc_plot.model.storage.Background;
import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
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
    void testRenderOfRecords() throws IOException {
        try {
            // 你的Record列表
            List<Record> records = RecordsCreater.creatSupersTestRecord();


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


    
}