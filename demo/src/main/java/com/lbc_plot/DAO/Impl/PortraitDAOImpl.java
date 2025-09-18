package com.lbc_plot.DAO.Impl;

import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.model.storage.Emotion;
import com.lbc_plot.util.ColorUtils;
import com.lbc_plot.util.db.SQLiteDatabaseManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import javax.imageio.ImageIO;

/**
 * SQLite立绘数据访问实现
 */
public class PortraitDAOImpl implements PortraitDAO {
    
    private static final Logger logger = LoggerFactory.getLogger(PortraitDAOImpl.class);
    
    private final Connection connection;
    
    /**
     * 默认构造函数 - 使用默认数据库连接
     */
    public PortraitDAOImpl() {
        this(SQLiteDatabaseManager.getConnection());
        logger.debug("使用默认数据库连接创建PortraitDAOImpl实例");
    }
    
    /**
     * 构造函数注入 - 可以传入自定义连接（用于测试）
     * @param connection 数据库连接
     */
    public PortraitDAOImpl(Connection connection) {
        this.connection = connection;
        logger.debug("使用自定义连接创建PortraitDAOImpl实例");
    }
    
    @Override
    public Optional<Portrait> findById(String portraitId) {
        logger.debug("根据ID查询立绘: {}", portraitId);
        String sql = "SELECT * FROM portraits WHERE portrait_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, portraitId);
            ResultSet rs = pstmt.executeQuery();
            
            if (rs.next()) {
                Portrait portrait = mapResultSetToPortrait(rs);
                logger.debug("找到立绘: {}", portraitId);
                return Optional.of(portrait);
            } else {
                logger.debug("未找到立绘: {}", portraitId);
                return Optional.empty();
            }
        } catch (SQLException e) {
            logger.error("查询立绘失败: {}", portraitId, e);
            throw new RuntimeException("查询立绘失败: " + portraitId, e);
        }
    }
    
    @Override
    public List<Portrait> findAll() {
        logger.debug("查询所有立绘");
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits ORDER BY port_name";
        
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
            logger.debug("找到 {} 个立绘", portraits.size());
        } catch (SQLException e) {
            logger.error("查询所有立绘失败", e);
            throw new RuntimeException("查询所有立绘失败", e);
        }
        return portraits;
    }
    
    @Override
    public Portrait save(Portrait portrait) {
        // 在方法开头添加详细日志，输出立绘对象信息
        logger.debug("尝试保存立绘详细信息: {}", portrait.toString()); // 使用 toString() 输出所有字段
        // 或者使用 logger.debug("尝试保存立绘详细信息: {}", portrait); // 这样也会自动调用 toString()

        String sql = """
            INSERT INTO portraits (portrait_id, character_id, image_path, port_name, 
                                emotion, face_x, face_y, length, adj_x, adj_y, thumbnail_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            setPortraitParameters(pstmt, portrait);
            int affectedRows = pstmt.executeUpdate();
            
            if (affectedRows > 0) {
                logger.info("成功保存立绘: {}", portrait.getPortraitID());
                return portrait;
            }
            logger.error("保存立绘失败，受影响行数为0: {}", portrait.getPortraitID());
            throw new RuntimeException("保存立绘失败");
            
        } catch (SQLException e) {
            logger.error("保存立绘失败: {}", portrait.getPortraitID(), e);
            throw new RuntimeException("保存立绘失败: " + portrait.getPortraitID(), e);
        }
    }
    
    @Override
    public boolean update(Portrait portrait) {
        logger.debug("更新立绘: {}", portrait.getPortraitID());
        String sql = """
            UPDATE portraits 
            SET character_id = ?, image_path = ?, port_name = ?, emotion = ?, 
                face_x = ?, face_y = ?, length = ?, adj_x = ?, adj_y = ?, thumbnail_path = ?
            WHERE portrait_id = ?
            """;
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, portrait.getCharacterID());
            pstmt.setString(2, portrait.getImagePath());
            pstmt.setString(3, portrait.getPortName());
            pstmt.setString(4, portrait.getEmotion().name());
            pstmt.setInt(5, portrait.getFaceX());
            pstmt.setInt(6, portrait.getFaceY());
            pstmt.setInt(7, portrait.getLength());
            pstmt.setInt(8, portrait.getAdjX());
            pstmt.setInt(9, portrait.getAdjY());
            pstmt.setString(10, portrait.getThumbnailPath());
            pstmt.setString(11, portrait.getPortraitID());
            
            int affectedRows = pstmt.executeUpdate();
            boolean success = affectedRows > 0;
            if (success) {
                logger.info("成功更新立绘: {}", portrait.getPortraitID());
            } else {
                logger.warn("更新立绘未影响任何行: {}", portrait.getPortraitID());
            }
            return success;
        } catch (SQLException e) {
            logger.error("更新立绘失败: {}", portrait.getPortraitID(), e);
            throw new RuntimeException("更新立绘失败: " + portrait.getPortraitID(), e);
        }
    }
    
    @Override
    public boolean delete(String portraitId) {
        logger.debug("删除立绘: {}", portraitId);
        String sql = "DELETE FROM portraits WHERE portrait_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, portraitId);
            int affectedRows = pstmt.executeUpdate();
            boolean success = affectedRows > 0;
            if (success) {
                logger.info("成功删除立绘: {}", portraitId);
            } else {
                logger.warn("删除立绘未影响任何行: {}", portraitId);
            }
            return success;
        } catch (SQLException e) {
            logger.error("删除立绘失败: {}", portraitId, e);
            throw new RuntimeException("删除立绘失败: " + portraitId, e);
        }
    }
    
    @Override
    public List<Portrait> findByCharacterId(String characterId) {
        logger.debug("按角色ID查询立绘: {}", characterId);
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits WHERE character_id = ? ORDER BY port_name";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            ResultSet rs = pstmt.executeQuery();
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
            logger.debug("为角色 {} 找到 {} 个立绘", characterId, portraits.size());
        } catch (SQLException e) {
            logger.error("按角色查询立绘失败: {}", characterId, e);
            throw new RuntimeException("按角色查询立绘失败: " + characterId, e);
        }
        return portraits;
    }
    
    @Override
    public List<Portrait> findByName(String portName) {
        logger.debug("按名称查询立绘: {}", portName);
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits WHERE port_name LIKE ? ORDER BY port_name";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, "%" + portName + "%");
            ResultSet rs = pstmt.executeQuery();
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
            logger.debug("按名称 '{}' 找到 {} 个立绘", portName, portraits.size());
        } catch (SQLException e) {
            logger.error("按名称查询立绘失败: {}", portName, e);
            throw new RuntimeException("按名称查询立绘失败: " + portName, e);
        }
        return portraits;
    }
    
    @Override
    public List<Portrait> findByEmotion(Emotion emotion) {
        logger.debug("按情绪查询立绘: {}", emotion);
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits WHERE emotion = ? ORDER BY port_name";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, emotion.name());
            ResultSet rs = pstmt.executeQuery();
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
            logger.debug("按情绪 {} 找到 {} 个立绘", emotion, portraits.size());
        } catch (SQLException e) {
            logger.error("按情绪查询立绘失败: {}", emotion, e);
            throw new RuntimeException("按情绪查询立绘失败: " + emotion, e);
        }
        return portraits;
    }
    
    @Override
    public List<Portrait> findByCharacterAndEmotion(String characterId, Emotion emotion) {
        logger.debug("按角色和情绪查询立绘: {}, {}", characterId, emotion);
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits WHERE character_id = ? AND emotion = ? ORDER BY port_name";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            pstmt.setString(2, emotion.name());
            ResultSet rs = pstmt.executeQuery();
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
            logger.debug("按角色 {} 和情绪 {} 找到 {} 个立绘", characterId, emotion, portraits.size());
        } catch (SQLException e) {
            logger.error("按角色和情绪查询立绘失败: {}, {}", characterId, emotion, e);
            throw new RuntimeException("按角色和情绪查询立绘失败: " + characterId + ", " + emotion, e);
        }
        return portraits;
    }
    
    @Override
    public int countAll() {
        logger.debug("统计所有立绘数量");
        String sql = "SELECT COUNT(*) FROM portraits";
        
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            int count = rs.next() ? rs.getInt(1) : 0;
            logger.debug("总立绘数量: {}", count);
            return count;
        } catch (SQLException e) {
            logger.error("统计立绘数量失败", e);
            throw new RuntimeException("统计立绘数量失败", e);
        }
    }
    
    @Override
    public int countByCharacterId(String characterId) {
        logger.debug("按角色统计立绘数量: {}", characterId);
        String sql = "SELECT COUNT(*) FROM portraits WHERE character_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            ResultSet rs = pstmt.executeQuery();
            int count = rs.next() ? rs.getInt(1) : 0;
            logger.debug("角色 {} 的立绘数量: {}", characterId, count);
            return count;
        } catch (SQLException e) {
            logger.error("按角色统计立绘数量失败: {}", characterId, e);
            throw new RuntimeException("按角色统计立绘数量失败: " + characterId, e);
        }
    }
    
    @Override
    public int countByEmotion(Emotion emotion) {
        logger.debug("按情绪统计立绘数量: {}", emotion);
        String sql = "SELECT COUNT(*) FROM portraits WHERE emotion = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, emotion.name());
            ResultSet rs = pstmt.executeQuery();
            int count = rs.next() ? rs.getInt(1) : 0;
            logger.debug("情绪 {} 的立绘数量: {}", emotion, count);
            return count;
        } catch (SQLException e) {
            logger.error("按情绪统计立绘数量失败: {}", emotion, e);
            throw new RuntimeException("按情绪统计立绘数量失败: " + emotion, e);
        }
    }
    
    @Override
    public boolean existsById(String portraitId) {
        logger.debug("检查立绘是否存在: {}", portraitId);
        String sql = "SELECT 1 FROM portraits WHERE portrait_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, portraitId);
            ResultSet rs = pstmt.executeQuery();
            boolean exists = rs.next();
            logger.debug("立绘 {} 存在: {}", portraitId, exists);
            return exists;
        } catch (SQLException e) {
            logger.error("检查立绘存在失败: {}", portraitId, e);
            throw new RuntimeException("检查立绘存在失败: " + portraitId, e);
        }
    }
    
    @Override
    public boolean existsByCharacterAndName(String characterId, String portName) {
        logger.debug("检查立绘是否存在: 角色={}, 名称={}", characterId, portName);
        String sql = "SELECT 1 FROM portraits WHERE character_id = ? AND port_name = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            pstmt.setString(2, portName);
            ResultSet rs = pstmt.executeQuery();
            boolean exists = rs.next();
            logger.debug("立绘存在 - 角色={}, 名称={}: {}", characterId, portName, exists);
            return exists;
        } catch (SQLException e) {
            logger.error("检查立绘存在失败: 角色={}, 名称={}", characterId, portName, e);
            throw new RuntimeException("检查立绘存在失败: " + characterId + ", " + portName, e);
        }
    }
    
    @Override
    public boolean saveAll(List<Portrait> portraits) {
        logger.debug("批量保存立绘，数量: {}", portraits.size());
        String sql = """
            INSERT INTO portraits (portrait_id, character_id, image_path, port_name, 
                                  emotion, face_x, face_y, length, adj_x, adj_y, thumbnail_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            for (Portrait portrait : portraits) {
                setPortraitParameters(pstmt, portrait);
                pstmt.addBatch();
            }
            
            int[] results = pstmt.executeBatch();
            boolean success = results.length == portraits.size();
            if (success) {
                logger.info("成功批量保存 {} 个立绘", portraits.size());
            } else {
                logger.warn("批量保存立绘部分失败，预期: {}, 实际: {}", portraits.size(), results.length);
            }
            return success;
            
        } catch (SQLException e) {
            logger.error("批量保存立绘失败，数量: {}", portraits.size(), e);
            throw new RuntimeException("批量保存立绘失败", e);
        }
    }
    
    @Override
    public boolean deleteByCharacterId(String characterId) {
        logger.debug("按角色删除立绘: {}", characterId);
        String sql = "DELETE FROM portraits WHERE character_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            int affectedRows = pstmt.executeUpdate();
            boolean success = affectedRows > 0;
            if (success) {
                logger.info("成功删除角色 {} 的所有立绘，删除数量: {}", characterId, affectedRows);
            } else {
                logger.debug("角色 {} 没有立绘可删除", characterId);
            }
            return success;
        } catch (SQLException e) {
            logger.error("按角色删除立绘失败: {}", characterId, e);
            throw new RuntimeException("按角色删除立绘失败: " + characterId, e);
        }
    }
    
    @Override
    public boolean updateThumbnailPath(String portraitId, String thumbnailPath) {
        logger.debug("更新立绘缩略图路径: {}, {}", portraitId, thumbnailPath);
        String sql = "UPDATE portraits SET thumbnail_path = ? WHERE portrait_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, thumbnailPath);
            pstmt.setString(2, portraitId);
            int affectedRows = pstmt.executeUpdate();
            boolean success = affectedRows > 0;
            if (success) {
                logger.debug("成功更新立绘 {} 的缩略图路径", portraitId);
            } else {
                logger.warn("更新立绘缩略图路径未影响任何行: {}", portraitId);
            }
            return success;
        } catch (SQLException e) {
            logger.error("更新缩略图路径失败: {}", portraitId, e);
            throw new RuntimeException("更新缩略图路径失败: " + portraitId, e);
        }
    }
    
    @Override
    public Optional<Portrait> findDefaultPortraitByCharacter(String characterId) {
        logger.debug("查询角色 {} 的默认立绘", characterId);
        String sql = """
            SELECT * FROM portraits 
            WHERE character_id = ? 
            ORDER BY 
                CASE WHEN emotion = 'NORMAL' THEN 1
                     WHEN emotion = 'HAPPY' THEN 2
                     ELSE 3 END,
                port_name
            LIMIT 1
            """;
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            ResultSet rs = pstmt.executeQuery();
            
            if (rs.next()) {
                Portrait portrait = mapResultSetToPortrait(rs);
                logger.debug("找到角色 {} 的默认立绘: {}", characterId, portrait.getPortraitID());
                return Optional.of(portrait);
            } else {
                logger.debug("未找到角色 {} 的默认立绘", characterId);
                return Optional.empty();
            }
        } catch (SQLException e) {
            logger.error("查询默认立绘失败: {}", characterId, e);
            throw new RuntimeException("查询默认立绘失败: " + characterId, e);
        }
    }
    
    @Override
    public List<Portrait> findPortraitsWithThumbnails() {
        logger.debug("查询所有有缩略图的立绘");
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits WHERE thumbnail_path IS NOT NULL ORDER BY port_name";
        
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
            logger.debug("找到 {} 个有缩略图的立绘", portraits.size());
        } catch (SQLException e) {
            logger.error("查询有缩略图的立绘失败", e);
            throw new RuntimeException("查询有缩略图的立绘失败", e);
        }
        return portraits;
    }

    // 私有辅助方法
    private Portrait mapResultSetToPortrait(ResultSet rs) throws SQLException {
        return Portrait.builder("image_path")
            .portraitID(rs.getString("portrait_id"))
            .characterID(rs.getString("character_id"))
            .imagePath(rs.getString("image_path"))
            .portName(rs.getString("port_name"))
            .emotion(Emotion.valueOf(rs.getString("emotion")))
            .faceX(rs.getInt("face_x"))
            .faceY(rs.getInt("face_y"))
            .length(rs.getInt("length"))
            .adjX(rs.getInt("adj_x"))
            .adjY(rs.getInt("adj_y"))
            .thumbnailPath(rs.getString("thumbnail_path"))
            .build();
    }
    
    private void setPortraitParameters(PreparedStatement pstmt, Portrait portrait) throws SQLException {
        pstmt.setString(1, portrait.getPortraitID());
        pstmt.setString(2, portrait.getCharacterID());
        pstmt.setString(3, portrait.getImagePath());
        pstmt.setString(4, portrait.getPortName());
        pstmt.setString(5, portrait.getEmotion().name());
        pstmt.setInt(6, portrait.getFaceX());
        pstmt.setInt(7, portrait.getFaceY());
        pstmt.setInt(8, portrait.getLength());
        pstmt.setInt(9, portrait.getAdjX());
        pstmt.setInt(10, portrait.getAdjY());
        pstmt.setString(11, portrait.getThumbnailPath());
    }
}