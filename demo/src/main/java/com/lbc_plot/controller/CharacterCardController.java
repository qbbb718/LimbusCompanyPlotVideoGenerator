package com.lbc_plot.controller;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.logging.Logger;
import javax.imageio.ImageIO;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.model.storage.MyCharacter;
import com.lbc_plot.DAO.CharacterDAO;
import com.lbc_plot.DAO.CharacterMapper;
import com.lbc_plot.util.CharacterCardImageCache;
import org.jdbi.v3.core.Jdbi;

/**
 * 角色名片图片控制器
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = { "http://localhost:3000", "http://127.0.0.1:3000" })
public class CharacterCardController {

    private static final Logger logger = Logger.getLogger(CharacterCardController.class.getName());

    @Autowired
    private Jdbi jdbi;

    /**
     * 获取角色名片图片
     */
    @GetMapping("/character-card/{characterId}")
    public ResponseEntity<Resource> getCharacterCard(@PathVariable String characterId) {
        logger.info("请求获取角色名片图片，角色ID: " + characterId);
        try {
            // 从缓存中获取名片图片
            MyCharacter character = jdbi.withHandle(handle -> {
                // 注册CharacterMapper以确保正确映射所有字段
                handle.registerRowMapper(new CharacterMapper(jdbi));
                return handle.createQuery("SELECT * FROM characters WHERE character_id = :id")
                        .bind("id", characterId)
                        .mapTo(MyCharacter.class)
                        .findOne()
                        .orElse(null);
            });

            logger.info("获取到的角色信息: " + (character != null ?
                "ID=" + character.getCharacterID() +
                ", 名称=" + character.getCharacterName() +
                ", 名片路径=" + character.getCharacterCardImagePath() : "null"));

            if (character == null) {
                logger.warning("角色不存在，ID: " + characterId);
                return ResponseEntity.notFound().build();
            }

            BufferedImage cardImage = CharacterCardImageCache.getCharacterCardImage(character);
            if (cardImage == null) {
                return ResponseEntity.notFound().build();
            }

            // 将BufferedImage转换为字节数组
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(cardImage, "PNG", baos);
            byte[] imageBytes = baos.toByteArray();

            logger.info("成功生成名片图片，大小: " + imageBytes.length + " 字节");
            return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .body(new ByteArrayResource(imageBytes));
        } catch (Exception e) {
            logger.severe("获取角色名片图片失败: " + e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }
}
