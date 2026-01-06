package com.lbc_plot.resource.dao;

import org.jdbi.v3.sqlobject.customizer.Bind;
import org.jdbi.v3.sqlobject.customizer.BindBean;
import org.jdbi.v3.sqlobject.statement.GetGeneratedKeys;
import org.jdbi.v3.sqlobject.statement.SqlQuery;
import org.jdbi.v3.sqlobject.statement.SqlUpdate;
import org.jdbi.v3.sqlobject.statement.UseRowMapper;
import org.jdbi.v3.sqlobject.transaction.Transaction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.resource.model.Emotion;
import com.lbc_plot.resource.model.Portrait;

import java.util.List;
import java.util.Optional;

public interface PortraitDAO {

    // ========== 基础 CRUD 操作 ==========
    @SqlQuery("SELECT * FROM portraits WHERE portrait_id = :id")
    @UseRowMapper(PortraitMapper.class)
    Optional<Portrait> findById(@Bind("id") String portraitId);

    @SqlQuery("SELECT * FROM portraits WHERE portrait_id = :id")
    @UseRowMapper(PortraitMapper.class)
    Portrait getById(@Bind("id") String portraitId);

    @SqlQuery("SELECT * FROM portraits ORDER BY port_name")
    @UseRowMapper(PortraitMapper.class)
    List<Portrait> findAll();

    @SqlUpdate("""
            INSERT INTO portraits (
                portrait_id, character_id, image_path, port_name,
                emotion, face_x, face_y, length, adj_x, adj_y, thumbnail_path
            ) VALUES (
                :portraitID, :characterID, :imagePath, :portName,
                :emotionName, :faceX, :faceY, :length, :adjX, :adjY, :thumbnailPath
            )
            """)
    void save(@BindBean Portrait portrait);

    @SqlUpdate("""
            UPDATE portraits SET
                character_id = :characterID,
                image_path = :imagePath,
                port_name = :portName,
                emotion = :emotionName,
                face_x = :faceX,
                face_y = :faceY,
                length = :length,
                adj_x = :adjX,
                adj_y = :adjY,
                thumbnail_path = :thumbnailPath
            WHERE portrait_id = :portraitID
            """)
    boolean update(@BindBean Portrait portrait);

    @SqlUpdate("DELETE FROM portraits WHERE portrait_id = :id")
    boolean delete(@Bind("id") String portraitId);

    // ========== API控制器所需的方法 ==========
    /**
     * 添加立绘（API控制器使用）
     */
    default void addPortrait(Portrait portrait) {
        save(portrait);
    }

    /**
     * 更新立绘（API控制器使用）
     */
    default void updatePortrait(Portrait portrait) {
        update(portrait);
    }

    /**
     * 删除立绘（API控制器使用）
     */
    default void deletePortrait(String portraitId) {
        delete(portraitId);
    }

    // ========== 查询操作 ==========
    @SqlQuery("SELECT * FROM portraits WHERE character_id = :characterId ORDER BY port_name")
    @UseRowMapper(PortraitMapper.class)
    List<Portrait> findByCharacterId(@Bind("characterId") String characterId);

    @SqlQuery("SELECT * FROM portraits WHERE port_name LIKE '%' || :name || '%' ORDER BY port_name")
    @UseRowMapper(PortraitMapper.class)
    List<Portrait> findByName(@Bind("name") String portName);

    @SqlQuery("SELECT * FROM portraits WHERE emotion = :emotion ORDER BY port_name")
    @UseRowMapper(PortraitMapper.class)
    List<Portrait> findByEmotion(@Bind("emotion") Emotion emotion);

    @SqlQuery("""
            SELECT * FROM portraits
            WHERE character_id = :characterId AND emotion = :emotion
            ORDER BY port_name
            """)
    @UseRowMapper(PortraitMapper.class)
    List<Portrait> findByCharacterAndEmotion(
            @Bind("characterId") String characterId,
            @Bind("emotion") Emotion emotion);

