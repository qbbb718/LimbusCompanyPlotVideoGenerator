package com.lbc_plot.resource.dao;

import org.jdbi.v3.core.mapper.ColumnMapper;
import org.jdbi.v3.core.statement.StatementContext;

import com.lbc_plot.common.util.ColorUtils;

import java.awt.Color;
import java.sql.ResultSet;
import java.sql.SQLException;

public class ColorMapper implements ColumnMapper<Color> {
    @Override
    public Color map(ResultSet rs, int columnNumber, StatementContext ctx) throws SQLException {
        return ColorUtils.stringToColor(rs.getString(columnNumber));
    }
}