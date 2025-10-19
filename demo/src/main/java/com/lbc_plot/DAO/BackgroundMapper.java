package com.lbc_plot.DAO;

import org.jdbi.v3.core.mapper.RowMapper;
import org.jdbi.v3.core.statement.StatementContext;
import java.sql.ResultSet;
import java.sql.SQLException;
import com.lbc_plot.model.storage.Background;

public class BackgroundMapper implements RowMapper<Background> {
    @Override
    public Background map(ResultSet rs, StatementContext ctx) throws SQLException {
        String id = rs.getString("background_id");
        String path = rs.getString("image_path");
        String name = rs.getString("display_name");
        Background bg = new Background(id, path, name);
        return bg;
    }
}
