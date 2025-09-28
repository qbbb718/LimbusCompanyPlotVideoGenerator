package com.lbc_plot.application.service.impl;



import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.application.Composer.RenderOfImage;
import com.lbc_plot.application.service.CharacterService;
import com.lbc_plot.config.ProjectConfig;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 角色业务服务实现
 */
public class CharacterServiceImpl implements CharacterService {
    private final CharacterDAO characterDAO;
    private final PortraitDAO portraitDAO;
    
    public CharacterServiceImpl(CharacterDAO characterDAO, PortraitDAO portraitDAO) {
        this.characterDAO = characterDAO;
        this.portraitDAO = portraitDAO;
    }
    
    /**
     * 创建Character并存入数据库
     * @param name 角色名称
     * @param height 角色身高
     * @param faction 角色阵营
     * @return 创建的角色ID（由应用生成）
     */
    @Override
    public String createCharacter(String name, int height, String faction) {
        // 生成角色ID（使用UUID或其他ID生成策略）
        String characterId = UUID.randomUUID().toString();
        
        // 创建角色对象（显式设置ID）
        MyCharacter character = MyCharacter.builder()
            .characterID(characterId)  // 显式设置ID
            .characterName(name)
            .height(height)
            .color_bg(ProjectConfig.DEFAULT_BG_COLOR)  // 设置默认背景色
            .color_text(ProjectConfig.DEFAULT_TEXT_COLOR)  // 设置默认文字色
            .faction(faction)
            .build();
        
        // 保存到数据库
        try {
            characterDAO.save(character);
            return characterId;  // 返回应用生成的ID
        } catch (Exception e) {
            throw new RuntimeException("创建角色失败: " + name, e);
        }
    }
    
    /**
     * 根据ID获得角色
     */
    @Override
    public MyCharacter getCharacter(String characterId) {
        return characterDAO.findById(characterId)
            .orElseThrow(() -> new RuntimeException("角色不存在: " + characterId));
    }
    
    /**
     * 获取所有角色
     */
    @Override
    public List<MyCharacter> getAllCharacters() {
        return characterDAO.findAll();
    }
    
    /**
     * 更新角色信息
     */
    @Override
    public boolean updateCharacter(MyCharacter character) {
        if (character.getCharacterID() == null) {
            throw new IllegalArgumentException("角色ID不能为空");
        }
        return characterDAO.update(character);
    }
    
    /**
     * 删除角色
     */
    @Override
    public boolean deleteCharacter(String characterId) {
        if (!characterDAO.existsById(characterId)) {
            throw new RuntimeException("角色不存在: " + characterId);
        }
        return characterDAO.delete(characterId);
    }
    
    /**
     * 生成名称卡片图像
     */
    @Override
    public BufferedImage generateNameCardImage(String characterId) throws IOException {
        MyCharacter character = getCharacter(characterId);
        return RenderOfImage.renderCharaNameUI(character);
    }
    
    /**
     * 分配立绘给角色
     */
    @Override
    public boolean assignPortraitToCharacter(String characterId, String portraitId) {
        MyCharacter character = getCharacter(characterId);
        
        // TODO:
        // 这里需要PortraitService的支持
        // 假设PortraitService提供getPortrait方法
        // Portrait portrait = portraitService.getPortrait(portraitId);
        
        // 将立绘添加到角色
        // character.addPortrait(portrait);
        
        // 更新角色信息
        return updateCharacter(character);
    }
    
    /**
     * 从角色移除立绘
     */
    @Override
    public boolean deletePortraitFromCharacter(String characterId, String portraitId) {
        MyCharacter character = getCharacter(characterId);
        
        // 从角色立绘列表中移除指定立绘
        List<Portrait> portraits = character.getPortraits();
        if (portraits != null) {
            portraits.removeIf(portrait -> portrait.getPortraitID().equals(portraitId));
        }
        
        // 更新角色信息
        return updateCharacter(character);
    }
    
    /**
     * 检查角色是否存在
     */
    @Override
    public boolean isCharacterExist(String characterId) {
        return characterDAO.existsById(characterId);
    }
    
    /**
     * 获取角色总数
     */
    @Override
    public int getTotalCharacterCount() {
        return characterDAO.countAll();
    }
    
    
    /**
     * 获取默认立绘（第一位立绘）
     * @return 默认立绘，如果列表为空则返回null
     */
    public Portrait getDefaultPortrait(MyCharacter character) {
        List<Portrait> portraits = character.getPortraits();
        if (portraits == null || portraits.isEmpty()) {
            return null;
        }
        return portraits.get(0);
    }

    /**
     * 根据立绘ID获取立绘
     * @param portraitId 立绘ID
     * @return 对应的立绘，如果找不到则返回默认立绘
     */
    public Portrait getPortraitById(MyCharacter character, String portraitId) {
        List<Portrait> portraits = character.getPortraits();
        if (portraits == null) {
            return getDefaultPortrait(character);
        }
        
        for (Portrait portrait : portraits) {
            if (portrait.getPortraitID().equals(portraitId)) {
                return portrait;
            }
        }
        
        return getDefaultPortrait(character);
    }
    
    /**
     * 根据名称搜索角色
     */
    public List<MyCharacter> searchCharactersByName(String name) {
        return characterDAO.findByName(name);
    }
    
    /**
     * 根据阵营获取角色
     */
    public List<MyCharacter> getCharactersByFaction(String faction) {
        return characterDAO.findByFaction(faction);
    }
    
    /**
     * 获取阵营角色数量
     */
    public int getCharacterCountByFaction(String faction) {
        return characterDAO.countByFaction(faction);
    }
    
    /**
     * 验证角色数据
     */
    private void validateCharacter(MyCharacter character) {
        if (character.getCharacterName() == null || character.getCharacterName().trim().isEmpty()) {
            throw new IllegalArgumentException("角色名不能为空");
        }
        if (character.getHeight() <= 0) {
            throw new IllegalArgumentException("角色身高必须大于0");
        }
    }
    
    /**
     * 批量创建角色
     */
    public List<MyCharacter> createCharacters(List<MyCharacter> characters) {
        for (MyCharacter character : characters) {
            validateCharacter(character);
        }
        
        // 这里需要DAO支持批量操作
        // 暂时逐个保存
        for (MyCharacter character : characters) {
            characterDAO.save(character);
        }
        
        return characters;
    }


    /**
     * 在角色中根据名称查找立绘
     * 推荐：放在CharacterService中
     */
    @Override
    public Portrait findPortraitByName(String characterId, String portraitName) {
        // 1. 先获取角色（验证角色存在）
        MyCharacter character = getCharacter(characterId);
        
        // 2. 从角色中查找立绘
        return character.getPortraits().stream()
            .filter(portrait -> portraitName.equals(portrait.getPortName()))
            .findFirst()
            .orElseThrow(() -> new RuntimeException(
                "角色 " + character.getCharacterName() + " 没有找到立绘: " + portraitName));
    }
    
    /**
     * 在角色中根据情绪查找立绘
     */
    @Override
    public Portrait findPortraitByEmotion(String characterId, String emotion) {
        MyCharacter character = getCharacter(characterId);
        
        return character.getPortraits().stream()
            .filter(portrait -> emotion.equals(portrait.getEmotion()))
            .findFirst()
            .orElseGet(() -> getDefaultPortrait(character)); // 找不到返回默认立绘
    }
    
    /**
     * 获取角色的所有立绘
     */
    @Override
    public List<Portrait> getCharacterPortraits(String characterId) {
        MyCharacter character = getCharacter(characterId);
        return new ArrayList<>(character.getPortraits()); // 返回副本
    }
}