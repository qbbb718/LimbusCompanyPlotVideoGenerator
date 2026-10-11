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
    /**
     * 查询角色的立绘列表。
     *
     * 默认立绘（character_portraits.is_default = 1）排在最前，其余按名称排序。
     * 这样 portraits[0] 既保持历史约定的"默认立绘"，又不会因为立绘改名而改变默认项；
     * 同时把 is_default 读进 Portrait.defaultPortrait，供前端显示"默认立绘"标记。
     */
    @SqlQuery("""
            SELECT p.*, COALESCE(cp.is_default, 0) AS is_default
            FROM portraits p
            LEFT JOIN character_portraits cp
                ON cp.portrait_id = p.portrait_id AND cp.character_id = p.character_id
            WHERE p.character_id = :characterId
            ORDER BY COALESCE(cp.is_default, 0) DESC, p.port_name
            """)
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

    @SqlUpdate("UPDATE portraits SET image_path = :path WHERE portrait_id = :id")
    boolean updateImagePath(
            @Bind("id") String portraitId,
            @Bind("path") String imagePath);

    /**
     * 批量替换角色立绘的 image_path 前缀（用于角色重命名时同步更新路径）
     *
     * @param characterId 角色ID
     * @param oldPrefix   旧前缀（如 "geligaoer/"）
     * @param newPrefix   新前缀（如 "luojia/"）
     * @return 受影响的行数
     */
    @SqlUpdate("""
            UPDATE portraits SET image_path = REPLACE(image_path, :oldPrefix, :newPrefix)
            WHERE character_id = :characterId AND image_path LIKE :oldPrefixLike
            """)
    int batchReplaceImagePathPrefix(
            @Bind("characterId") String characterId,
            @Bind("oldPrefix") String oldPrefix,
            @Bind("newPrefix") String newPrefix,
            @Bind("oldPrefixLike") String oldPrefixLike);

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
     * 批量保存角色-立绘关联关系。
     *
     * is_default 的取值优先级：
     * 1. 入参中立绘自带的 defaultPortrait（前端"设为默认立绘"后保存时传回）；
     * 2. 数据库中已有的默认立绘（保持用户此前的选择，避免保存角色时被重置）；
     * 3. 都不存在时取列表第一个（兼容首次创建角色的场景）。
     *
     * 之前的实现无条件把第一个立绘设为默认，导致用户每次点击"保存"都会把默认立绘
     * 改回列表首项。
     *
     * @param characterId 角色ID
     * @param portraits   立绘列表
     */
    @Transaction
    default void saveCharacterPortraits(String characterId, List<Portrait> portraits) {
        saveCharacterPortraits(characterId, portraits, findDefaultPortraitId(characterId));
    }

    /**
     * 批量保存角色-立绘关联关系，并显式指定重建前需要保留的默认立绘。
     *
     * 调用方如果先执行了 deleteCharacterPortraits（例如 CharacterController 更新角色时
     * 重建关联关系），必须先把原默认立绘ID查出来通过 preservedDefaultId 传进来，
     * 否则默认标记已随关联记录一起被删除，只能退回列表首项。
     *
     * @param characterId         角色ID
     * @param portraits           立绘列表
     * @param preservedDefaultId  重建前该角色的默认立绘ID，可为 null
     */
    @Transaction
    default void saveCharacterPortraits(String characterId, List<Portrait> portraits,
            String preservedDefaultId) {
        if (portraits == null || portraits.isEmpty()) {
            return;
        }

        String defaultPortraitId = null;
        for (Portrait portrait : portraits) {
            if (portrait.isDefaultPortrait()) {
                defaultPortraitId = portrait.getPortraitID();
                break;
            }
        }

        if (defaultPortraitId == null) {
            // 入参没带默认标记时，沿用传入的（或数据库里已有的）默认立绘
            defaultPortraitId = preservedDefaultId;
        }

        for (int i = 0; i < portraits.size(); i++) {
            Portrait portrait = portraits.get(i);
            boolean isDefault = defaultPortraitId != null
                    ? defaultPortraitId.equals(portrait.getPortraitID())
                    : i == 0; // 没有任何依据时退回第一个立绘
            saveCharacterPortrait(characterId, portrait.getPortraitID(), isDefault, i);
        }
    }

    /**
     * 查询角色当前默认立绘的ID。
     *
     * 说明：按 (is_default, display_order, created_time) 排序取第一条，
     * 这样即使历史数据里存在多个默认标记（旧实现的遗留），也能稳定取到一个。
     *
     * @return 默认立绘ID，没有关联记录时返回 null
     */
    @SqlQuery("""
            SELECT portrait_id FROM character_portraits
            WHERE character_id = :characterId
            ORDER BY is_default DESC, display_order, created_time
            LIMIT 1
            """)
    String findDefaultPortraitId(@Bind("characterId") String characterId);

    /**
     * 删除角色的所有立绘关联关系
     * 
     * @param characterId 角色ID
     */
    @SqlUpdate("DELETE FROM character_portraits WHERE character_id = :characterId")
    void deleteCharacterPortraits(@Bind("characterId") String characterId);

    /**
     * 设置默认立绘（同一角色下保证只有一个默认）。
     *
     * 之前只执行 UPDATE ... SET is_default = 1，旧的默认立绘仍保留 is_default = 1，
     * 于是读取时按名称排序可能又取回旧立绘。这里先清空该角色的所有默认标记再设置新的。
     *
     * @param characterId 角色ID
     * @param portraitId  立绘ID
     */
    @Transaction
    default void setDefaultPortrait(String characterId, String portraitId) {
        clearDefaultPortraits(characterId);
        markPortraitAsDefault(characterId, portraitId);
    }

    /**
     * 清空角色所有立绘的默认标记
     */
    @SqlUpdate("UPDATE character_portraits SET is_default = 0 WHERE character_id = :characterId")
    void clearDefaultPortraits(@Bind("characterId") String characterId);

    /**
     * 把指定立绘标记为默认
     */
    @SqlUpdate("""
            UPDATE character_portraits SET is_default = 1
            WHERE character_id = :characterId AND portrait_id = :portraitId
            """)
    int markPortraitAsDefault(
            @Bind("characterId") String characterId,
            @Bind("portraitId") String portraitId);

    /**
     * 新增角色-立绘关联（若不存在，用于"设置默认立绘"时关联记录缺失的兜底）。
     */
    @SqlUpdate("""
            INSERT OR IGNORE INTO character_portraits
            (character_id, portrait_id, is_default, display_order)
            VALUES (:characterId, :portraitId, 0,
                COALESCE((SELECT MAX(display_order) + 1 FROM character_portraits
                          WHERE character_id = :characterId), 0))
            """)
    void ensureCharacterPortrait(
            @Bind("characterId") String characterId,
            @Bind("portraitId") String portraitId);
}