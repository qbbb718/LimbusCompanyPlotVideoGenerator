package com.lbc_plot.resource.dao;

import org.jdbi.v3.core.mapper.ColumnMapper;
import org.jdbi.v3.core.statement.StatementContext;

import com.lbc_plot.resource.model.Emotion;

import java.sql.ResultSet;
import java.sql.SQLException;

public class EmotionMapper implements ColumnMapper<Emotion> {
    @Override
    public Emotion map(ResultSet rs, int columnNumber, StatementContext ctx) throws SQLException {
        return Emotion.valueOf(rs.getString(columnNumber));
    }
}