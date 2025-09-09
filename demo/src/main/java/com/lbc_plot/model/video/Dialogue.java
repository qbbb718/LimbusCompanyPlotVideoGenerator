package com.lbc_plot.model.video;

import java.util.ArrayList;
import java.util.List;

import com.lbc_plot.core.ProjectConfig;
import com.lbc_plot.model.repository.MyCharacter;

/**
 * 对话内容类
 */
public class Dialogue {
    // 常量定义
    public static final String DEFAULT_NARRATOR = "旁白";
    public static final String DEFAULT_TEXT = "...";
    public static final String DEFAULT_LOCATION = "default";
    public static final String DEFAULT_FACTION = "中立";
    
    // 枚举类型
    public enum Align {
        LEFT, CENTER
    }
    
    public enum Emotion {
        NORMAL, HAPPY, ANGRY, SAD, SURPRISED, CONFUSED, NERVOUS
    }
    
    // 成员变量
    private String text;          // 具体文本
    private String location;         // 场景地点
    private List<MyCharacter> speakerC; // 说话人列表
    private String speakerName;       // 说话人名字
    private String faction;          // 所属阵营
    private Align align;          // 对齐方式
    private int speed;            // 文字显示速度的修改值
    private Emotion emotion;      // 情绪
    
    
    
    // TODO
    //
    
    // Getter 和 Setter 方法
    public String getText() {
        return text;
    }
    
    public void setText(String text) {
        this.text = (text == null || text.trim().isEmpty()) ? DEFAULT_TEXT : text.trim();
    }
    
    public String getLocation() {
        return location;
    }
    
    public void setLocation(String location) {
        this.location = (location == null || location.trim().isEmpty()) ? DEFAULT_LOCATION : location.trim();
    }
    
    public List<MyCharacter> getSpeakerC() {
        return new ArrayList<>(speakerC);
    }
    
    public void setSpeakerC(List<MyCharacter> speakerC) {
        this.speakerC = (speakerC == null) ? new ArrayList<>() : new ArrayList<>(speakerC);
        // 旁白强制单人说话
        if (this.speakerName.equals(DEFAULT_NARRATOR) && this.speakerC.size() > 1) {
            this.speakerC = List.of(this.speakerC.get(0));
        }
    }
    
    public void addSpeaker(MyCharacter character) {
        if (character != null) {
            // 旁白只能有一个说话人
            if (this.speakerName.equals(DEFAULT_NARRATOR) && !this.speakerC.isEmpty()) {
                return;
            }
            this.speakerC.add(character);
        }
    }
    
    public String getSpeakerName() {
        return speakerName;
    }
    
    public void setSpeakerName(String speaker) {
        this.speakerName = (speaker == null || speaker.trim().isEmpty()) ? 
                      (this.speakerC.isEmpty() ? DEFAULT_NARRATOR : this.speakerC.get(0).getCharacterName()) : 
                      speaker.trim();
        // 如果设置为旁白，调整对齐方式
        if (this.speakerName.equals(DEFAULT_NARRATOR)) {
            this.align = Align.CENTER;
            // 旁白强制单人说话
            if (this.speakerC.size() > 1) {
                this.speakerC = List.of(this.speakerC.get(0));
            }
        }
    }
    
    public String getFaction() {
        return faction;
    }
    
    public void setFaction(String faction) {
        this.faction = (faction == null || faction.trim().isEmpty()) ? 
                   (this.speakerC.isEmpty() ? DEFAULT_FACTION : this.speakerC.get(0).getFaction()) : 
                   faction.trim();
    }
    
    public Align getAlign() {
        return align;
    }
    
    public void setAlign(Align align) {
        this.align = (align == null) ? 
                    (this.speakerName.equals(DEFAULT_NARRATOR) ? Align.CENTER : Align.LEFT) : 
                    align;
    }
    
    public int getSpeed() {
        return speed;
    }
    
    public void setSpeed(int speed) {
        this.speed = speed;
    }
    
    public Emotion getEmotion() {
        return emotion;
    }
    
    public void setEmotion(Emotion emotion) {
        this.emotion = (emotion == null) ? Emotion.NORMAL : emotion;
    }



    
    /**
     * NLP分析情绪 - 简单实现
     */
    public Emotion emotionNLP() {
        if (text == null || text.isEmpty()) {
            return Emotion.NORMAL;
        }
        
        String lowerText = text.toLowerCase();
        
        if (lowerText.contains("开心") || lowerText.contains("高兴") || 
            lowerText.contains("哈哈") || lowerText.contains("嘻嘻")) {
            return Emotion.HAPPY;
        } else if (lowerText.contains("生气") || lowerText.contains("愤怒") || 
                  lowerText.contains("可恶") || lowerText.contains("混蛋")) {
            return Emotion.ANGRY;
        } else if (lowerText.contains("悲伤") || lowerText.contains("难过") || 
                  lowerText.contains("哭泣") || lowerText.contains("眼泪")) {
            return Emotion.SAD;
        } else if (lowerText.contains("惊讶") || lowerText.contains("吃惊") || 
                  lowerText.contains("什么") || lowerText.contains("！")) {
            return Emotion.SURPRISED;
        } else if (lowerText.contains("困惑") || lowerText.contains("疑惑") || 
                  lowerText.contains("为什么") || lowerText.contains("？")) {
            return Emotion.CONFUSED;
        } else if (lowerText.contains("紧张") || lowerText.contains("害怕") || 
                  lowerText.contains("担心")) {
            return Emotion.NERVOUS;
        }
        
        return Emotion.NORMAL;
    }
    
