package com.lbc_plot.project;

import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.project.audio.AudioCommand;

public class TimelineController {
     //这个要改成project吗？
     //要加的话，就在这里加上数据引用，不过这里先不考虑
     //也许只在这里做对Record的操作吗？有多少操作量？
    List<Record> records = new ArrayList<>(); // 动态数组，自动扩容
    String uuid; //可能，导出视频的时候用


    
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


    void renderAll(){
        //临时audio列表
        List<AudioCommand> audioCommandsTemp = new ArrayList<>();
        Integer mixFrame; //视频导出后确认有多少帧

        // 先分别导出record的画面，再拼接，再渲染音频
        renderRecordsVedio();
        connectRecordsVedio();
        //renderAudio(audioCommandsTemp, mixFrame);
    }

    void renderRecordsVedio(){
        //将dirty的record重新渲染画面
        //导出后将isDirty重置为false
    }
    void connectRecordsVedio(){
        //将record的画面连接（希望没问题，应该）

    }

    void renderAudio(List<AudioCommand> audioCommandsTemp, Integer mixFrame){
        //渲染音频，整合到视频
        //每次导出都重新渲染

        //

        //要不要考虑音量统一
    }

}
