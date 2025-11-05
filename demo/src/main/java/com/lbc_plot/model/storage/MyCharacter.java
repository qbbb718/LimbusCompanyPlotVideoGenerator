package com.lbc_plot.model.storage;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.core.Composer.FrameComposerService;
import com.lbc_plot.core.Composer.RenderOfImage;
import com.lbc_plot.model.video.CharacterRef;
import com.lbc_plot.util.TextureColorizer;
import com.lbc_plot.util.io.ImageReader;
import com.lbc_plot.util.json.ColorDeserializer;
import com.lbc_plot.util.json.ColorSerializer;

/**
 * 角色类
 */
public class MyCharacter {
    private String characterID;
    private String characterName;
    private int height;
    private String faction; //阵营
    private List<Portrait> portraits; //可能没有立绘（旁白）
    private List<String> tags; //角色标签
    @JsonSerialize(using = ColorSerializer.class)
    @JsonDeserialize(using = ColorDeserializer.class)
    private Color colorBg;
    @JsonSerialize(using = ColorSerializer.class)
    @JsonDeserialize(using = ColorDeserializer.class)
    private Color colorText;
    @JsonIgnore
    private BufferedImage colorNameImage; //人设界面预览用，然后可以直接用到剧情渲染里


    // 默认值
    private static final String DEFAULT_NAME = "路人";
    private static final int DEFAULT_HEIGHT = 171;
    private static final Color DEFAULT_BG_COLOR = ProjectConfig.DEFAULT_BG_COLOR;
    private static final Color DEFAULT_TEXT_COLOR = ProjectConfig.DEFAULT_TEXT_COLOR;
    private static final String DEFAULT_FACTION = "无阵营";
    

    // 静态常量 - 旁白实例
    private static final MyCharacter DEFAULT_NARRATOR = createDefaultNarrator();

    /**
     * 获取默认旁白实例
     */
    public static MyCharacter getDefaultNarrator() {
        return DEFAULT_NARRATOR;
    }
    
    /**
     * 创建默认旁白
     */
    private static MyCharacter createDefaultNarrator() {
        return MyCharacter.builder()
            .characterID(ProjectConfig.NARRATION_ID)
            .characterName("旁白")
            .build();
    }
    
    /**
     * 判断是否为旁白
     */
    public boolean isNarrator() {
        return ProjectConfig.NARRATION_ID.equals(this.characterID);
    }


    // Getter和Setter方法
    public String getCharacterID() {
        return characterID;
    }

    public void setCharacterID(String characterID) {
        this.characterID = characterID;
    }

    public void setNewCharacterID() {
        this.characterID = UUID.randomUUID().toString();
    }

    public String getCharacterName() {
        return characterName;
    }

    public void setCharacterName(String characterName) {
        this.characterName = characterName;
    }

    public Color getColorBg() {
        return colorBg;
    }

    public void setColorBg(Color colorBg) {
        this.colorBg = colorBg;
    }

    public Color getColorText() {
        return colorText;
    }

    public void setColorText(Color colorText) {
        this.colorText = colorText;
    }

    public int getHeight() {
        return height;
    }

    public void setHeight(int height) {
        this.height = height;
    }

    public List<Portrait> getPortraits() {
        return portraits;
    }

    public void setPortraits(List<Portrait> portraits) {
        this.portraits = portraits;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }



    public BufferedImage getColorNameImage() throws IOException  {
        if (colorNameImage == null) {
            updateColorNameImage();
        }
        return colorNameImage;
    }

    public void updateColorNameImage() throws IOException { // 生成名字+阵营完整UI
        CharacterRef ref = CharacterRef.from(this);
        colorNameImage = RenderOfImage.renderCharaNameUI(ref);
    }



    public String getFaction(){
        return faction;
    }

    public void setFaction(String faction){
        this.faction = faction;
    }


    @Override
    public String toString() {
        return "Character{" +
                "characterID='" + characterID + '\'' +
                ", characterName='" + characterName + '\'' +
                ", height=" + height +
                ", portraitsCount=" + (portraits != null ? portraits.size() : 0) +
                '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        MyCharacter character = (MyCharacter) o;
        return characterID.equals(character.characterID);
    }