    /**
     * 渲染到画面 - 文字自动换行
     */
    public void apply() {
        // 这里调用你之前写的文字渲染方法
        try {
            // 假设你有一个渲染器实例
            // textRenderer.addTextLayer(this.text, this.getSpeakerCharacter());
            
            // 或者使用你之前写的 addTextLayer 方法
            // addTextLayer(this.text, this.getSpeakerCharacter());
            
            System.out.println("渲染对话: " + this);
            
        } catch (Exception e) {
            System.err.println("渲染对话失败: " + e.getMessage());
        }
    }
    
    /**
     * 获取主要的说话人角色（第一个）
     */
    public MyCharacter getSpeakerCharacter() {
        if (speakerC != null && !speakerC.isEmpty()) {
            return speakerC.get(0);
        }
        return null; // 或者返回一个默认的旁白角色
    }
    
    /**
     * 判断是否为旁白
     */
    public boolean isNarrator() {
        return DEFAULT_NARRATOR.equals(speakerName);
    }
    
    @Override
    public String toString() {
        return String.format("Dialogue{location='%s', speaker='%s', text='%s', emotion=%s}", 
                           location, speakerName, text, emotion);
    }
    





    
    /**
     * 私有构造函数 - 只能通过Builder创建
     */
    private Dialogue(Builder builder) {
        // 应用Builder的参数
        this.text = builder.text;
        this.location = builder.location;
        this.speakerC = builder.speakerC;
        this.speakerName = builder.speakerName;
        this.faction = builder.faction;
        this.align = builder.align;
        this.speed = builder.speed;
        this.emotion = builder.emotion;
        
        // 应用智能默认值逻辑
        applySmartDefaults();
    }
    
    /**
     * 应用智能默认值逻辑
     */
    private void applySmartDefaults() {
        // 文本和地点默认值
        this.text = (text == null || text.trim().isEmpty()) ? DEFAULT_TEXT : text.trim();
        this.location = (location == null || location.trim().isEmpty()) ? DEFAULT_LOCATION : location.trim();
        
        // 说话人列表默认值
        this.speakerC = (speakerC == null) ? new ArrayList<>() : new ArrayList<>(speakerC);
        
        // 说话人名字智能设置
        if (speakerName == null || speakerName.trim().isEmpty()) {
            this.speakerName = this.speakerC.isEmpty() ? DEFAULT_NARRATOR : this.speakerC.get(0).getCharacterName();
        } else {
            this.speakerName = speakerName.trim();
        }
        
        // 阵营智能设置
        if (faction == null || faction.trim().isEmpty()) {
            this.faction = this.speakerC.isEmpty() ? DEFAULT_FACTION : this.speakerC.get(0).getFaction();
        } else {
            this.faction = faction.trim();
        }
        
        // 对齐方式智能设置
        if (align == null) {
            this.align = this.speakerName.equals(DEFAULT_NARRATOR) ? Align.CENTER : Align.LEFT;
        }
        
        // 情绪默认值
        if (emotion == null) {
            this.emotion = Emotion.NORMAL;
        }
        
        // 旁白强制单人说话
        if (this.speakerName.equals(DEFAULT_NARRATOR) && this.speakerC.size() > 1) {
            this.speakerC = List.of(this.speakerC.get(0)); // 只保留第一个
        }
    }

    /**
     * Builder静态内部类
     */
    public static class Builder {
        // Builder中的参数（与Dialogue类对应）
        private String text;
        private String location;
        private List<MyCharacter> speakerC;
        private String speakerName;
        private String faction;
        private Align align = Align.LEFT; //默认左对齐
        private int speed;
        private Emotion emotion;
        
        /**
         * Builder构造函数
         */
        public Builder() {
            // 可以设置一些默认值
            this.speed = ProjectConfig.DEFAULT_DIALOGUE_SPEED;
            this.emotion = Emotion.NORMAL;
        }
        
        // 链式设置方法
        public Builder text(String text) {
            this.text = text;
            return this;
        }
        
        public Builder location(String location) {
            this.location = location;
            return this;
        }
        
        public Builder speakerC(List<MyCharacter> speakerC) {
            this.speakerC = speakerC;
            return this;
        }
        
        public Builder addSpeaker(MyCharacter speaker) {
            if (this.speakerC == null) {
                this.speakerC = new ArrayList<>();
            }
            this.speakerC.add(speaker);

            // 读取speaker信息
            this.speakerName = speaker.getCharacterName();
            this.faction = speaker.getFaction();
            return this;
        }
        
        public Builder speakerName(String speakerName) {
            this.speakerName = speakerName;
            return this;
        }
        
        public Builder faction(String faction) {
            this.faction = faction;
            return this;
        }
        
        public Builder align(Align align) {
            this.align = align;
            return this;
        }
        
        public Builder speed(int speed) {
            this.speed = speed;
            return this;
        }
        
        public Builder emotion(Emotion emotion) {
            this.emotion = emotion;
            return this;
        }
        
        /**
         * 构建Dialogue对象
         */
        public Dialogue build() {
            return new Dialogue(this);
        }
    }
    
    /**
     * 静态工厂方法创建Builder
     */
    public static Builder builder() {
        return new Builder();
    }
    

    // 基本使用 - 超级清晰！
    // Dialogue dialogue1 = Dialogue.builder()
    //     .text("你好，世界！")
    //     .location("会议室")
    //     .speakerName("张三")
    //     .faction("技术部")
    //     .align(Align.LEFT)
    //     .speed(6)
    //     .emotion(Emotion.HAPPY)
    //     .build();

}