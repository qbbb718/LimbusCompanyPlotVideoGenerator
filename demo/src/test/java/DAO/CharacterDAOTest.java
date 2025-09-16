package DAO;

import java.awt.Color;
import java.io.IOException;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.Impl.CharacterDAOImpl;
import com.lbc_plot.model.storage.MyCharacter;

public class CharacterDAOTest {

    // @Test
    // void baseTest() throws IOException {
    //     CharacterDAO characterDAO = new CharacterDAOImpl();
        
    //     // 创建角色
    //     MyCharacter character = MyCharacter.builder()
    //         .characterID("hero_001")
    //         .characterName("英雄")
    //         .height(180)
    //         .color_bg(Color.RED)
    //         .color_text(Color.WHITE)
    //         .faction("正义联盟")
    //         .build();
        
    //     // 保存角色
    //     boolean saved = characterDAO.save(character);
    //     System.out.println("保存结果: " + saved);
        
    //     // 查询角色
    //     Optional<MyCharacter> found = characterDAO.findById("hero_001");
    //     found.ifPresent(c -> System.out.println("找到角色: " + c.getCharacterName()));
        
    //     // 统计
    //     int count = characterDAO.countAll();
    //     System.out.println("总角色数: " + count);
    // }
}