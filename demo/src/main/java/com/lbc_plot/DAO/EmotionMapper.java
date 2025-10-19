package com.lbc_plot.DAO;

import org.jdbi.v3.core.mapper.ColumnMapper;
import org.jdbi.v3.core.statement.StatementContext;
import java.sql.ResultSet;
import java.sql.SQLException;
import com.lbc_plot.model.storage.Emotion;

public class EmotionMapper implements ColumnMapper<Emotion> {
    @Override
    public Emotion map(ResultSet rs, int columnNumber, StatementContext ctx) throws SQLException {
        return Emotion.valueOf(rs.getString(columnNumber));
    }
}