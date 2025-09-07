import org.junit.jupiter.api.Test;

import com.lbc_plot.model.repository.Background;
import com.lbc_plot.model.video.BackgroundVisual;
import com.lbc_plot.util.ImageExporter;

import org.junit.jupiter.api.BeforeEach;
import static org.junit.jupiter.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.io.IOException;

/**
 * BackgroundVisual 测试类
 * 专门诊断Background正常但BackgroundVisual异常的问题
 */
public class BackgroundVisualTest {
    
    private Background testBackground;
    
    @BeforeEach
    void setUp() throws IOException {
        // 在每个测试前创建Background实例
        testBackground = new Background("test_bg.png");
    }
    
    @Test
    void testBackgroundVisualCreation() throws IOException {
        System.out.println("=== 测试BackgroundVisual创建 ===");
        
        // 创建BackgroundVisual
        BackgroundVisual visual = new BackgroundVisual(testBackground);
        
        assertNotNull(visual, "BackgroundVisual对象不应该为null");
        assertNotNull(visual.getBackground(), "Background引用不应该为null");
        assertEquals(testBackground, visual.getBackground(), "Background应该一致");
        
        System.out.println("BackgroundVisual创建成功");
    }
    
    @Test
    void testBackgroundVisualImage() throws IOException {
        System.out.println("=== 测试BackgroundVisual图像 ===");
        
        BackgroundVisual visual = new BackgroundVisual(testBackground);
        
        // 获取图像
        BufferedImage bgImage = visual.getBgImage();
        BufferedImage originalImage = testBackground.getImage();
        
        // 诊断信息
        System.out.println("Original image: " + 
            (originalImage != null ? originalImage.getWidth() + "x" + originalImage.getHeight() : "null"));
        System.out.println("Visual image: " + 
            (bgImage != null ? bgImage.getWidth() + "x" + bgImage.getHeight() : "null"));
        
        assertNotNull(bgImage, "BackgroundVisual图像不应该为null");
        assertNotNull(originalImage, "原始Background图像不应该为null");
        
        // 检查图像尺寸
        assertEquals(originalImage.getWidth(), bgImage.getWidth(), "图像宽度应该一致");
        assertEquals(originalImage.getHeight(), bgImage.getHeight(), "图像高度应该一致");
        
        System.out.println("图像尺寸验证通过");
    }
    
    @Test
    void testImageExportComparison() throws IOException {
        System.out.println("=== 测试图像导出对比 ===");
        
        BackgroundVisual visual = new BackgroundVisual(testBackground);
        
        // 导出原始图像
        BufferedImage originalImage = testBackground.getImage();
        ImageExporter.exportImage(originalImage, "target/test-logs/background_original.png");
        System.out.println("原始背景图像已导出: target/test-logs/background_original.png");
        
        // 导出BackgroundVisual图像
        BufferedImage visualImage = visual.getBgImage();
        ImageExporter.exportImage(visualImage, "target/test-logs/background_visual.png");
        System.out.println("BackgroundVisual图像已导出: target/test-logs/background_visual.png");
        
        // 比较两个图像
        if (originalImage != null && visualImage != null) {
            boolean imagesEqual = compareImages(originalImage, visualImage);
            System.out.println("两个图像是否相同: " + imagesEqual);
            
            if (!imagesEqual) {
                System.out.println("警告: Background和BackgroundVisual的图像不一致！");
            }
        }
    }
    
    @Test
    void testNullBackground() {
        System.out.println("=== 测试null Background处理 ===");
        
        assertThrows(IllegalArgumentException.class, () -> {
            new BackgroundVisual(null);
        }, "传入null Background应该抛出异常");
        
        System.out.println("null Background处理正确");
    }
    
    @Test
    void testBackgroundVisualState() throws IOException {
        System.out.println("=== 测试BackgroundVisual状态 ===");
        
        BackgroundVisual visual = new BackgroundVisual(testBackground);
        
        // 检查所有getter方法
        assertNotNull(visual.getBgImage(), "getBgImage()不应该返回null");
        assertNotNull(visual.getBackground(), "getBackground()不应该返回null");
        
        System.out.println("BackgroundVisual状态正常");
    }
    
    /**
     * 比较两个图像是否相同（用于诊断）
     */
    private boolean compareImages(BufferedImage img1, BufferedImage img2) {
        if (img1.getWidth() != img2.getWidth() || img1.getHeight() != img2.getHeight()) {
            return false;
        }
        
        for (int y = 0; y < img1.getHeight(); y++) {
            for (int x = 0; x < img1.getWidth(); x++) {
                if (img1.getRGB(x, y) != img2.getRGB(x, y)) {
                    return false;
                }
            }
        }
        return true;
    }
    
    /**
     * 深度诊断测试 - 检查BackgroundVisual的实现细节
     */
    @Test
    void testDeepDiagnosis() throws IOException {
        System.out.println("=== 深度诊断测试 ===");
        
        // 检查Background的实现
        System.out.println("Background类: " + testBackground.getClass().getName());
        System.out.println("Background图像路径: " + testBackground.getPath());
        
        // 创建BackgroundVisual
        BackgroundVisual visual = new BackgroundVisual(testBackground);
        
        // 检查getBgImage()的实现
        BufferedImage bgImage = visual.getBgImage();
        BufferedImage originalImage = testBackground.getImage();
        
        System.out.println("Background图像哈希: " + System.identityHashCode(originalImage));
        System.out.println("BackgroundVisual图像哈希: " + System.identityHashCode(bgImage));
        System.out.println("是否是同一个对象: " + (originalImage == bgImage));
        
        if (originalImage == bgImage) {
            System.out.println("INFO: BackgroundVisual直接返回了Background的图像引用");
        } else {
            System.out.println("INFO: BackgroundVisual创建了新的图像实例");
        }
    }
}