    // ========== 统计操作 ==========
    @SqlQuery("SELECT COUNT(*) FROM portraits")
    int countAll();

    @SqlQuery("SELECT COUNT(*) FROM portraits WHERE character_id = :characterId")
    int countByCharacterId(@Bind("characterId") String characterId);

    @SqlQuery("SELECT COUNT(*) FROM portraits WHERE emotion = :emotion")
    int countByEmotion(@Bind("emotion") Emotion emotion);

    // ========== 存在性检查 ==========
    @SqlQuery("SELECT EXISTS(SELECT 1 FROM portraits WHERE portrait_id = :id)")
    boolean existsById(@Bind("id") String portraitId);

    @SqlQuery("SELECT 1 FROM portraits WHERE character_id = :characterId AND port_name = :name")
    boolean existsByCharacterAndName(
            @Bind("characterId") String characterId,
            @Bind("name") String portName);

    // ========== 批量操作 ==========
    @Transaction
    default boolean saveAll(List<Portrait> portraits) {
        portraits.forEach(this::save);
        return true;
    }

    @SqlUpdate("DELETE FROM portraits WHERE character_id = :characterId")
    boolean deleteByCharacterId(@Bind("characterId") String characterId);

    // ========== 特殊操作 ==========
    @SqlUpdate("UPDATE portraits SET thumbnail_path = :path WHERE portrait_id = :id")
    boolean updateThumbnailPath(
            @Bind("id") String portraitId,
            @Bind("path") String thumbnailPath);

    @SqlQuery("""
            SELECT * FROM portraits
            WHERE character_id = :characterId
            ORDER BY
                CASE WHEN emotion = 'NORMAL' THEN 1
                     WHEN emotion = 'HAPPY' THEN 2
                     ELSE 3 END,
                port_name
            LIMIT 1
            """)
    @UseRowMapper(PortraitMapper.class)
    Optional<Portrait> findDefaultPortraitByCharacter(@Bind("characterId") String characterId);

    @SqlQuery("SELECT * FROM portraits WHERE thumbnail_path IS NOT NULL ORDER BY port_name")
    @UseRowMapper(PortraitMapper.class)
    List<Portrait> findPortraitsWithThumbnails();

    // 新增：保存角色-立绘关联关系
    @SqlUpdate("""
            INSERT INTO character_portraits
            (character_id, portrait_id, is_default, display_order)
            VALUES (:characterId, :portraitId, :isDefault, :order)
            """)
    void saveCharacterPortrait(
            @Bind("characterId") String characterId,
            @Bind("portraitId") String portraitId,
            @Bind("isDefault") boolean isDefault,
            @Bind("order") int order);

    /**
     * 批量保存角色-立绘关联关系
     * 
     * @param characterId 角色ID
     * @param portraits   立绘列表（第一个立绘将设为默认）
     */
    @Transaction
    default void saveCharacterPortraits(String characterId, List<Portrait> portraits) {
        for (int i = 0; i < portraits.size(); i++) {
            saveCharacterPortrait(
                    characterId,
                    portraits.get(i).getPortraitID(),
                    i == 0, // 第一个立绘是默认
                    i // 顺序
            );
        }
    }

    /**
     * 删除角色的所有立绘关联关系
     * 
     * @param characterId 角色ID
     */
    @SqlUpdate("DELETE FROM character_portraits WHERE character_id = :characterId")
    void deleteCharacterPortraits(@Bind("characterId") String characterId);

    /**
     * 设置默认立绘
     * 
     * @param characterId 角色ID
     * @param portraitId  立绘ID
     */
    @SqlUpdate("UPDATE character_portraits SET is_default = 1 WHERE character_id = :characterId AND portrait_id = :portraitId")
    void setDefaultPortrait(
            @Bind("characterId") String characterId,
            @Bind("portraitId") String portraitId);
}