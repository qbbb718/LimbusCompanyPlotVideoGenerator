package com.lbc_plot.common.util.io;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * {@link ImageCache} 的行为测试：命中复用、文件变更后失效、容量上限、解码失败不缓存。
 */
class ImageCacheTest {

    @TempDir
    File tempDir;

    @BeforeEach
    void setUp() {
        ImageCache.clear();
        // 命中/未命中计数是全局累计的：清空计数，避免受同一个 JVM 里其它测试影响
        ImageCache.resetStats();
        ImageCache.setMaxBytes(64L * 1024 * 1024);
    }

    @AfterEach
    void tearDown() {
        ImageCache.clear();
        ImageCache.setMaxBytes((long) ImageCache.DEFAULT_MAX_MB * 1024 * 1024);
    }

    @Test
    @DisplayName("同一文件第二次读取命中缓存，返回同一张图")
    void secondReadHitsCache() throws Exception {
        File file = writeImage("a.png", Color.RED, 64, 64);

        BufferedImage first = ImageReader.readImageFile(file);
        BufferedImage second = ImageReader.readImageFile(file);

        assertNotNull(first);
        assertSame(first, second, "同一文件在未变更时应复用同一张解码结果");
        assertEquals(1, ImageCache.stats().hits, "第二次读应算一次命中");
    }

    @Test
    @DisplayName("文件被覆盖后（大小或修改时间变化）缓存自动失效，读到新内容")
    void changedFileInvalidatesCache() throws Exception {
        File file = writeImage("b.png", Color.RED, 40, 40);
        BufferedImage before = ImageReader.readImageFile(file);
        assertEquals(0xFFFF0000, before.getRGB(5, 5), "初始应为红色");

        // 用一个尺寸不同的图覆盖：文件大小必然变化
        writeImageOver(file, Color.BLUE, 48, 48);
        BufferedImage afterSize = ImageReader.readImageFile(file);
        assertNotSame(before, afterSize, "文件大小变了，必须重新解码");
        assertEquals(0xFF0000FF, afterSize.getRGB(5, 5), "应读到覆盖后的蓝色");

        // 同尺寸覆盖，但把修改时间改掉：key 仍应变化
        writeImageOver(file, Color.GREEN, 48, 48);
        long bumped = file.lastModified() + 5000;
        assertTrue(file.setLastModified(bumped), "应能修改文件时间戳");
        BufferedImage afterTime = ImageReader.readImageFile(file);
        assertNotSame(afterSize, afterTime, "修改时间变了，必须重新解码");
        assertEquals(0xFF00FF00, afterTime.getRGB(5, 5), "应读到覆盖后的绿色");
    }

    @Test
    @DisplayName("超过容量上限时淘汰最久未使用的条目")
    void evictsWhenOverCapacity() throws Exception {
        ImageCache.clear();
        // 每张 512x512 ARGB ≈ 1MB；上限 4MB，最多放 4 张
        ImageCache.setMaxBytes(4L * 1024 * 1024);

        File first = writeImage("e1.png", Color.RED, 512, 512);
        BufferedImage keep = ImageReader.readImageFile(first);
        for (int i = 2; i <= 6; i++) {
            ImageReader.readImageFile(writeImage("e" + i + ".png", Color.BLUE, 512, 512));
        }

        ImageCache.Stats stats = ImageCache.stats();
        assertTrue(stats.entries <= 4, "条目数应被限制在上限内，实际: " + stats.entries);
        assertTrue(stats.bytes <= stats.maxBytes, "占用字节数不应超过上限");

        // 最久未使用的第一张应已被淘汰：再读一次会拿到新的实例
        BufferedImage reread = ImageReader.readImageFile(first);
        assertNotSame(keep, reread, "最久未使用的条目应已被淘汰");
    }

    @Test
    @DisplayName("解码失败不写缓存，仍然抛出带原因的异常")
    void failuresAreNotCached() throws Exception {
        File broken = new File(tempDir, "broken.png");
        Files.write(broken.toPath(), new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 });

        assertThrows(IOException.class, () -> ImageReader.readImageFile(broken));
        assertThrows(IOException.class, () -> ImageReader.readImageFile(broken));
        assertEquals(0, ImageCache.stats().entries, "失败的解码不应留下缓存条目");
    }

    @Test
    @DisplayName("缓存关闭时每次都重新解码，且不占用内存")
    void disabledCacheAlwaysDecodes() throws Exception {
        ImageCache.setMaxBytes(0);
        File file = writeImage("d.png", Color.RED, 32, 32);

        BufferedImage first = ImageReader.readImageFile(file);
        BufferedImage second = ImageReader.readImageFile(file);

        assertNotNull(first);
        assertNotSame(first, second, "缓存关闭时不应复用实例");
        assertEquals(0, ImageCache.stats().entries);
    }

    // ===== 辅助方法 =====

    private File writeImage(String name, Color color, int width, int height) throws IOException {
        File file = new File(tempDir, name);
        writeImageOver(file, color, width, height);
        return file;
    }

    private void writeImageOver(File file, Color color, int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, width, height);
        g.dispose();
        ImageIO.write(image, "png", file);
    }
}
