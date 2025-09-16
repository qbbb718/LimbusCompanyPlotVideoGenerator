package com.lbc_plot.model.storage;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.lbc_plot.application.Composer.FrameComposerService;
import com.lbc_plot.application.Composer.RenderOfImage;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.util.TextureColorizer;
import com.lbc_plot.util.io.ImageReader;

/**
 * 角色类
 */
public class MyCharacter {
    // 唯一ID
    private String characterID;
    // 角色名
    private String characterName;
    // 角色身高，算坐标用的
    private int height;
    // 立绘们。第一位是默认立绘，没有就用这个
    private List<Portrait> portraits; //可能没有立绘（旁白）
    
    // 代表色和文字色
    private Color color_bg;
    private Color color_text;
    private BufferedImage color_Name_Image; //人设界面预览用，然后可以直接用到剧情渲染里
    private String faction; //阵营


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

    public Color getColor_bg() {
        return color_bg;
    }

    public void setColor_bg(Color color_bg) {
        this.color_bg = color_bg;
    }

    public Color getColor_text() {
        return color_text;
    }

    public void setColor_text(Color color_text) {
        this.color_text = color_text;
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



    public BufferedImage getColor_Name_Image() throws IOException  {
        if (color_Name_Image == null) {
            updateColor_Name_Image();
        }
        return color_Name_Image;
    }

    public void updateColor_Name_Image() throws IOException { // 生成名字+阵营完整UI
        color_Name_Image = RenderOfImage.renderCharaNameUI(this);
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
     * 私有构造函数 - 只能通过Builder创建
     */
    private MyCharacter(Builder builder) {
        this.characterID = builder.characterID;
        this.characterName = builder.characterName;
        this.height = builder.height;
        this.portraits = builder.portraits;
        this.color_bg = builder.color_bg;
        this.color_text = builder.color_text;
        this.color_Name_Image = builder.color_Name_Image;
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
        if (this.color_bg == null) {
            this.color_bg = DEFAULT_BG_COLOR;
        }
        
        // 文字色默认值
        if (this.color_text == null) {
            this.color_text = DEFAULT_TEXT_COLOR;
        }
        
        // 阵营默认值
        if (this.faction == null || this.faction.trim().isEmpty()) {
            this.faction = DEFAULT_FACTION;
        }
        
        //  portraits列表确保不为null
        if (this.portraits == null) {
            this.portraits = new ArrayList<>();
        }

        
    }


    /**
     * Builder静态内部类
     */
    public static class Builder {
        // Builder参数
        private String characterID = null;
        private String characterName;
        private int height = DEFAULT_HEIGHT;
        private List<Portrait> portraits = new ArrayList<>();
        private Color color_bg = DEFAULT_BG_COLOR;
        private Color color_text = DEFAULT_TEXT_COLOR;
        private BufferedImage color_Name_Image;
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
        
        public Builder color_bg(Color color_bg) {
            this.color_bg = color_bg;
            return this;
        }
        
        public Builder color_text(Color color_text) {
            this.color_text = color_text;
            return this;
        }
        
        public Builder color_Name_Image(BufferedImage color_Name_Image) {
            this.color_Name_Image = color_Name_Image;
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