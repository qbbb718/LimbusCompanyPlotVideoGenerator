package com.lbc_plot.render.video;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.List;

import com.lbc_plot.common.util.json.ColorDeserializer;
import com.lbc_plot.common.util.json.ColorSerializer;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.render.engine.RenderOfImage;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

import java.awt.Color;

@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CharacterRef {
    private String characterID;
    private String characterName;
    private int height;
    private String faction; // 阵营
    @JsonSerialize(using = ColorSerializer.class)
    @JsonDeserialize(using = ColorDeserializer.class)
    private Color colorBg;
    @JsonSerialize(using = ColorSerializer.class)
    @JsonDeserialize(using = ColorDeserializer.class)
    private Color colorText;
    @JsonIgnore
    private BufferedImage colorNameImage; // 人设界面预览用，然后可以直接用到剧情渲染里

    // 必须提供无参构造器给Jackson
    public CharacterRef() {
    }

    // 全参数构造器
    public CharacterRef(String characterID, String characterName, int height,
            String faction, Color colorBg, Color colorText) {
        this.characterID = characterID;
        this.characterName = characterName;
        this.height = height;
        this.faction = faction;
        this.colorBg = colorBg;
        this.colorText = colorText;
    }

    /**
     * 获取默认旁白实例
     */
    private static final CharacterRef DEFAULT_NARRATOR = createDefaultNarrator();

    @JsonIgnore
    public static CharacterRef getDefaultNarrator() {
        return DEFAULT_NARRATOR;
    }

    private static CharacterRef createDefaultNarrator() {
        return new CharacterRef(
                ProjectConfig.NARRATION_ID, // "narrator"
                "旁白",
                0, // 旁白不需要身高
                "无阵营",
                ProjectConfig.DEFAULT_BG_COLOR, // 默认白色背景
                ProjectConfig.DEFAULT_TEXT_COLOR // 默认黑色文字
        );
    }

    @JsonIgnore
    public boolean isNarrator() {
        return ProjectConfig.NARRATION_ID.equals(this.characterID);
    }

    // Getter和Setter必须成对存在
    public String getCharacterID() {
        return characterID;
    }

    public void setCharacterID(String characterID) {
        this.characterID = characterID;
    }

    public String getCharacterName() {
        return characterName;
    }

    public void setCharacterName(String characterName) {
        this.characterName = characterName;
    }

    public int getHeight() {
        return height;
    }

    public void setHeight(int height) {
        this.height = height;
    }

    public String getFaction() {
        return faction;
    }

    public void setFaction(String faction) {
        this.faction = faction;
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

    @JsonIgnore
    public BufferedImage getColorNameImage() throws IOException {
        if (colorNameImage == null) {
            updateColorNameImage();
        }
        return colorNameImage;
    }

    @JsonIgnore
    public void updateColorNameImage() throws IOException { // 生成名字+阵营完整UI
        colorNameImage = RenderOfImage.renderCharaNameUI(this);
    }

    // 从完整角色对象创建引用
    public static CharacterRef from(MyCharacter character) throws IOException {
        if (character == null)
            return null;

        return new CharacterRef(
                character.getCharacterID(),
                character.getCharacterName(),
                character.getHeight(),
                character.getFaction(),
                character.getColorBg(),
                character.getColorText());
    }

}