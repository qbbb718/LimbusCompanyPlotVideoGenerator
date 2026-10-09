package com.lbc_plot.resource.dao;

import java.util.List;
import java.util.ArrayList;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import com.lbc_plot.common.util.db.SQLiteDatabaseManager;
import com.lbc_plot.resource.model.Audio;

/**
 * 音频数据访问对象
 */
public class AudioDAO {

    /**
     * 根据ID获取音频
     */
    public static Audio getById(String uuid) {
        Audio audio = null;

        try (Connection conn = SQLiteDatabaseManager.getConnection();
                PreparedStatement stmt = conn.prepareStatement("SELECT * FROM audios WHERE uuid = ?")) {

            stmt.setString(1, uuid);
            ResultSet rs = stmt.executeQuery();

            if (rs.next()) {
                audio = new Audio();
                audio.setUuid(rs.getString("uuid"));
                audio.setName(rs.getString("name"));
                audio.setPath(rs.getString("path"));
                audio.setType(rs.getString("type"));

                // 解析标签
                String tagsJson = rs.getString("tags");
                if (tagsJson != null && !tagsJson.isEmpty()) {
                    // 这里应该解析JSON字符串为标签列表
                    // 简化实现，暂时设置为空列表
                    audio.setTags(new ArrayList<>());
                }
            }
        } catch (SQLException e) {
            System.err.println("获取音频失败: " + e.getMessage());
        }

        return audio;
    }

    /**
     * 获取所有音频
     */
    public static List<Audio> getAllAudios() {
        List<Audio> audios = new ArrayList<>();

        try (Connection conn = SQLiteDatabaseManager.getConnection();
                PreparedStatement stmt = conn.prepareStatement("SELECT * FROM audios");
                ResultSet rs = stmt.executeQuery()) {

            while (rs.next()) {
                Audio audio = new Audio();
                audio.setUuid(rs.getString("uuid"));
                audio.setName(rs.getString("name"));
                audio.setPath(rs.getString("path"));
                audio.setType(rs.getString("type"));

                // 解析标签
                String tagsJson = rs.getString("tags");
                if (tagsJson != null && !tagsJson.isEmpty()) {
                    // 这里应该解析JSON字符串为标签列表
                    // 简化实现，暂时设置为空列表
                    audio.setTags(new ArrayList<>());
                }

                audios.add(audio);
            }
        } catch (SQLException e) {
            System.err.println("获取音频列表失败: " + e.getMessage());
        }

        return audios;
    }

    /**
     * 添加音频
     */
    public static void addAudio(Audio audio) {
        try (Connection conn = SQLiteDatabaseManager.getConnection()) {

            // 当前 schema（init_database.sql）的 audios 表没有 audio_id 列，
            // 只有早期旧库保留该可空列，这里按实际表结构决定是否写入，避免报
            // "table audios has no column named audio_id" 而无法保存音频。
            boolean hasAudioIdColumn = hasColumn(conn, "audios", "audio_id");

            String sql = hasAudioIdColumn
                    ? "INSERT INTO audios (audio_id, uuid, name, path, type, tags) VALUES (?, ?, ?, ?, ?, ?)"
                    : "INSERT INTO audios (uuid, name, path, type, tags) VALUES (?, ?, ?, ?, ?)";

            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                int index = 1;

                if (hasAudioIdColumn) {
                    // 兼容旧schema中 audio_id 的 NOT NULL 约束，与 uuid 保持一致
                    stmt.setString(index++, audio.getUuid());
                }

                stmt.setString(index++, audio.getUuid());
                stmt.setString(index++, audio.getName());
                stmt.setString(index++, audio.getPath());
                stmt.setString(index++, audio.getType());

                // 将标签列表转换为JSON字符串
                // 简化实现，暂时设置为空字符串
                stmt.setString(index, "");

                stmt.executeUpdate();
            }
        } catch (SQLException e) {
            System.err.println("添加音频失败: " + e.getMessage());
            throw new RuntimeException("添加音频失败: " + e.getMessage());
        }
    }

    /**
     * 判断指定表是否存在某列（基于 SQLite 的 pragma_table_info）
     */
    private static boolean hasColumn(Connection conn, String table, String column) throws SQLException {
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT count(*) FROM pragma_table_info(?) WHERE name = ?")) {
            stmt.setString(1, table);
            stmt.setString(2, column);
            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }

    /**
     * 更新音频
     */
    public static void updateAudio(Audio audio) {
        try (Connection conn = SQLiteDatabaseManager.getConnection();
                PreparedStatement stmt = conn.prepareStatement(
                        "UPDATE audios SET name = ?, path = ?, type = ?, tags = ? WHERE uuid = ?")) {

            stmt.setString(1, audio.getName());
            stmt.setString(2, audio.getPath());
            stmt.setString(3, audio.getType());

            // 将标签列表转换为JSON字符串
            // 简化实现，暂时设置为空字符串
            stmt.setString(4, "");
            stmt.setString(5, audio.getUuid());

            stmt.executeUpdate();
        } catch (SQLException e) {
            System.err.println("更新音频失败: " + e.getMessage());
            throw new RuntimeException("更新音频失败: " + e.getMessage());
        }
    }

    /**
     * 删除音频
     */
    public static void deleteAudio(String uuid) {
        try (Connection conn = SQLiteDatabaseManager.getConnection();
                PreparedStatement stmt = conn.prepareStatement("DELETE FROM audios WHERE uuid = ?")) {

            stmt.setString(1, uuid);
            stmt.executeUpdate();
        } catch (SQLException e) {
            System.err.println("删除音频失败: " + e.getMessage());
            throw new RuntimeException("删除音频失败: " + e.getMessage());
        }
    }
}