    @Override
    public int hashCode() {
        return characterID.hashCode();
    }


    /**
     * 默认构造函数 - 用于JSON反序列化
     */
    @JsonCreator
    public MyCharacter() {
        // 应用智能默认值
        applySmartDefaults();
    }
    
    /**
     * 私有构造函数 - 只能通过Builder创建
     */
    private MyCharacter(Builder builder) {
        this.characterID = builder.characterID;
        this.characterName = builder.characterName;
        this.height = builder.height;
        this.portraits = builder.portraits;
        this.colorBg = builder.colorBg;
        this.colorText = builder.colorText;
        this.colorNameImage = builder.colorNameImage;
        this.faction = builder.faction;
        
        // 应用智能默认值
        applySmartDefaults();
    }
    
    /**
     * 应用智能默认值逻辑
     */
    private void applySmartDefaults() {
        // 身高默认值
        if (this.height <= 0) {
            this.height = DEFAULT_HEIGHT;
        }
        
        // 背景色默认值
        if (this.colorBg == null) {
            this.colorBg = DEFAULT_BG_COLOR;
        }
        
        // 文字色默认值
        if (this.colorText == null) {
            this.colorText = DEFAULT_TEXT_COLOR;
        }
        
        // 阵营默认值
        if (this.faction == null || this.faction.trim().isEmpty()) {
            this.faction = DEFAULT_FACTION;
        }
        
        //  portraits列表确保不为null
        if (this.portraits == null) {
            this.portraits = new ArrayList<>();
        }

        // tags列表确保不为null
        if (this.tags == null) {
            this.tags = new ArrayList<>();
        }

        
    }


    /**
     * Builder静态内部类
     */
    public static class Builder {
        // Builder参数
        private String characterID = null;
        private String characterName = DEFAULT_NAME;
        private int height = DEFAULT_HEIGHT;
        private List<Portrait> portraits = new ArrayList<>();
        private List<String> tags = new ArrayList<>();
        private Color colorBg = DEFAULT_BG_COLOR;
        private Color colorText = DEFAULT_TEXT_COLOR;
        @JsonIgnore
        private BufferedImage colorNameImage;
        private String faction = DEFAULT_FACTION;

        /**
         * 必需参数构造函数
         */
        public Builder() {
        }
        
        // 链式设置方法
        public Builder characterID(String characterID) {
            this.characterID = characterID;
            return this;
        }

        // 生成UUID
        public Builder characterID() {
            this.characterID = UUID.randomUUID().toString();
            return this;
        }
        
        public Builder characterName(String characterName) {
            this.characterName = characterName;
            return this;
        }
        
        public Builder height(int height) {
            this.height = height;
            return this;
        }
        
        public Builder portraits(List<Portrait> portraits) {
            this.portraits = portraits;
            return this;
        }
        
        public Builder addPortrait(Portrait portrait) {
            if (this.portraits == null) {
                this.portraits = new ArrayList<>();
            }
            this.portraits.add(portrait);
            return this;
        }

        public Builder tags(List<String> tags) {
            this.tags = tags;
            return this;
        }

        public Builder addTag(String tag) {
            if (this.tags == null) {
                this.tags = new ArrayList<>();
            }
            this.tags.add(tag);
            return this;
        }
        
        public Builder colorBg(Color colorBg) {
            this.colorBg = colorBg;
            return this;
        }
        
        public Builder colorText(Color colorText) {
            this.colorText = colorText;
            return this;
        }
        
        public Builder colorNameImage(BufferedImage colorNameImage) {
            this.colorNameImage = colorNameImage;
            return this;
        }
        
        public Builder faction(String faction) {
            this.faction = faction;
            return this;
        }
        
        /**
         * 构建MyCharacter对象
         */
        public MyCharacter build() {
            return new MyCharacter(this);
        }
    }
    
    /**
     * 静态工厂方法创建Builder
     */
    public static Builder builder() {
        return new Builder();
    }

}