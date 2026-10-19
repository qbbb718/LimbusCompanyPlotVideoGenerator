package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.io.File;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.BackgroundVisual;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.resource.model.Background;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

/**
 * 背景 / 立绘缩放与位置的渲染级验证（不只测换算，而是真的画出来看像素落点）。
 *
 * <p>用合成图（黑底白方块 / 透明底红方块）避免依赖素材库；渲染走与成片完全相同的
 * {@link RenderOfImage#renderBackgroundOnly} / {@link RenderOfImage#renderCharactersOnly}。
 * 渲染结果会另存到 {@code target/test-logs/zoom-*.png}，排查构图问题时可以直接打开看。
 */
class ZoomTransformRenderingTest {

    private static final int WIDTH = 1920;
    private static final int HEIGHT = 1080;
    private static final File LOG_DIR = new File("target/test-logs");

    /** 黑底 + 居中 100×100 白方块，用来追踪背景缩放/位移后的落点。 */
    private static BufferedImage backgroundProbe() {
        BufferedImage image = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.BLACK);
        g.fillRect(0, 0, WIDTH, HEIGHT);
        g.setColor(Color.WHITE);
        g.fillRect(WIDTH / 2 - 50, HEIGHT / 2 - 50, 100, 100);
        g.dispose();
        return image;
    }

    private static Record backgroundRecord(BufferedImage image, float scale, int posX, int posY) {
        BackgroundVisual visual = new BackgroundVisual();
        // 只用于日志/地点名，真实图像由 setBgImage 注入（不读盘）
        visual.setBackground(new Background("test_bg.png", "测试背景"));
        visual.setBgImage(image);
        visual.setScale(scale);
        visual.setPosX(posX);
        visual.setPosY(posY);

        return new Record.Builder()
                .uuid("zoom-bg")
                .dialogue(Dialogue.builder().speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .addBackground(visual)
                .build();
    }

    private static BufferedImage renderBackground(Record record, String fileName) throws Exception {
        BufferedImage image = RenderOfImage.renderBackgroundOnly(record, false, WIDTH, HEIGHT);
        save(image, fileName);
        return image;
    }

    /** 透明底 + 脸框中心 20×20 红方块，用来追踪立绘缩放中心与大小。 */
    private static BufferedImage portraitProbe() {
        BufferedImage image = new BufferedImage(400, 400, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.RED);
        // 脸框（faceX=0,faceY=0,length=183）的中心是 (91.5,91.5)，方块中心对齐到 (92,92)
        g.fillRect(82, 82, 20, 20);
        g.dispose();
        return image;
    }

    private static Record characterRecord(float userScale) throws Exception {
        MyCharacter character = MyCharacter.builder()
                .characterID("c-test")
                .characterName("测试角色")
                .height(171)
                .faction("未设定")
                .build();
        Portrait portrait = Portrait.builder("")
                .portraitID("p-test")
                .characterID("c-test")
                .imagePath("")
                .portName("测试立绘")
                .facePosition(0, 0)
                .length(183)
                .image(portraitProbe())
                .build();

        CharacterVisual visual = CharacterVisual.builder(character, portrait)
                .scale(userScale)
                .bright()
                .build();

        return new Record.Builder()
                .uuid("zoom-char")
                .dialogue(Dialogue.builder().speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .addCharacter(visual)
                .build();
    }

    private static BufferedImage renderCharacters(Record record, String fileName) throws Exception {
        BufferedImage image = RenderOfImage.renderCharactersOnly(record, WIDTH, HEIGHT);
        save(image, fileName);
        return image;
    }

    private static void save(BufferedImage image, String fileName) throws Exception {
        if (!LOG_DIR.exists() && !LOG_DIR.mkdirs()) {
            throw new IllegalStateException("无法创建测试输出目录: " + LOG_DIR.getAbsolutePath());
        }
        ImageIO.write(image, "PNG", new File(LOG_DIR, fileName));
    }

    /** 统计与 target 颜色足够接近的像素包围盒；没有命中时返回 null。 */
    private static Rectangle colorBounds(BufferedImage image, Color target, int tolerance) {
        int minX = Integer.MAX_VALUE, minY = Integer.MAX_VALUE;
        int maxX = Integer.MIN_VALUE, maxY = Integer.MIN_VALUE;
        int found = 0;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int argb = image.getRGB(x, y);
                int alpha = (argb >>> 24) & 0xFF;
                if (alpha == 0) {
                    continue;
                }
                int r = (argb >> 16) & 0xFF;
                int g = (argb >> 8) & 0xFF;
                int b = argb & 0xFF;
                if (Math.abs(r - target.getRed()) <= tolerance
                        && Math.abs(g - target.getGreen()) <= tolerance
                        && Math.abs(b - target.getBlue()) <= tolerance) {
                    found++;
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        if (found == 0) {
            return null;
        }
        return new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
    }

    @Test
    @DisplayName("背景 scale=2：以画面中心为基准放大，白方块范围随之翻倍")
    void backgroundScaleZoomsAroundCenter() throws Exception {
        BufferedImage normal = renderBackground(
                backgroundRecord(backgroundProbe(), 1.0f, 0, 0), "zoom-bg-scale1.png");
        BufferedImage zoomed = renderBackground(
                backgroundRecord(backgroundProbe(), 2.0f, 0, 0), "zoom-bg-scale2.png");

        Rectangle normalProbe = colorBounds(normal, Color.WHITE, 10);
        Rectangle zoomedProbe = colorBounds(zoomed, Color.WHITE, 10);
        assertTrue(normalProbe != null && zoomedProbe != null, "两种缩放下都应能看到白色探针");

        assertEquals(100, normalProbe.width, 2, "scale=1 时白方块应保持 100px");
        assertEquals(200, zoomedProbe.width, 3, "scale=2 时白方块应放大到 200px");
        assertEquals(normalProbe.getCenterX(), zoomedProbe.getCenterX(), 2.0,
                "缩放应围绕画面中心，探针中心不应漂移");
        assertEquals(normalProbe.getCenterY(), zoomedProbe.getCenterY(), 2.0);
    }

    @Test
    @DisplayName("背景位置偏移：0 = 居中，正值把背景往右/下推")
    void backgroundPositionOffsetsImage() throws Exception {
        BufferedImage shifted = renderBackground(
                backgroundRecord(backgroundProbe(), 1.0f, 300, 120), "zoom-bg-offset.png");

        Rectangle probe = colorBounds(shifted, Color.WHITE, 10);
        assertTrue(probe != null, "偏移后仍应看到白色探针");
        assertEquals(WIDTH / 2 + 300, probe.getCenterX(), 2.0, "白方块应右移 300px");
        assertEquals(HEIGHT / 2 + 120, probe.getCenterY(), 2.0, "白方块应下移 120px");
    }

    @Test
    @DisplayName("位置不设上下限：偏移足够大时背景可以完全移出画面（整层透明）")
    void backgroundCanBePushedCompletelyOut() throws Exception {
        BufferedImage empty = renderBackground(
                backgroundRecord(backgroundProbe(), 1.0f, WIDTH, 0), "zoom-bg-pushed-out.png");

        assertEquals(0, ((empty.getRGB(WIDTH / 2, HEIGHT / 2) >>> 24) & 0xFF),
                "背景完全移出后画布中心应透明（成片里会露出黑底）");
    }

    @Test
    @DisplayName("立绘 scale=2：脸框中心不动，探针尺寸翻倍")
    void characterScaleZoomsAroundFaceCenter() throws Exception {
        BufferedImage normal = renderCharacters(characterRecord(1.0f), "zoom-char-scale1.png");
        BufferedImage zoomed = renderCharacters(characterRecord(2.0f), "zoom-char-scale2.png");

        Rectangle normalProbe = colorBounds(normal, Color.RED, 20);
        Rectangle zoomedProbe = colorBounds(zoomed, Color.RED, 20);
        assertTrue(normalProbe != null && zoomedProbe != null, "两种缩放下都应能看到红色探针");

        assertEquals(20, normalProbe.width, 2, "scale=1 时探针应保持原大小");
        // 双三次插值会让纯色边缘扩散几像素，尺寸断言留出插值余量
        assertEquals(40, zoomedProbe.width, 6, "scale=2 时探针应放大一倍");
        assertEquals(normalProbe.getCenterX(), zoomedProbe.getCenterX(), 2.0,
                "缩放以脸框中心为基准，探针中心不应漂移");
        assertEquals(normalProbe.getCenterY(), zoomedProbe.getCenterY(), 2.0);
    }
}
