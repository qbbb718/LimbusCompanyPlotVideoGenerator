package com.lbc_plot.project;

import java.util.List;

import com.lbc_plot.project.audio.AudioCommand;

public class Record {
    private String uuid;                     // 避免修改顺序破坏dirty
    private int durationFrames;         // 持续时间（帧数）
    private Dialogue dialogue;          // 文本对话内容
    private Camera camera;              // 摄像机信息
    private List<BackgroundVisual> bg;  // 背景视觉元素（一般只有一个，但预留多个的可能性）
    private List<CharacterVisual> chars; // 角色立绘列表（通常不超过10个，注意渲染顺序）
    private List<EffectVisual> effects;  // 特效列表
    private List<AudioCommand> audioCommands; // 音频操作列表（BGM、音效、语音等，通常不超过10种）
    //语音要用来计算长度，所以要和BGM啥的分开看……或者看操作
    // 音频操作里，start（单次播放），loop（BGM持续播放），stop（BGM停止）
    private boolean isDirty; //在上次导出后是否进行过修改，用来做多次导出的加速

    void calculateDuration(){
        if()
    }
    //文本apply虽然也是画面的一部分，但这个的逻辑应该可以单拆出来写……虽然ui可能和静态一起渲染能提效率，但那都是以后的事了吧
}
