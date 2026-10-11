package com.lbc_plot.common.util.io;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

import com.lbc_plot.config.ProjectConfig;

/**
 * 针对两个已修复缺陷的回归测试：
 *
 * <ol>
 *   <li><b>WebP 立绘变红/半透明</b>：FFmpeg 以 BGRA 抓帧时，JavaCV 的
 *       {@code Java2DFrameConverter} 会把 BGRA 当成 ARGB 解读 —— 不透明像素
 *       （alpha=255）被读成“红色 + alpha≈8”。现在由
 *       {@link WebpImageDecoder} 自己按 BGRA 组装 ARGB。</li>
 *   <li><b>背景路径重复拼接</b>：数据库里存的是 URL（{@code /assets/backgrounds/x.png}），
 *       旧实现会拼成 {@code .../assets/backgrounds//assets/backgrounds/x.png}。</li>
 * </ol>
 */
class ImageReaderTest {

    /** 仓库内自带的 WebP 立绘样本（surefire 的工作目录固定为模块目录 demo/） */
    private static final Path WEBP_SAMPLE = Path.of("..", "输出测试", "立绘文件变红",
            "霍恩海姆-鸟-default.webp");

    // ---------------- 1. WebP 解码 ----------------

    @Test
    void imageIoDoesNotSupportWebpSoFfmpegFallbackIsRequired() throws Exception {
        File sample = webpSample();
        // 前提校验：Java 21 的 ImageIO 读不了 WebP，这正是必须走 FFmpeg 的原因
        assertNull(ImageIO.read(sample), "ImageIO 竟然能读 WebP，本测试前提已失效");
    }

    @Test
    void webpDecodeKeepsOpaqueAlphaAndChannelOrder() throws Exception {
        BufferedImage image = WebpImageDecoder.decodeWithFfmpeg(webpSample());
        assertNotNull(image, "FFmpeg 应能解码 WebP");

        // 源图四个角是透明背景 -> alpha 必须为 0；若通道错位会变成“红=0、alpha=0”的巧合，
        // 因此下面还要验证不透明区域。
        assertEquals(0, alphaAt(image, 5, 5), "左上角应为全透明");
        assertEquals(0, alphaAt(image, image.getWidth() - 5, 5), "右上角应为全透明");

        // 不透明区域取样：找到 alpha=255 的像素，确认它不是“红色 + 低 alpha”
        int[] opaquePoint = findOpaquePixel(image);
        assertNotNull(opaquePoint, "图像中应存在不透明像素");
        int argb = image.getRGB(opaquePoint[0], opaquePoint[1]);
        int a = (argb >>> 24) & 0xFF;
        int r = (argb >> 16) & 0xFF;
        int g = (argb >> 8) & 0xFF;
        int b = argb & 0xFF;

        assertEquals(255, a, "不透明像素的 alpha 必须为 255（旧实现会错读成个位数）");
        // 旧实现的症状是“红通道被放大、绿蓝被吃掉”，这里用宽松阈值锁死该回归
        assertTrue(r < 200 || g > 150 || b > 150,
                "不透明像素不应呈现被压成纯红的错误配色, 实际 RGB=(" + r + "," + g + "," + b + ")");
    }

    @Test
    void decodedWebpHasMeaningfulAlphaCoverage() throws Exception {
        BufferedImage image = WebpImageDecoder.decodeWithFfmpeg(webpSample());
        assertNotNull(image);

        int opaque = 0;
        int transparent = 0;
        for (int y = 0; y < image.getHeight(); y += 3) {
            for (int x = 0; x < image.getWidth(); x += 3) {
                int a = alphaAt(image, x, y);
                if (a == 255) {
                    opaque++;
                } else if (a == 0) {
                    transparent++;
                }
            }
        }
        assertTrue(opaque > 0, "裁剪依赖 alpha，必须存在完全不透明的立绘像素");
        assertTrue(transparent > 0, "WebP 背景应保持透明，供 ImageCropper 裁剪");
    }

    @Test
    void decodeWebpBytesMatchesFileDecode() throws Exception {
        File sample = webpSample();
        byte[] bytes = Files.readAllBytes(sample.toPath());

        BufferedImage fromBytes = WebpImageDecoder.decodeWebpBytes(bytes, "in-memory");
        assertNotNull(fromBytes, "字节流路径也应能解码 WebP");
        assertEquals(alphaAt(WebpImageDecoder.decodeWithFfmpeg(sample), 5, 5),
                alphaAt(fromBytes, 5, 5));

        // 非 WebP 字节不应被误当成 WebP 处理
        assertNull(WebpImageDecoder.decodeWebpBytes(new byte[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12}, "junk"));
    }

    // ---------------- 2. 背景路径解析 ----------------

