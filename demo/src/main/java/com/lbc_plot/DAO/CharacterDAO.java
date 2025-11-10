package com.lbc_plot.DAO;

import org.jdbi.v3.sqlobject.customizer.Bind;
import org.jdbi.v3.sqlobject.customizer.BindBean;
import org.jdbi.v3.sqlobject.statement.SqlQuery;
import org.jdbi.v3.sqlobject.statement.SqlUpdate;
import org.jdbi.v3.sqlobject.statement.GetGeneratedKeys;
import org.jdbi.v3.sqlobject.statement.SqlBatch;
import org.jdbi.v3.sqlobject.transaction.Transaction;
import org.jdbi.v3.core.mapper.RowMappers;

import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.util.ColorUtils;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

public interface CharacterDAO {

    // ========== 角色基础CRUD ==========
    // 查询单个角色
    @SqlQuery("SELECT * FROM characters WHERE character_id = :id")
    Optional<MyCharacter> findById(@Bind("id") String characterId);

    // 查询所有角色
    @SqlQuery("SELECT * FROM characters ORDER BY character_name")
    List<MyCharacter> findAll();

    // 保存单个角色
    @SqlUpdate("""
        INSERT INTO characters 
        (character_id, character_name, height, color_bg, color_text, faction)
        VALUES (:characterID, :characterName, :height, :colorBgStr, :colorTextStr, :faction)
        """)
    void save(@BindBean MyCharacter character,
             @Bind("colorBgStr") String colorBgStr,
             @Bind("colorTextStr") String colorTextStr);
    
    default void save(MyCharacter character) {
        save(character, 
            ColorUtils.colorToString(character.getColorBg()),
            ColorUtils.colorToString(character.getColorText()));
    }

    /**
     * 批量保存角色
     */
    @SqlBatch("""
        INSERT INTO characters 
        (character_id, character_name, height, color_bg, color_text, faction)
        VALUES (:characterID, :characterName, :height, :colorBgStr, :colorTextStr, :faction)
        """)
    void saveAll(@BindBean List<MyCharacter> characters,
                @Bind("colorBgStr") List<String> colorBgStrs,
                @Bind("colorTextStr") List<String> colorTextStrs);
    
    default void saveAll(List<MyCharacter> characters) {
        List<String> bgStrs = characters.stream()
            .map(c -> ColorUtils.colorToString(c.getColorBg()))
            .collect(Collectors.toList());
        
        List<String> textStrs = characters.stream()
            .map(c -> ColorUtils.colorToString(c.getColorText()))
            .collect(Collectors.toList());
        
        saveAll(characters, bgStrs, textStrs);
    }

    // 更新角色
    @SqlUpdate("""
        UPDATE characters SET 
        character_name = :characterName, 
        height = :height, 
        color_bg = :colorBgStr, 
        color_text = :colorTextStr, 
        faction = :faction
        WHERE character_id = :characterID
        """)
    boolean update(@BindBean MyCharacter character,
                 @Bind("colorBgStr") String colorBgStr,
                 @Bind("colorTextStr") String colorTextStr);
    
    default boolean update(MyCharacter character) {
        return update(character,
                    ColorUtils.colorToString(character.getColorBg()),
                    ColorUtils.colorToString(character.getColorText()));
    }

    // 删除角色
    @SqlUpdate("DELETE FROM characters WHERE character_id = :id")
    boolean delete(@Bind("id") String characterId);
    
    // 更新角色名片图片路径
    @SqlUpdate("UPDATE characters SET character_card_image_path = :cardImagePath WHERE character_id = :characterId")
    boolean updateCardImagePath(@Bind("characterId") String characterId, @Bind("cardImagePath") String cardImagePath);
    
    // ========== API控制器所需的方法 ==========
    /**
     * 获取所有角色（API控制器使用）
     */
    default List<MyCharacter> getAllCharacters() {
        return findAll();
    }
    
    /**
     * 添加角色（API控制器使用）
     */
    default void addCharacter(MyCharacter character) {
        save(character);
    }
    
    /**
     * 更新角色（API控制器使用）
     */
    default void updateCharacter(MyCharacter character) {
        update(character);
    }
    
    /**
     * 删除角色（API控制器使用）
     */
    default void deleteCharacter(String id, boolean deleteFiles) {
        delete(id);
        // 如果deleteFiles为true，删除相关文件
        if (deleteFiles) {
            // 删除角色目录
            java.io.File characterDir = new java.io.File("resources/characters/" + id);
            if (characterDir.exists()) {
                deleteDirectory(characterDir);
            }
        }
    }

    /**
     * 递归删除目录及其内容
     */
    default void deleteDirectory(java.io.File directory) {
        if (!directory.exists()) {
            return;
        }

        java.io.File[] files = directory.listFiles();
        if (files != null) {
            for (java.io.File file : files) {
                if (file.isDirectory()) {
                    deleteDirectory(file);
                } else {
                    file.delete();
                }
            }
        }
        directory.delete();
    }




    // 按阵营查询
    @SqlQuery("SELECT * FROM characters WHERE faction = :faction ORDER BY character_name")
    List<MyCharacter> findByFaction(@Bind("faction") String faction);

    // 按名称模糊查询
    @SqlQuery("SELECT * FROM characters WHERE character_name LIKE '%' || :name || '%' ORDER BY character_name")
    List<MyCharacter> findByName(@Bind("name") String name);

    // 检查角色是否存在
    @SqlQuery("SELECT COUNT(1) > 0 FROM characters WHERE character_id = :id")
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
        save(character);
        String characterId = character.getCharacterID();
        // 2. 保存立绘及关联（委托给PortraitDAO）
        portraitDao.saveAll(character.getPortraits());
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