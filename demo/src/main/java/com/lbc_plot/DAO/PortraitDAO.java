package com.lbc_plot.DAO;

import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.model.storage.Emotion;

import java.util.List;
import java.util.Optional;

/**
 * 立绘数据访问接口
 */
public interface PortraitDAO {
    
    // 基本CRUD操作
    Optional<Portrait> findById(String portraitId);
    List<Portrait> findAll();
    Portrait save(Portrait portrait);
    boolean update(Portrait portrait);
    boolean delete(String portraitId);
    
    // 特定查询
    List<Portrait> findByCharacterId(String characterId);
    List<Portrait> findByName(String portName);
    List<Portrait> findByEmotion(Emotion emotion);
    List<Portrait> findByCharacterAndEmotion(String characterId, Emotion emotion);
    
    // 统计
    int countAll();
    int countByCharacterId(String characterId);
    int countByEmotion(Emotion emotion);
    
    // 存在性检查
    boolean existsById(String portraitId);
    boolean existsByCharacterAndName(String characterId, String portName);
    
    // 批量操作
    boolean saveAll(List<Portrait> portraits);
    boolean deleteByCharacterId(String characterId);
    boolean updateThumbnailPath(String portraitId, String thumbnailPath);
    
    // 特殊查询
    Optional<Portrait> findDefaultPortraitByCharacter(String characterId);
    List<Portrait> findPortraitsWithThumbnails();

    // 原有方法
    
}