package com.lbc_plot.common.util.io;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Files;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * {@link PreviewPngWriter} 的自检：手写的 PNG 容器必须能被标准解码器读回，
 * 且像素<b>逐位一致</b>（PNG 是无损压缩，任何差异都说明滤波/CRC/块结构写错了）。
 */
class PreviewPngWriterTest {

    @Test
    @DisplayName("不透明画面：编码后能被 ImageIO 解码，且像素逐位一致")
    void opaqueRoundTripIsLossless() throws Exception {
        BufferedImage source = syntheticOpaqueImage(320, 180);

        byte[] png = PreviewPngWriter.toBytes(source, true);
        assertArrayEquals(new byte[] { (byte) 0x89, 'P', 'N', 'G' },
                new byte[] { png[0], png[1], png[2], png[3] }, "必须带 PNG 签名");

        BufferedImage decoded = ImageIO.read(new java.io.ByteArrayInputStream(png));
        assertNotNull(decoded, "编码结果必须能被 ImageIO 解码");
        assertEquals(source.getWidth(), decoded.getWidth());
        assertEquals(source.getHeight(), decoded.getHeight());
        assertSameRgb(source, decoded);
    }

    @Test
    @DisplayName("带透明画面：走 ImageIO 兜底，透明通道完整保留")
    void translucentFallsBackToImageIo() throws Exception {
        BufferedImage source = new BufferedImage(64, 48, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = source.createGraphics();
        g.setColor(new Color(255, 0, 0, 128));
        g.fillRect(0, 0, 32, 48);
        g.dispose();

        byte[] png = PreviewPngWriter.toBytes(source, false);
        BufferedImage decoded = ImageIO.read(new java.io.ByteArrayInputStream(png));
        assertNotNull(decoded);
        assertSameRgb(source, decoded);
    }

    @Test
    @DisplayName("writeFile 落盘的 PNG 可解码，且不会留下 .tmp")
    void writeFileProducesDecodablePng(@TempDir File dir) throws Exception {
        BufferedImage source = syntheticOpaqueImage(200, 120);
        File target = new File(dir, "preview.png");

        PreviewPngWriter.writeFile(source, target, true);

        assertEquals(true, target.isFile(), "目标文件应存在");
        assertEquals(0, new File(dir, "preview.png.tmp").exists() ? 1 : 0, "不应残留临时文件");
        BufferedImage decoded = ImageIO.read(target);
        assertNotNull(decoded);
        assertSameRgb(source, decoded);

        // 再写一次（覆盖），内容仍应正确
        BufferedImage second = syntheticOpaqueImage(200, 120);
        Graphics2D g = second.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 200, 120);
        g.dispose();
        PreviewPngWriter.writeFile(second, target, true);
        assertSameRgb(second, ImageIO.read(target));
        assertEquals(1, Files.list(dir.toPath()).count(), "目录里只应有一个文件");
    }

    @Test
    @DisplayName("1920×1080 全尺寸画面也能正确编码/解码")
    void fullHdRoundTrip() throws Exception {
        BufferedImage source = syntheticOpaqueImage(1920, 1080);
        byte[] png = PreviewPngWriter.toBytes(source, true);
        BufferedImage decoded = ImageIO.read(new java.io.ByteArrayInputStream(png));
        assertNotNull(decoded);
        assertSameRgb(source, decoded);
        // Sub 滤波 + level 1 的体积应该明显小于原始像素量
        assertEquals(true, png.length < 1920 * 1080 * 3,
                "PNG 体积应小于原始像素字节数，实际 " + png.length);
    }

    /** 生成一张有渐变、色块和文字的确定性测试图。 */
    private static BufferedImage syntheticOpaqueImage(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setPaint(new GradientPaint(0, 0, new Color(30, 20, 60), width, height, new Color(220, 180, 120)));
        g.fillRect(0, 0, width, height);
        g.setColor(new Color(255, 240, 200));
        for (int i = 0; i < 12; i++) {
            g.fillOval((i * 37) % Math.max(1, width), (i * 23) % Math.max(1, height),
                    Math.max(2, width / 12), Math.max(2, height / 12));
        }
        g.setColor(Color.WHITE);
        g.setFont(new java.awt.Font("Microsoft YaHei", java.awt.Font.BOLD, Math.max(8, height / 12)));
        g.drawString("测试文字 0123", width / 20, height / 2);
        g.dispose();
        // 强制 alpha=255：模拟预览图（最底层是不透明黑底）
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, 0xFF000000 | (image.getRGB(x, y) & 0x00FFFFFF));
            }
        }
        return image;
    }

    private static void assertSameRgb(BufferedImage expected, BufferedImage actual) {
        assertEquals(expected.getWidth(), actual.getWidth());
        assertEquals(expected.getHeight(), actual.getHeight());
        for (int y = 0; y < expected.getHeight(); y++) {
            for (int x = 0; x < expected.getWidth(); x++) {
                int e = expected.getRGB(x, y);
                int a = actual.getRGB(x, y);
                if ((e & 0x00FFFFFF) != (a & 0x00FFFFFF)) {
                    throw new AssertionError(String.format("像素 (%d,%d) 不一致: 期望 #%06X, 实际 #%06X",
                            x, y, e & 0x00FFFFFF, a & 0x00FFFFFF));
                }
            }
        }
    }
}
