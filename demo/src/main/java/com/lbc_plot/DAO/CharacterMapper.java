package com.lbc_plot.DAO;

import java.sql.ResultSet;
import java.sql.SQLException;

import org.jdbi.v3.core.mapper.RowMapper;
import org.jdbi.v3.core.statement.StatementContext;

import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.util.ColorUtils;

public class CharacterMapper implements RowMapper<MyCharacter> {
    @Override
    public MyCharacter map(ResultSet rs, StatementContext ctx) throws SQLException {
        return MyCharacter.builder()
            .characterID(rs.getString("character_id"))
            .characterName(rs.getString("character_name"))
            .height(rs.getInt("height"))
            .colorBg(ColorUtils.stringToColor(rs.getString("color_bg")))
            .colorText(ColorUtils.stringToColor(rs.getString("color_text")))
            .faction(rs.getString("faction"))
            .build();
    }
}