package com.lbc_plot.application;

import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.application.Composer.BatchVideoProcessor;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.model.Record;
import com.lbc_plot.model.video.BackgroundVisual;
import com.lbc_plot.project.audio.AudioCommand;
import com.lbc_plot.util.io.ImageReader;

import java.awt.image.BufferedImage;
import java.io.IOException;


/**
 * 时间轴面板
 */
public class TimelineController {

     //这个要改成project吗？
     //要加的话，就在这里加上数据引用，不过这里先不考虑
     //也许只在这里做对Record的操作吗？有多少操作量？
    List<Record> records = new ArrayList<>(); // 动态数组，自动扩容
    String uuid; //可能，导出视频的时候用？如果这里做project的话
    Boolean plot; //1-剧情 0-人格剧情
    BufferedImage ui,border;//根据剧情/人格剧情渲染UI,提前导入边框避免读取
    int width, height;


    
    void loadRecords(){
        //加载一个project的内容？
        //我们先导，先不考虑保存的话……
    }
    
    

    // record的操作？
    // 末尾增加，中间插入，中间删除，移动顺序（这个先不做）
    void addRecord(){

    }

    void insertRecord(){

    }

    void deleteRecord(){

    }
    


    void renderAll() throws Exception{
        //临时audio列表
        List<AudioCommand> audioCommandsTemp = new ArrayList<>();
        Integer mixFrame; //视频导出后确认有多少帧

        
        // 先分别导出record的画面，再拼接，再渲染音频

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


        // render.connectRecordsVedio();
        //renderAudio(audioCommandsTemp, mixFrame);
    }

    

    

}