    @Test
    void urlStyleBackgroundPathIsNotPrefixedTwice() {
        String url = "/assets/backgrounds/办公室_1791465458644.png";

        File resolved = ImageReader.resolveBackgroundFile(url);
        String normalized = resolved.getAbsolutePath().replace('\\', '/');

        assertEquals(ProjectConfig.BACKGROUNDS_PATH + "办公室_1791465458644.png", normalized,
                "URL 形式路径应直接锚定到配置目录，而不是再拼一次 /assets/backgrounds/");
        assertTrue(!normalized.contains("backgrounds//assets"),
                "解析结果不应出现重复拼接: " + normalized);
    }

    @Test
    void backgroundPathFormsAllResolveToSameFile() {
        String name = "办公室_1791465458644.png";
        String expected = ProjectConfig.BACKGROUNDS_PATH + name;

        assertEquals(expected, portable(ImageReader.resolveBackgroundFile(name)), "裸文件名");
        assertEquals(expected, portable(ImageReader.resolveBackgroundFile("/assets/backgrounds/" + name)), "URL 形式");
        assertEquals(expected, portable(ImageReader.resolveBackgroundFile("assets/backgrounds/" + name)), "无前导斜杠");
        assertEquals(expected, portable(ImageReader.resolveBackgroundFile("backgrounds/" + name)), "仅目录名");
        assertEquals(expected, portable(ImageReader.resolveBackgroundFile("./assets/backgrounds/" + name)), "./ 前缀");
        assertEquals(expected, portable(ImageReader.resolveBackgroundFile(
                ProjectConfig.BACKGROUNDS_PATH + name)), "已是绝对路径");
    }

    @Test
    void characterPathFormsAllResolveToSameFile() {
        String name = "char_1786066886658/portrait_1786072744945.png";
        String expected = ProjectConfig.CHARACTERS_PATH + name;

        assertEquals(expected, portable(ImageReader.resolveCharacterFile(name)), "相对角色目录");
        assertEquals(expected, portable(ImageReader.resolveCharacterFile("/assets/characters/" + name)), "URL 形式");
        assertEquals(expected, portable(ImageReader.resolveCharacterFile("characters/" + name)), "仅目录名");
    }

    @Test
    void urlStyleBackgroundPathIsReadableFromDisk() throws Exception {
        // 在真实素材目录里放一个临时 PNG，验证 readBackGround 能吃 URL 形式路径
        File dir = new File(ProjectConfig.BACKGROUNDS_PATH);
        assertTrue(dir.isDirectory(), "测试素材目录应存在: " + dir.getAbsolutePath());

        String fileName = "lbc_test_bg_" + System.nanoTime() + ".png";
        File target = new File(dir, fileName);
        BufferedImage source = new BufferedImage(4, 4, BufferedImage.TYPE_INT_ARGB);
        source.setRGB(0, 0, 0xFF3366CC);
        try {
            ImageIO.write(source, "png", target);

            BufferedImage viaUrl = ImageReader.readBackGround("/assets/backgrounds/" + fileName);
            assertNotNull(viaUrl, "URL 形式路径应能读到文件");
            assertEquals(0xFF3366CC, viaUrl.getRGB(0, 0));

            BufferedImage viaName = ImageReader.readBackGround(fileName);
            assertEquals(0xFF3366CC, viaName.getRGB(0, 0));

            assertTrue(ImageReader.assetExists("/assets/backgrounds/" + fileName,
                    ProjectConfig.BACKGROUNDS_PATH, "backgrounds"));
        } finally {
            Files.deleteIfExists(target.toPath());
        }
    }

    @Test
    void missingBackgroundStillThrowsWithCandidateList() {
        IOException thrown = org.junit.jupiter.api.Assertions.assertThrows(IOException.class,
                () -> ImageReader.readBackGround("/assets/backgrounds/definitely_missing_xyz.png"));
        assertTrue(thrown.getMessage().contains("背景图片未找到"), thrown.getMessage());
        assertTrue(!thrown.getMessage().contains("backgrounds//assets"),
                "错误信息里不应出现重复拼接路径: " + thrown.getMessage());
    }

    // ---------------- 辅助 ----------------

    private static File webpSample() {
        File sample = WEBP_SAMPLE.toFile();
        assertTrue(sample.isFile(), "缺少 WebP 样本: " + sample.getAbsolutePath());
        return sample;
    }

    private static String portable(File file) {
        return file.getAbsolutePath().replace('\\', '/');
    }

    private static int alphaAt(BufferedImage image, int x, int y) {
        return (image.getRGB(x, y) >>> 24) & 0xFF;
    }

    /** 从图像中部开始找出第一个完全不透明的像素 */
    private static int[] findOpaquePixel(BufferedImage image) {
        for (int y = 0; y < image.getHeight(); y += 2) {
            for (int x = 0; x < image.getWidth(); x += 2) {
                if (alphaAt(image, x, y) == 255) {
                    return new int[] {x, y};
                }
            }
        }
        return null;
    }
}
