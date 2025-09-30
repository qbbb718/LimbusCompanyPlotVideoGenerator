package com.lbc_plot.model.video;

import java.awt.Color;

import com.lbc_plot.model.storage.MyCharacter;

public class CharacterRef {
    private String characterID;
    private String characterName;
    private int height;
    private String faction;
    private String colorBg; // "R,G,B"
    private String colorText; // "R,G,B"
    
    // 从完整角色对象创建引用
    public static CharacterRef from(MyCharacter character) {
        CharacterRef ref = new CharacterRef();
        ref.setCharacterID(character.getCharacterID());s
        ref.setCharacterName(character.getCharacterName());
        ref.setHeight(character.getHeight());
        ref.setFaction(character.getFaction());
        ref.setColorBg(colorToString(character.getColor_bg()));
        ref.setColorText(colorToString(character.getColor_text()));
        return ref;
    }
    
    private static String colorToString(Color color) {
        return color.getRed() + "," + color.getGreen() + "," + color.getBlue();
    }
}