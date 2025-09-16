package com.lbc_plot.application.service;

import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.List;

/**
 * 角色业务服务接口
 */
public interface CharacterService {
    
    // 角色管理
    MyCharacter createCharacter(String name, int height, String faction);
    MyCharacter getCharacter(String characterId);
    List<MyCharacter> getAllCharacters();
    boolean updateCharacter(MyCharacter character);
    boolean deleteCharacter(String characterId);
    
    // 业务功能
    BufferedImage generateNameCardImage(String characterId) throws IOException;
    boolean assignPortraitToCharacter(String characterId, String portraitId);
    boolean deletePortraitFromCharacter(String characterId, String portraitId);
    
    // 查询功能
    boolean isCharacterExist(String characterId);
    int getTotalCharacterCount();

    Portrait getDefaultPortrait(MyCharacter character);
    Portrait getPortraitById(MyCharacter character, String portraitId);

    List<MyCharacter> searchCharactersByName(String name);
    List<MyCharacter> getCharactersByFaction(String faction);
    int getCharacterCountByFaction(String faction);
    List<MyCharacter> createCharacters(List<MyCharacter> characters);

    // 立绘相关
    Portrait findPortraitByName(String characterId, String portraitName);
    Portrait findPortraitByEmotion(String characterId, String emotion);
    List<Portrait> getCharacterPortraits(String characterId);
}