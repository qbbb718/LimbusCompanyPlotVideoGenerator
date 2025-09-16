package com.lbc_plot.DAO.Impl;

import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.model.storage.Emotion;
import com.lbc_plot.util.SQLiteDatabaseManager;
import com.lbc_plot.util.ColorUtils;

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
    
    private final Connection connection;
    
    public PortraitDAOImpl() {
        this.connection = SQLiteDatabaseManager.getConnection();
    }
    
    @Override
    public Optional<Portrait> findById(String portraitId) {
        String sql = "SELECT * FROM portraits WHERE portrait_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, portraitId);
            ResultSet rs = pstmt.executeQuery();
            
            if (rs.next()) {
                return Optional.of(mapResultSetToPortrait(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("查询立绘失败: " + portraitId, e);
        }
        return Optional.empty();
    }
    
    @Override
    public List<Portrait> findAll() {
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits ORDER BY port_name";
        
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("查询所有立绘失败", e);
        }
        return portraits;
    }
    
    @Override
    public Portrait save(Portrait portrait) {
        String sql = """
            INSERT INTO portraits (portrait_id, character_id, image_path, port_name, 
                                  emotion, face_x, face_y, length, adj_x, adj_y, thumbnail_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            setPortraitParameters(pstmt, portrait);
            int affectedRows = pstmt.executeUpdate();
            
            if (affectedRows > 0) {
                return portrait;
            }
            throw new RuntimeException("保存立绘失败");
            
        } catch (SQLException e) {
            throw new RuntimeException("保存立绘失败: " + portrait.getPortraitID(), e);
        }
    }
    
    @Override
    public boolean update(Portrait portrait) {
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
            
            return pstmt.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new RuntimeException("更新立绘失败: " + portrait.getPortraitID(), e);
        }
    }
    
    @Override
    public boolean delete(String portraitId) {
        String sql = "DELETE FROM portraits WHERE portrait_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, portraitId);
            return pstmt.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new RuntimeException("删除立绘失败: " + portraitId, e);
        }
    }
    
    @Override
    public List<Portrait> findByCharacterId(String characterId) {
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits WHERE character_id = ? ORDER BY port_name";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            ResultSet rs = pstmt.executeQuery();
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("按角色查询立绘失败: " + characterId, e);
        }
        return portraits;
    }
    
    @Override
    public List<Portrait> findByName(String portName) {
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits WHERE port_name LIKE ? ORDER BY port_name";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, "%" + portName + "%");
            ResultSet rs = pstmt.executeQuery();
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("按名称查询立绘失败: " + portName, e);
        }
        return portraits;
    }
    
    @Override
    public List<Portrait> findByEmotion(Emotion emotion) {
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits WHERE emotion = ? ORDER BY port_name";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, emotion.name());
            ResultSet rs = pstmt.executeQuery();
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("按情绪查询立绘失败: " + emotion, e);
        }
        return portraits;
    }
    
    @Override
    public List<Portrait> findByCharacterAndEmotion(String characterId, Emotion emotion) {
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits WHERE character_id = ? AND emotion = ? ORDER BY port_name";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            pstmt.setString(2, emotion.name());
            ResultSet rs = pstmt.executeQuery();
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("按角色和情绪查询立绘失败: " + characterId + ", " + emotion, e);
        }
        return portraits;
    }
    
    @Override
    public int countAll() {
        String sql = "SELECT COUNT(*) FROM portraits";
        
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            return rs.next() ? rs.getInt(1) : 0;
        } catch (SQLException e) {
            throw new RuntimeException("统计立绘数量失败", e);
        }
    }
    
    @Override
    public int countByCharacterId(String characterId) {
        String sql = "SELECT COUNT(*) FROM portraits WHERE character_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            ResultSet rs = pstmt.executeQuery();
            return rs.next() ? rs.getInt(1) : 0;
        } catch (SQLException e) {
            throw new RuntimeException("按角色统计立绘数量失败: " + characterId, e);
        }
    }
    
    @Override
    public int countByEmotion(Emotion emotion) {
        String sql = "SELECT COUNT(*) FROM portraits WHERE emotion = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, emotion.name());
            ResultSet rs = pstmt.executeQuery();
            return rs.next() ? rs.getInt(1) : 0;
        } catch (SQLException e) {
            throw new RuntimeException("按情绪统计立绘数量失败: " + emotion, e);
        }
    }
    
    @Override
    public boolean existsById(String portraitId) {
        String sql = "SELECT 1 FROM portraits WHERE portrait_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, portraitId);
            ResultSet rs = pstmt.executeQuery();
            return rs.next();
        } catch (SQLException e) {
            throw new RuntimeException("检查立绘存在失败: " + portraitId, e);
        }
    }
    
    @Override
    public boolean existsByCharacterAndName(String characterId, String portName) {
        String sql = "SELECT 1 FROM portraits WHERE character_id = ? AND port_name = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            pstmt.setString(2, portName);
            ResultSet rs = pstmt.executeQuery();
            return rs.next();
        } catch (SQLException e) {
            throw new RuntimeException("检查立绘存在失败: " + characterId + ", " + portName, e);
        }
    }
    
    @Override
    public boolean saveAll(List<Portrait> portraits) {
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
            return results.length == portraits.size();
            
        } catch (SQLException e) {
            throw new RuntimeException("批量保存立绘失败", e);
        }
    }
    
    @Override
    public boolean deleteByCharacterId(String characterId) {
        String sql = "DELETE FROM portraits WHERE character_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            return pstmt.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new RuntimeException("按角色删除立绘失败: " + characterId, e);
        }
    }
    
    @Override
    public boolean updateThumbnailPath(String portraitId, String thumbnailPath) {
        String sql = "UPDATE portraits SET thumbnail_path = ? WHERE portrait_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, thumbnailPath);
            pstmt.setString(2, portraitId);
            return pstmt.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new RuntimeException("更新缩略图路径失败: " + portraitId, e);
        }
    }
    
    @Override
    public Optional<Portrait> findDefaultPortraitByCharacter(String characterId) {
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
                return Optional.of(mapResultSetToPortrait(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("查询默认立绘失败: " + characterId, e);
        }
        return Optional.empty();
    }
    
    @Override
    public List<Portrait> findPortraitsWithThumbnails() {
        List<Portrait> portraits = new ArrayList<>();
        String sql = "SELECT * FROM portraits WHERE thumbnail_path IS NOT NULL ORDER BY port_name";
        
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            
            while (rs.next()) {
                portraits.add(mapResultSetToPortrait(rs));
            }
        } catch (SQLException e) {
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