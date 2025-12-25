package com.lbc_plot.DAO;

import com.lbc_plot.model.storage.Background;
import org.jdbi.v3.sqlobject.customizer.Bind;
import org.jdbi.v3.sqlobject.customizer.BindBean;
import org.jdbi.v3.sqlobject.statement.SqlQuery;
import org.jdbi.v3.sqlobject.statement.SqlUpdate;
import org.jdbi.v3.sqlobject.statement.UseRowMapper;
import org.jdbi.v3.sqlobject.transaction.Transaction;
import java.util.List;
import java.util.Optional;

public interface BackgroundDAO {

    @SqlQuery("SELECT * FROM backgrounds WHERE background_id = :id")
    @UseRowMapper(BackgroundMapper.class)
    Optional<Background> findById(@Bind("id") String id);
    
    @SqlQuery("SELECT * FROM backgrounds WHERE background_id = :id")
    @UseRowMapper(BackgroundMapper.class)
    Background getById(@Bind("id") String id);

    @SqlQuery("SELECT * FROM backgrounds ORDER BY display_name")
    @UseRowMapper(BackgroundMapper.class)
    List<Background> findAll();

    @SqlQuery("SELECT * FROM backgrounds WHERE image_path = :path LIMIT 1")
    @UseRowMapper(BackgroundMapper.class)
    Optional<Background> findByPath(@Bind("path") String imagePath);

    @SqlUpdate("INSERT INTO backgrounds (background_id, image_path, display_name, source, thumbnail_path) VALUES (:backgroundID, :imagePath, :displayName, :source, :thumbnailPath)")
    void save(@BindBean Background bg);

    @SqlUpdate("UPDATE backgrounds SET image_path = :imagePath, display_name = :displayName, source = :source, thumbnail_path = :thumbnailPath WHERE background_id = :backgroundID")
    boolean update(@BindBean Background bg);

    // 使用显式绑定的更新方法，作为备用方案
    @SqlUpdate("UPDATE backgrounds SET image_path = :path, display_name = :name, source = :source, thumbnail_path = :thumbnailPath WHERE background_id = :uuid")
    boolean updateWithExplicitBinding(@Bind("uuid") String uuid, 
                                     @Bind("path") String path, 
                                     @Bind("name") String name, 
                                     @Bind("source") String source, 
                                     @Bind("thumbnailPath") String thumbnailPath);

    // 添加一个简单的测试方法，用于验证SQL语句是否正确
    @SqlUpdate("UPDATE backgrounds SET image_path = :path WHERE background_id = :uuid")
    boolean updateSimple(@Bind("uuid") String uuid, @Bind("path") String path);

    @SqlUpdate("DELETE FROM backgrounds WHERE background_id = :id")
    boolean delete(@Bind("id") String id);
    
    // ========== API控制器所需的方法 ==========
    /**
     * 获取所有背景（API控制器使用）
     */
    default List<Background> getAllBackgrounds() {
        return findAll();
    }
    
    /**
     * 添加背景（API控制器使用）
     */
    default void addBackground(Background background) {
        save(background);
    }
    
    /**
     * 更新背景（API控制器使用）
     */
    default boolean updateBackground(Background background) {
        return update(background);
    }
    
    /**
     * 删除背景（API控制器使用）
     */
    default void deleteBackground(String id) {
        delete(id);
    }

    @SqlQuery("SELECT COUNT(*) FROM backgrounds")
    int countAll();

    @Transaction
    default Background findOrCreateByPath(String path, String displayName, String source) {
        Optional<Background> exist = findByPath(path);
        if (exist.isPresent()) return exist.get();

        // Try to find by suffix match: allow scripts that reference only the filename
        // to match DB entries that store a longer path (e.g. assets/backgrounds/xxx.png)
        List<Background> all = findAll();
        for (Background b : all) {
            try {
                String img = b.getImagePath();
                if (img != null && img.endsWith(path)) {
                    return b;
                }
            } catch (Exception ignore) {}
        }

        Background bg = new Background(path, displayName);
        save(bg);
        return bg;
    }
}
