package com.lbc_plot.DAO;

import com.lbc_plot.model.storage.MyCharacter;
import java.util.List;
import java.util.Optional;

/**
 * 角色数据访问接口
 */
public interface CharacterDAO {
    
    // 增删改查基本操作
    Optional<MyCharacter> findById(String characterId);
    List<MyCharacter> findAll();
    boolean save(MyCharacter character);
    boolean update(MyCharacter character);
    boolean delete(String characterId);
    
    // 特定查询
    List<MyCharacter> findByFaction(String faction);
    List<MyCharacter> findByName(String name);
    boolean existsById(String characterId);
    
    // 统计
    int countAll();
    int countByFaction(String faction);
}