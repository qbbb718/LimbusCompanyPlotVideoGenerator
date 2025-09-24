package com.lbc_plot.DAO;

import org.jdbi.v3.sqlobject.customizer.Bind;
import org.jdbi.v3.sqlobject.customizer.BindBean;
import org.jdbi.v3.sqlobject.statement.SqlQuery;
import org.jdbi.v3.sqlobject.statement.SqlUpdate;
import org.jdbi.v3.sqlobject.statement.GetGeneratedKeys;
import org.jdbi.v3.sqlobject.transaction.Transaction;

import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;

import java.util.List;
import java.util.Optional;

public interface CharacterDAO {

    // ========== 角色基础CRUD ==========
    // 查询单个角色
    @SqlQuery("SELECT * FROM characters WHERE character_id = :id")
    Optional<MyCharacter> findById(@Bind("id") String characterId);

    // 查询所有角色
    @SqlQuery("SELECT * FROM characters ORDER BY character_name")
    List<MyCharacter> findAll();

    @SqlUpdate("""
        INSERT INTO characters 
        (character_id, character_name, height, color_bg, color_text, faction)
        VALUES (:characterID, :characterName, :height, :colorBg, :colorText, :faction)
        """)
    @GetGeneratedKeys("character_id")
    String save(@BindBean MyCharacter character);

    // 更新角色
    @SqlUpdate("""
        UPDATE characters SET 
        character_name = :characterName, 
        height = :height, 
        color_bg = :colorBg, 
        color_text = :colorText, 
        faction = :faction
        WHERE character_id = :characterID
        """)
    boolean update(@BindBean MyCharacter character);

    // 删除角色
    @SqlUpdate("DELETE FROM characters WHERE character_id = :id")
    boolean delete(@Bind("id") String characterId);



    // 按阵营查询
    @SqlQuery("SELECT * FROM characters WHERE faction = :faction ORDER BY character_name")
    List<MyCharacter> findByFaction(@Bind("faction") String faction);

    // 按名称模糊查询
    @SqlQuery("SELECT * FROM characters WHERE character_name LIKE '%' || :name || '%' ORDER BY character_name")
    List<MyCharacter> findByName(@Bind("name") String name);

    // 检查角色是否存在
    @SqlQuery("SELECT 1 FROM characters WHERE character_id = :id")
    boolean existsById(@Bind("id") String characterId);

    // 统计总数
    @SqlQuery("SELECT COUNT(*) FROM characters")
    int countAll();

    // 按阵营统计
    @SqlQuery("SELECT COUNT(*) FROM characters WHERE faction = :faction")
    int countByFaction(@Bind("faction") String faction);


    
    // ========== 立绘相关方法改造 ==========
    /**
     * 完整保存角色及其立绘（原子操作）
     * @param portraitDao 必须从外部传入，确保事务一致性
     */
    @Transaction
    default void saveWithPortraits(MyCharacter character, PortraitDAO portraitDao) {
        // 1. 保存角色基本信息
        String characterId = save(character);
        // 2. 保存立绘及关联（委托给PortraitDAO）
        portraitDao.saveCharacterPortraits(characterId, character.getPortraits());
    }

    /**
     * 删除角色及其所有立绘关联（原子操作）
     */
    @Transaction
    default boolean deleteWithPortraits(String characterId, PortraitDAO portraitDao) {
        portraitDao.deleteByCharacterId(characterId); // 先删关联
        return delete(characterId); // 再删角色
    }


}