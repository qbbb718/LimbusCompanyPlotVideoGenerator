package com.lbc_plot.DAO.mappers;

import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.util.ColorUtils;
import org.jdbi.v3.core.mapper.RowMapper;
import org.jdbi.v3.core.statement.StatementContext;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;

/**
 * MyCharacter行映射器
 * 将数据库行映射到MyCharacter对象
 */
public class MyCharacterMapper implements RowMapper<MyCharacter> {

    @Override
    public MyCharacter map(ResultSet rs, StatementContext ctx) throws SQLException {
        MyCharacter character = new MyCharacter();

        // 基本属性
        character.setCharacterID(rs.getString("character_id"));
        character.setCharacterName(rs.getString("character_name"));
        character.setHeight(rs.getInt("height"));
        character.setFaction(rs.getString("faction"));

        // 颜色属性 - 从字符串转换为Color对象
        String colorBgStr = rs.getString("color_bg");
        if (colorBgStr != null && !colorBgStr.isEmpty()) {
            character.setColorBg(ColorUtils.stringToColor(colorBgStr));
        }

        String colorTextStr = rs.getString("color_text");
        if (colorTextStr != null && !colorTextStr.isEmpty()) {
            character.setColorText(ColorUtils.stringToColor(colorTextStr));
        }

        // 初始化空列表，避免空指针异常
        character.setPortraits(new ArrayList<>());
        character.setTags(new ArrayList<>());

        return character;
    }
}