import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.io.IOException;

import org.junit.jupiter.api.Test;

import com.lbc_plot.common.util.io.ImageExporter;
import com.lbc_plot.common.util.io.ImageReader;
import com.lbc_plot.plot.model.Dialogue.Emotion;
import com.lbc_plot.resource.model.Portrait;

public class PortraitTest {
    private static final String TEST_IMAGE_PATH = "Gregor-default.png";

    @Test
    void testPortraitBuilder() throws IOException {
        // 测试正常构建
        Portrait portrait = Portrait.builder(TEST_IMAGE_PATH)
                .portName("测试立绘")
                .build();

        assertNotNull(portrait);
        assertEquals("测试立绘", portrait.getPortName());
        assertNotNull(portrait.getImage());
    }

    @Test
    void testPortraitImageLoading() throws IOException {
        Portrait portrait = Portrait.builder(TEST_IMAGE_PATH).build();

        // 测试图像加载
        BufferedImage image1 = portrait.getImage(),
                image2 = ImageReader.readCharacters(TEST_IMAGE_PATH);
        assertNotNull(image1, "图像应该成功加载");
        assertTrue(image1.getWidth() > 0, "图像宽度应该大于0");
        assertTrue(image1.getHeight() > 0, "图像高度应该大于0");

        // 可以导出图像验证
        ImageExporter.exportImage(image1, "target/test-logs/portrait_test1.png");
        ImageExporter.exportImage(image2, "target/test-logs/portrait_test2.png");
    }

    @Test
    void testInvalidImagePath() {
        // 测试无效路径
        assertThrows(Exception.class, () -> {
            Portrait.builder("invalid/path.png").build();
        });
    }
}