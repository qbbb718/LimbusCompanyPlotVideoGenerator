package com.lbc_plot.DAO;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import org.jdbi.v3.core.mapper.RowMapper;
import org.jdbi.v3.core.statement.StatementContext;
import org.jdbi.v3.core.Jdbi;

import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.util.ColorUtils;

public class CharacterMapper implements RowMapper<MyCharacter> {
    private final Jdbi jdbi;

    public CharacterMapper(Jdbi jdbi) {
        this.jdbi = jdbi;
    }

    @Override
    public MyCharacter map(ResultSet rs, StatementContext ctx) throws SQLException {
        String characterId = rs.getString("character_id");

        // 从数据库加载该角色的所有立绘
        List<Portrait> portraits = jdbi.withExtension(PortraitDAO.class, dao -> 
            dao.findByCharacterId(characterId)
        );

        return MyCharacter.builder()
            .characterID(characterId)
            .characterName(rs.getString("character_name"))
            .height(rs.getInt("height"))
            .colorBg(ColorUtils.stringToColor(rs.getString("color_bg")))
            .colorText(ColorUtils.stringToColor(rs.getString("color_text")))
            .faction(rs.getString("faction"))
            .characterCardImagePath(rs.getString("character_card_image_path"))
            .portraits(portraits)
            .build();
    }
}