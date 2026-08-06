package com.lbc_plot.render.service.impl;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.lbc_plot.render.service.ThumbnailService;
import com.lbc_plot.resource.model.Portrait;

@SpringBootTest
public class ThumbnailServiceImplTest {

    @Autowired
    private ThumbnailService thumbnailService;

    private Path tempImage;

    @AfterEach
    public void cleanup() throws Exception {
        if (tempImage != null && Files.exists(tempImage)) {
            Files.deleteIfExists(tempImage);
        }
    }

    @Test
    public void generateAndLoadThumbnail() throws Exception {
        // 1. 创建临时原始图像
        BufferedImage img = new BufferedImage(200, 200, BufferedImage.TYPE_INT_ARGB);
        File tmp = Files.createTempFile("portrait_test_", ".png").toFile();
        ImageIO.write(img, "png", tmp);
        tempImage = tmp.toPath();

        // 2. 构建 Portrait
        Portrait portrait = Portrait.builder(tmp.getAbsolutePath()).portraitID("test-portrait-1").build();
        portrait.setFaceX(10);
        portrait.setFaceY(10);
        portrait.setLength(100);

        // 3. 生成缩略图
        thumbnailService.generateThumbnail(portrait);

        // 4. 验证缩略图存在
        File thumb = thumbnailService.getThumbnailFile(portrait);
        assertTrue(thumb != null && thumb.exists() && thumb.length() > 0, "缩略图应已生成并存在");

        // 5. 清理生成的缩略图
        thumbnailService.deleteThumbnail(portrait);
    }
}
