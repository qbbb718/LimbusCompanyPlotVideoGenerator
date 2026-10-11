package com.lbc_plot.resource.dao;

import org.jdbi.v3.core.mapper.RowMapper;
import org.jdbi.v3.core.statement.StatementContext;
import java.sql.ResultSet;
import java.sql.SQLException;

import com.lbc_plot.resource.model.Emotion;
import com.lbc_plot.resource.model.Portrait;

public class PortraitMapper implements RowMapper<Portrait> {
    @Override
    public Portrait map(ResultSet rs, StatementContext ctx) throws SQLException {
        Portrait.Builder builder = Portrait.builder(rs.getString("image_path"))
                .portraitID(rs.getString("portrait_id"))
                .characterID(rs.getString("character_id"))
                .portName(rs.getString("port_name"))
                .emotion(convertEmotion(rs.getString("emotion"))) // 使用专门的转换方法
                .faceX(rs.getInt("face_x"))
                .faceY(rs.getInt("face_y"))
                .length(rs.getInt("length"))
                .adjX(rs.getInt("adj_x"))
                .adjY(rs.getInt("adj_y"))
                .thumbnailPath(rs.getString("thumbnail_path"));

        // is_default 来自关联表 character_portraits（查询需要 JOIN 该表）。
        // 未 JOIN 的查询（如 findById / findAll）拿不到该列，保持默认 false。
        Boolean isDefault = readBooleanOrNull(rs, "is_default");
        if (isDefault != null) {
            builder.defaultPortrait(isDefault);
        }

        return builder.build();
    }

    /**
     * 读取可能不存在的布尔列。列不存在时返回 null，表示"未知"而非 false。
     */
    private Boolean readBooleanOrNull(ResultSet rs, String column) {
        try {
            boolean value = rs.getBoolean(column);
            return rs.wasNull() ? Boolean.FALSE : Boolean.valueOf(value);
        } catch (SQLException e) {
            return null;
        }
    }

    private Emotion convertEmotion(String emotionStr) {
        if (emotionStr == null || emotionStr.trim().isEmpty()) {
            return Emotion.NORMAL; // 默认值
        }
        try {
            return Emotion.valueOf(emotionStr.toUpperCase());
        } catch (IllegalArgumentException e) {
            return Emotion.NORMAL; // 无效值时返回默认
        }
    }
}