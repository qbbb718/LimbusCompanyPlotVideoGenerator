import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import com.lbc_plot.common.util.io.ImageExporter;
import com.lbc_plot.common.util.io.ImageReader;
import com.lbc_plot.plot.model.Dialogue.Emotion;
import com.lbc_plot.resource.model.Portrait;

@SpringBootTest(classes = com.lbc_plot.config.Application.class)
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

    /**
     * 无效路径不能把调用方拖垮。
     *
     * <p>这里断言的行为在历史上改过一次：{@code Portrait} 现在是<b>懒加载</b>的，
     * {@code builder(...).build()} 只存路径不读盘，所以旧写法
     * {@code assertThrows(builder("invalid/path.png").build())} 什么也断言不到
     * （没有异常可抛，测试变成永远失败）。真正读盘发生在 {@code getImage()}，
     * 而它对读不出来的图片返回红色“加载失败”占位图，不抛异常 —— 这正是渲染管线
     * 在缺图时还能继续出片的原因。
     */
    @Test
    void testInvalidImagePathFallsBackToPlaceholderImage() throws IOException {
        Portrait portrait = Portrait.builder("invalid/path.png").build();

        BufferedImage image = portrait.getImage();
        assertNotNull(image, "无效路径必须退化成占位图，而不是返回 null");
        assertTrue(image.getWidth() > 0 && image.getHeight() > 0, "占位图也要有有效尺寸");
    }
}