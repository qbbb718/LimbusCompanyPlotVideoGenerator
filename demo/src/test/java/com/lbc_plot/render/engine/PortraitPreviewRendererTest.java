package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Path;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.resource.model.Background;

/**
 * 立绘场景预览的渲染测试。
 *
 * <p>验证的是「资源管理 → 角色 → 编辑立绘 → 预览」这条链路的核心构图：
 * <ul>
 *   <li>画面四周是 10% 黑边（与视频一致），背景不铺到画布边缘；</li>
 *   <li>背景按 80% 场景区域等比铺开；</li>
 *   <li>立绘按角色身高与裁剪框缩放、定位，出现在画面中间；</li>
 *   <li>不渲染台词/角色名片（本类只对像素取样，名称/名片缺失由
 *       {@link RenderOfImage#renderPreExceptDialogue} 的既有测试覆盖）。</li>
 * </ul>
 */
class PortraitPreviewRendererTest {

    /** 立绘颜色：纯绿，方便与蓝色背景区分 */
    private static final Color PORTRAIT_COLOR = new Color(0, 200, 0);
    /** 背景颜色：纯蓝 */
    private static final Color BACKGROUND_COLOR = new Color(0, 0, 200);
    /** 黑边颜色容差：PNG 无损，理论上就是 0 */
    private static final int BLACK_TOLERANCE = 8;

    @Test
    @DisplayName("立绘预览：1080p 下背景在场景内、立绘居中、四周为黑边")
    void rendersPortraitInsideBackgroundAndBorder(@TempDir Path tempDir) throws Exception {
        BufferedImage portrait = solidImage(300, 600, PORTRAIT_COLOR);
        Background background = solidBackground(tempDir, 800, 450, BACKGROUND_COLOR);

        BufferedImage preview = PortraitPreviewRenderer.render(
                portrait,
                0, 0, ProjectConfig.DEFAULT_CHARACTER_HEAD_LENGTH,
                0, 0,
                ProjectConfig.DEFAULT_CHARACTER_HEIGHT,
                background,
                "预览背景",
                ProjectConfig.VIDEO_WIDTH,
                ProjectConfig.VIDEO_HEIGHT);

        assertEquals(ProjectConfig.VIDEO_WIDTH, preview.getWidth(), "预览宽度应等于设计画布宽度");
        assertEquals(ProjectConfig.VIDEO_HEIGHT, preview.getHeight(), "预览高度应等于设计画布高度");

        assertBackgroundTint(preview, 300, 400, "左侧背景区域应为背景色");
        assertColorNear(preview, 1000, 400, PORTRAIT_COLOR, "画面中央应出现立绘");
        assertBlack(preview, 1850, 50, "右上方超出 80% 场景区域，应为黑边");
        assertBlack(preview, 50, 1000, "左下角超出 80% 场景区域，应为黑边");
    }

    @Test
    @DisplayName("立绘预览：输出分辨率变化时构图等比缩放")
    void scalesCompositionWithOutputResolution(@TempDir Path tempDir) throws Exception {
        BufferedImage portrait = solidImage(300, 600, PORTRAIT_COLOR);
        Background background = solidBackground(tempDir, 800, 450, BACKGROUND_COLOR);

        BufferedImage preview = PortraitPreviewRenderer.render(
                portrait,
                0, 0, ProjectConfig.DEFAULT_CHARACTER_HEAD_LENGTH,
                0, 0,
                ProjectConfig.DEFAULT_CHARACTER_HEIGHT,
                background,
                "预览背景",
                960, 540);

        assertEquals(960, preview.getWidth());
        assertEquals(540, preview.getHeight());

        assertBackgroundTint(preview, 150, 200, "缩放后左侧仍应为背景色");
        assertColorNear(preview, 500, 200, PORTRAIT_COLOR, "缩放后中央仍应为立绘");
        assertBlack(preview, 925, 25, "缩放后右上方仍应为黑边");
    }

    /** 生成一张纯色、不透明的测试图 */
    private static BufferedImage solidImage(int width, int height, Color color) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, width, height);
        g.dispose();
        return image;
    }

    /** 把纯色背景写到临时目录，再按磁盘路径构造 Background（走真实的图片加载路径） */
    private static Background solidBackground(Path dir, int width, int height, Color color) throws Exception {
        File file = dir.resolve("preview-background.png").toFile();
        ImageIO.write(solidImage(width, height, color), "PNG", file);
        Background background = new Background(file.getAbsolutePath(), "预览背景");
        assertTrue(background.getImage() != null, "测试背景应能加载");
        return background;
    }

    /** 像素颜色近似判断（允许缩放插值带来的少量偏差） */
    private static void assertColorNear(BufferedImage image, int x, int y, Color expected, String message) {
        Color actual = new Color(image.getRGB(x, y), true);
        assertTrue(Math.abs(actual.getRed() - expected.getRed()) <= 3
                        && Math.abs(actual.getGreen() - expected.getGreen()) <= 3
                        && Math.abs(actual.getBlue() - expected.getBlue()) <= 3,
                message + "：期望 " + expected + "，实际 " + actual);
    }

    /**
     * 背景色判断：画面四周压着一圈黑色渐变遮罩（见 {@link RenderOfImage} 的遮罩参数），
     * 所以靠近边缘的取样点会比背景原色更暗。这里只要求"仍然是背景那个色相，且不会比原色更亮"。
     *
     * <p>遮罩本身的不透明度曲线由 {@link BorderMaskProfileTest} 单独盯着，这里只负责构图。
     */
    private static void assertBackgroundTint(BufferedImage image, int x, int y, String message) {
        Color actual = new Color(image.getRGB(x, y), true);
        assertTrue(actual.getBlue() > actual.getRed() + 40 && actual.getBlue() > actual.getGreen() + 40,
                message + "：应仍是蓝色背景（不能是黑边或立绘），实际 " + actual);
        assertTrue(actual.getBlue() <= BACKGROUND_COLOR.getBlue(),
                message + "：遮罩只压暗不加亮，实际 " + actual);
    }

    /** 黑边判断 */
    private static void assertBlack(BufferedImage image, int x, int y, String message) {
        Color actual = new Color(image.getRGB(x, y), true);
        assertTrue(actual.getRed() <= BLACK_TOLERANCE
                        && actual.getGreen() <= BLACK_TOLERANCE
                        && actual.getBlue() <= BLACK_TOLERANCE,
                message + "：实际 " + actual);
    }
}
