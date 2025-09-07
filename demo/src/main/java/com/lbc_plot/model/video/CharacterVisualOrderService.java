package com.lbc_plot.model.video;

import java.util.Collections;
import java.util.List;

/**
 * 角色立绘顺序管理服务
 */
public class CharacterVisualOrderService {
    
    /**
     * 将指定索引的角色立绘上移
     */
    public static boolean moveCharacterUp(List<CharacterVisual> chars, int index) {
        if (chars == null || index <= 0 || index >= chars.size()) {
            return false;
        }
        Collections.swap(chars, index, index - 1);
        return true;
    }
    
    /**
     * 将指定索引的角色立绘下移
     */
    public static boolean moveCharacterDown(List<CharacterVisual> chars, int index) {
        if (chars == null || index < 0 || index >= chars.size() - 1) {
            return false;
        }
        Collections.swap(chars, index, index + 1);
        return true;
    }
    
    /**
     * 根据角色ID查找并移动
     */
    public static boolean moveCharacterUpById(List<CharacterVisual> chars, String characterId) {
        int index = findCharacterIndexById(chars, characterId);
        return index != -1 && moveCharacterUp(chars, index);
    }
    
    public static boolean moveCharacterDownById(List<CharacterVisual> chars, String characterId) {
        int index = findCharacterIndexById(chars, characterId);
        return index != -1 && moveCharacterDown(chars, index);
    }
    
    /**
     * 移动到最顶层/最底层
     */
    public static boolean moveCharacterToTop(List<CharacterVisual> chars, String characterId) {
        int index = findCharacterIndexById(chars, characterId);
        if (index == -1 || index == chars.size() - 1) return false;
        
        CharacterVisual character = chars.remove(index);
        chars.add(character);
        return true;
    }
    
    public static boolean moveCharacterToBottom(List<CharacterVisual> chars, String characterId) {
        int index = findCharacterIndexById(chars, characterId);
        if (index == -1 || index == 0) return false;
        
        CharacterVisual character = chars.remove(index);
        chars.add(0, character);
        return true;
    }
    
    /**
     * 工具方法：根据ID查找索引
     */
    private static int findCharacterIndexById(List<CharacterVisual> chars, String characterId) {
        if (chars == null || characterId == null) return -1;
        
        for (int i = 0; i < chars.size(); i++) {
            CharacterVisual cv = chars.get(i);
            if (cv != null && characterId.equals(cv.getCharacterId())) {
                return i;
            }
        }
        return -1;
    }
    
    /**
     * 获取渲染顺序描述
     */
    public static String getRenderOrderDescription(List<CharacterVisual> chars) {
        if (chars == null || chars.isEmpty()) return "Empty character list";
        
        StringBuilder sb = new StringBuilder("渲染顺序（从底层到顶层）:\n");
        for (int i = 0; i < chars.size(); i++) {
            CharacterVisual cv = chars.get(i);
            String characterId = (cv != null) ? cv.getCharacterId() : "null";
            sb.append(i).append(": ").append(characterId).append("\n");
        }
        return sb.toString();
    }
}