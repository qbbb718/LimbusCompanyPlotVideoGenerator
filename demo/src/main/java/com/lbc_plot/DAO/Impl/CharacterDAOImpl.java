package com.lbc_plot.DAO.Impl;


import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.util.ColorUtils;
import com.lbc_plot.util.db.SQLiteDatabaseManager;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * SQLite角色数据访问实现
 */
public class CharacterDAOImpl implements CharacterDAO {
    
    private final Connection connection;
    

    /**
     * 默认构造函数 - 使用默认数据库连接
     */
    public CharacterDAOImpl() {
        this(SQLiteDatabaseManager.getConnection());
    }
    
    /**
     * 构造函数注入 - 可以传入自定义连接（用于测试）
     * @param connection 数据库连接
     */
    public CharacterDAOImpl(Connection connection) {
        this.connection = connection;
    }
    


    
    @Override
    public Optional<MyCharacter> findById(String characterId) {
        String sql = "SELECT * FROM characters WHERE character_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            ResultSet rs = pstmt.executeQuery();
            
            if (rs.next()) {
                return Optional.of(mapResultSetToCharacter(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("查询角色失败: " + characterId, e);
        }
        return Optional.empty();
    }
    
    @Override
    public List<MyCharacter> findAll() {
        List<MyCharacter> characters = new ArrayList<>();
        String sql = "SELECT * FROM characters ORDER BY character_name";
        
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            
            while (rs.next()) {
                characters.add(mapResultSetToCharacter(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("查询所有角色失败", e);
        }
        return characters;
    }
    
    @Override
    public MyCharacter save(MyCharacter character) {
        // 先保存角色基本信息
        String sql = """
            INSERT INTO characters (character_id, character_name, height, color_bg, color_text, faction)
            VALUES (?, ?, ?, ?, ?, ?)
            """;
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            setCharacterParameters(pstmt, character);
            pstmt.executeUpdate();
            
            // 保存立绘关联关系
            saveCharacterPortraits(character);
            
            return character;
            
        } catch (SQLException e) {
            throw new RuntimeException("保存角色失败", e);
        }
    }
    
    /**
     * 保存角色-立绘关联关系
     */
    private void saveCharacterPortraits(MyCharacter character) throws SQLException {
        String sql = """
            INSERT INTO character_portraits (character_id, portrait_id, is_default, display_order)
            VALUES (?, ?, ?, ?)
            """;
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            List<Portrait> portraits = character.getPortraits();
            if (portraits != null) {
                for (int i = 0; i < portraits.size(); i++) {
                    Portrait portrait = portraits.get(i);
                    pstmt.setString(1, character.getCharacterID());
                    pstmt.setString(2, portrait.getPortraitID());
                    pstmt.setBoolean(3, i == 0); // 第一个立绘为默认
                    pstmt.setInt(4, i); // 显示顺序
                    pstmt.addBatch();
                }
                pstmt.executeBatch();
            }
        }
    }
    
    @Override
    public boolean update(MyCharacter character) {
        String sql = """
            UPDATE characters 
            SET character_name = ?, height = ?, color_bg = ?, color_text = ?, faction = ?
            WHERE character_id = ?
            """;
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, character.getCharacterName());
            pstmt.setInt(2, character.getHeight());
            pstmt.setString(3, ColorUtils.colorToString(character.getColor_bg()));
            pstmt.setString(4, ColorUtils.colorToString(character.getColor_text()));
            pstmt.setString(5, character.getFaction());
            pstmt.setString(6, character.getCharacterID());
            
            return pstmt.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new RuntimeException("更新角色失败: " + character.getCharacterID(), e);
        }
    }
    
    @Override
    public boolean delete(String characterId) {
        String sql = "DELETE FROM characters WHERE character_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            return pstmt.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new RuntimeException("删除角色失败: " + characterId, e);
        }
    }
    
    @Override
    public List<MyCharacter> findByFaction(String faction) {
        List<MyCharacter> characters = new ArrayList<>();
        String sql = "SELECT * FROM characters WHERE faction = ? ORDER BY character_name";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, faction);
            ResultSet rs = pstmt.executeQuery();
            
            while (rs.next()) {
                characters.add(mapResultSetToCharacter(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("按阵营查询角色失败: " + faction, e);
        }
        return characters;
    }
    
    @Override
    public List<MyCharacter> findByName(String name) {
        List<MyCharacter> characters = new ArrayList<>();
        String sql = "SELECT * FROM characters WHERE character_name LIKE ? ORDER BY character_name";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, "%" + name + "%");
            ResultSet rs = pstmt.executeQuery();
            
            while (rs.next()) {
                characters.add(mapResultSetToCharacter(rs));
            }
        } catch (SQLException e) {
            throw new RuntimeException("按名称查询角色失败: " + name, e);
        }
        return characters;
    }
    
    @Override
    public boolean existsById(String characterId) {
        String sql = "SELECT 1 FROM characters WHERE character_id = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, characterId);
            ResultSet rs = pstmt.executeQuery();
            return rs.next();
        } catch (SQLException e) {
            throw new RuntimeException("检查角色存在失败: " + characterId, e);
        }
    }
    
    @Override
    public int countAll() {
        String sql = "SELECT COUNT(*) FROM characters";
        
        try (Statement stmt = connection.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            return rs.next() ? rs.getInt(1) : 0;
        } catch (SQLException e) {
            throw new RuntimeException("统计角色数量失败", e);
        }
    }
    
    @Override
    public int countByFaction(String faction) {
        String sql = "SELECT COUNT(*) FROM characters WHERE faction = ?";
        
        try (PreparedStatement pstmt = connection.prepareStatement(sql)) {
            pstmt.setString(1, faction);
            ResultSet rs = pstmt.executeQuery();
            return rs.next() ? rs.getInt(1) : 0;
        } catch (SQLException e) {
            throw new RuntimeException("按阵营统计角色数量失败: " + faction, e);
        }
    }
    
    // 私有辅助方法
    private MyCharacter mapResultSetToCharacter(ResultSet rs) throws SQLException {
        return MyCharacter.builder()
            .characterID(rs.getString("character_id"))
            .characterName(rs.getString("character_name"))
            .height(rs.getInt("height"))
            .color_bg(ColorUtils.stringToColor(rs.getString("color_bg")))
            .color_text(ColorUtils.stringToColor(rs.getString("color_text")))
            .faction(rs.getString("faction"))
            .build();
    }
    
    private void setCharacterParameters(PreparedStatement pstmt, MyCharacter character) throws SQLException {
        pstmt.setString(1, character.getCharacterID());
        pstmt.setString(2, character.getCharacterName());
        pstmt.setInt(3, character.getHeight());
        pstmt.setString(4, ColorUtils.colorToString(character.getColor_bg()));
        pstmt.setString(5, ColorUtils.colorToString(character.getColor_text()));
        pstmt.setString(6, character.getFaction());
    }
}