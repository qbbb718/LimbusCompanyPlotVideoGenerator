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

    /**
     * WebP 立绘样本。
     *
     * <p>优先用<b>随测试一起提交</b>的样本（{@code src/test/resources/fixtures/webp/}）：
     * 之前这里指向 {@code 输出测试/} 下的文件，而该目录被 {@code .gitignore} 忽略，
     * 换台机器/CI 上文件必然不存在 —— 测试直接红，等于这几个回归用例根本没在跑。
     * 本地若还留着老样本，仍然可以回退到它，保证老工作区不受影响。
     */
    private static final String SAMPLE_RESOURCE = "fixtures/webp/portrait-alpha.webp";
    private static final Path LEGACY_WEBP_SAMPLE = Path.of("..", "输出测试", "立绘文件变红",
            "霍恩海姆-鸟-default.webp");

    // ---------------- 1. WebP 解码 ----------------

    /**
     * 回归护栏：安装版立绘变红方块的真实根因是 FFmpeg 原生库（JavaCV/JavaCPP）没能加载。
     * 原生库一旦初始化失败，JVM 会缓存失败状态，之后 WebP 解码一律只报
     * {@code NoClassDefFoundError: Could not initialize class org.bytedeco...}，
     * 真正的 UnsatisfiedLinkError 被掩盖。这里直接断言原生库可用 + 预热路径成功。
     */
    @Test
    void ffmpegNativesAreUsable() {
        assertTrue(NativeLibraryBootstrap.warmUp(),
                "FFmpeg 原生库应可用；失败时 warmUp 的 ERROR 日志里会有完整 cause 链");
        assertNull(NativeLibraryBootstrap.getLastFailure());
    }

    /**
     * 回归护栏：预热必须把 JavaCPP 缓存目录固定到一个真实可写目录。
     *
     * <p>默认目录是 JVM 临时目录下的 {@code javacpp/}，会被系统清理策略波及；
     * 一旦删掉一半（DLL 还在、依赖没了）DLL 就再也加载不起来，
     * 表现就是立绘全红。这里锁死“目录已显式指定且真实存在”。
     */
    @Test
    void warmUpPinsJavaCppCacheDirToRealDirectory() {
        NativeLibraryBootstrap.warmUp();
        String cacheDir = System.getProperty("org.bytedeco.javacpp.cachedir");
        assertNotNull(cacheDir, "预热后 JavaCPP 缓存目录必须已被显式指定");
        assertTrue(new File(cacheDir).isDirectory(), "缓存目录必须真实存在: " + cacheDir);
        assertTrue(!cacheDir.contains("javacpp\\cache") && !cacheDir.contains("javacpp/cache"),
                "不应继续使用 JavaCPP 默认的临时目录布局: " + cacheDir);
    }

    @Test
    void imageIoDoesNotSupportWebpSoFfmpegFallbackIsRequired() throws Exception {
        File sample = webpSample();
        // 前提校验：Java 21 的 ImageIO 读不了 WebP，这正是必须走 FFmpeg 的原因
        assertNull(ImageIO.read(sample), "ImageIO 竟然能读 WebP，本测试前提已失效");
    }

    /**
     * 解码成功后必须清掉“上次失败原因”，否则一次偶发失败会永久污染后续报错文案。
     */
    @Test
    void successfulDecodeClearsRecordedFailure() throws Exception {
        WebpImageDecoder.decodeWithFfmpeg(webpSample());
        assertNull(WebpImageDecoder.getLastFailure(), "成功的解码不应留下失败原因");
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

    /**
     * 回归护栏：解码失败时 {@link ImageReader#readImageFile} 必须<b>抛出</b>带原因的
     * IOException，而不是返回 null。
     *
     * <p>旧实现返回 null，上层只能留下“读不出来”这一句，根因（原生库不可用、文件损坏）
     * 就此丢失，用户看到的就是红色“加载失败”占位图而毫无线索。
     */
    @Test
    void undecodableWebpThrowsWithReasonInsteadOfReturningNull() throws Exception {
        // 头部是合法 RIFF/WEBP（会走 WebP 分支），但内容不是有效图像
        byte[] broken = new byte[64];
        System.arraycopy("RIFF".getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, broken, 0, 4);
        System.arraycopy("WEBP".getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, broken, 8, 4);
        broken[12] = 'V'; broken[13] = 'P'; broken[14] = '8'; broken[15] = ' ';

        Path temp = Files.createTempFile("lbc-broken-", ".webp");
        try {
            Files.write(temp, broken);
            IOException thrown = org.junit.jupiter.api.Assertions.assertThrows(IOException.class,
                    () -> ImageReader.readImageFile(temp.toFile()));
            assertTrue(thrown.getMessage().contains("WebP 图片解码失败"),
                    "报错必须说明是 WebP 解码失败: " + thrown.getMessage());
            assertTrue(thrown.getMessage().contains("ImageIO 不支持 WebP"),
                    "报错必须解释为什么一定要走 FFmpeg: " + thrown.getMessage());
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    /**
     * 真实 WebP 走文件入口时不应抛错：确认上面新增的报错分支没有误伤正常文件。
     */
    @Test
    void realWebpFileStillDecodesThroughFileEntryPoint() throws Exception {
        BufferedImage image = ImageReader.readImageFile(webpSample());
        assertNotNull(image, "正常 WebP 必须能从统一读图入口读出来");
        assertTrue(image.getWidth() > 0 && image.getHeight() > 0);
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

    private static File webpSample() throws Exception {
        // 1) 随测试提交的样本（唯一的可靠来源）
        java.net.URL resource = ImageReaderTest.class.getClassLoader().getResource(SAMPLE_RESOURCE);
        if (resource != null && "file".equals(resource.getProtocol())) {
            File fromClasspath = new File(resource.toURI());
            if (fromClasspath.isFile()) {
                return fromClasspath;
            }
        }
        // 2) 本地历史样本（未提交，仅老工作区有）
        File legacy = LEGACY_WEBP_SAMPLE.toFile();
        if (legacy.isFile()) {
            return legacy;
        }
        throw new IllegalStateException("缺少 WebP 样本，classpath 资源 " + SAMPLE_RESOURCE
                + " 与本地样本 " + legacy.getAbsolutePath() + " 都不存在");
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
