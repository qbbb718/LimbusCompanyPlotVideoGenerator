package DAO;

import java.awt.Color;
import java.io.IOException;
import java.util.Optional;

import org.jdbi.v3.core.Jdbi;
import org.junit.jupiter.api.Test;
import org.sqlite.SQLiteDataSource;

import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.CharacterMapper;
import com.lbc_plot.DAO.ColorMapper;
import com.lbc_plot.DAO.PortraitDAO;
import com.lbc_plot.DAO.PortraitMapper;
import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.model.storage.Portrait;
import com.lbc_plot.util.db.SQLiteDatabaseManager;

public class CharacterDAOTest {

    @Test
    void baseTest() throws IOException {

        
        SQLiteDataSource dataSource = new SQLiteDataSource();
        Jdbi jdbi = Jdbi.create(dataSource)
        .registerRowMapper(Portrait.class, new PortraitMapper())
        .registerRowMapper(MyCharacter.class, new CharacterMapper());

        // 获取DAO实例
        CharacterDAO characterDAO = jdbi.onDemand(CharacterDAO.class);
        PortraitDAO portraitDAD = jdbi.onDemand(PortraitDAO.class);


        
        // 创建角色
        MyCharacter character = MyCharacter.builder()
            .characterID("hero_001")
            .characterName("英雄")
            .height(180)
            .color_bg(Color.RED)
            .color_text(Color.WHITE)
            .faction("正义联盟")
            .build();
        
        // 保存角色
        String saved = characterDAO.save(character);
        System.out.println("保存结果: " + saved);
        
        // 查询角色
        Optional<MyCharacter> found = characterDAO.findById("hero_001");
        found.ifPresent(c -> System.out.println("找到角色: " + c.getCharacterName()));
        
        // 统计
        int count = characterDAO.countAll();
        System.out.println("总角色数: " + count);
    }
}