package com.lbc_plot.resource.character;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.logging.Logger;
import javax.imageio.ImageIO;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.dao.CharacterMapper;
import com.lbc_plot.resource.model.MyCharacter;

import org.jdbi.v3.core.Jdbi;

/**
 * 角色名片图片控制器
 */
@RestController
@RequestMapping("/api")
public class CharacterCardController {

    private static final Logger logger = Logger.getLogger(CharacterCardController.class.getName());

    @Autowired
    private Jdbi jdbi;

    @Autowired
    private CharacterCardImageCache characterCardImageCache;

    /**
     * 获取角色名片图片
     *
     * <p>保存角色的接口只把名片"排进后台刷新队列"（见
     * {@link CharacterCardImageCache#requestRefresh(MyCharacter)}），接口本身立即返回。
     * 所以这里先等一下后台那张图：前端保存完立刻请求名片时，直接拿后台渲染好的结果，
     * 不会在 HTTP 线程里再同步渲染一遍（以前就是保存接口里同步渲染，1s 起步）。
     *
     * <p>等待有上限（{@link CharacterCardImageCache#REFRESH_WAIT_DEFAULT_MS}）：没有待刷新的
     * 任务、或者后台渲染太慢时返回 null，回退到原来的同步渲染路径，功能不受影响。
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

            logger.info("获取到的角色信息: " + (character != null ? "ID=" + character.getCharacterID() +
                    ", 名称=" + character.getCharacterName() +
                    ", 名片路径=" + character.getCharacterCardImagePath() : "null"));

            if (character == null) {
                logger.warning("角色不存在，ID: " + characterId);
                return ResponseEntity.notFound().build();
            }

            long startTime = System.currentTimeMillis();
            // 1) 后台刚排下的刷新：等它的结果，避免同一张名片被渲染两遍
            BufferedImage cardImage = characterCardImageCache.awaitRefresh(
                    characterId, CharacterCardImageCache.REFRESH_WAIT_DEFAULT_MS);
            long waited = System.currentTimeMillis() - startTime;
            if (cardImage != null) {
                logger.info("使用后台刷新好的名片，角色ID: " + characterId + ", 等待=" + waited + " ms");
            } else {
                // 2) 没有待刷新的任务（或后台太慢）：走原来的"缓存命中/同步生成"
                cardImage = characterCardImageCache.getCharacterCardImage(character);
            }
            long endTime = System.currentTimeMillis();

            if (cardImage == null) {
                logger.warning("获取名片图片失败，返回404，角色ID: " + characterId);
                return ResponseEntity.notFound().build();
            }

            // 将BufferedImage转换为字节数组
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(cardImage, "PNG", baos);
            byte[] imageBytes = baos.toByteArray();

            logger.info("成功返回名片图片，角色ID: " + characterId +
                    ", 大小: " + imageBytes.length + " 字节" +
                    ", 处理时间: " + (endTime - startTime) + "ms");
            return ResponseEntity.ok()
                    .contentType(MediaType.IMAGE_PNG)
                    .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                    .body(new ByteArrayResource(imageBytes));
        } catch (Exception e) {
            logger.severe("获取角色名片图片失败: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * 用"当前参数"重新渲染一张角色名片图片，不读也不写任何缓存。
     *
     * <p>「资源管理 → 角色 → 名片预览」右上角的刷新按钮调用它：把弹窗里正在编辑、
     * 可能还没保存的名称/阵营/颜色直接发给后端重新渲染，这样改完参数就能立刻看到新名片，
     * 不必先保存、更不必重启应用。
     *
     * <p>与 {@link #getCharacterCard(String)} 的区别：那个接口走缓存且从数据库取角色，
     * 这里只用请求体里的参数渲染，页面上的实时预览不会影响已保存角色的名片缓存；
     * 真正的保存仍然走 {@code PUT /api/characters/{id}}，由它负责刷新缓存。
     *
     * @param character 角色参数（名称、阵营、颜色等）
     * @return PNG 图片字节流；名称为空返回 400，渲染失败返回 500
     */
    @PostMapping(value = "/character-card/preview", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<byte[]> previewCharacterCard(@RequestBody MyCharacter character) {
        if (character == null) {
            logger.warning("名片预览请求体为空");
            return ResponseEntity.badRequest().build();
        }

        String characterName = character.getCharacterName();
        if (characterName == null || characterName.trim().isEmpty()) {
            logger.warning("名片预览失败：角色名称为空");
            return ResponseEntity.badRequest().build();
        }

        long startTime = System.currentTimeMillis();
        try {
            BufferedImage cardImage = characterCardImageCache.renderCardImage(character);
            if (cardImage == null) {
                logger.warning("名片预览渲染失败，角色名: " + characterName);
                return ResponseEntity.internalServerError().build();
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(cardImage, "PNG", baos);
            byte[] imageBytes = baos.toByteArray();

            logger.info("名片预览渲染完成，角色名: " + characterName +
                    ", 阵营: " + character.getFaction() +
                    ", 尺寸: " + cardImage.getWidth() + "x" + cardImage.getHeight() +
                    ", 大小: " + imageBytes.length + " 字节" +
                    ", 耗时: " + (System.currentTimeMillis() - startTime) + "ms");

            return ResponseEntity.ok()
                    .contentType(MediaType.IMAGE_PNG)
                    .header(HttpHeaders.CACHE_CONTROL, "no-store")
                    .body(imageBytes);
        } catch (IOException e) {
            logger.severe("名片预览图片编码失败: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.internalServerError().build();
        }
    }
}
