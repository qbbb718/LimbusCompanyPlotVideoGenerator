package com.lbc_plot.resource.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.stream.Stream;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import com.lbc_plot.config.AppConfig;

/**
 * WebP 立绘在<b>入库时</b>转成 PNG 的回归护栏。
 *
 * <h2>为什么要有入库转换</h2>
 * 用户报的"立绘显示为红色『加载失败』方块"，本质是：WebP 在 Java 21 上只能靠 FFmpeg
 * 原生库解码，而原流程是<b>先按原字节存盘、等渲染时才解码</b> —— 原生库一旦不可用，
 * 上传照样"成功"、数据库记录照样写入，直到预览/导出时才集体变成红方块，用户完全不知道
 * 是哪一步坏的。改成入库时转换后，故障点被压缩成"单次上传、当场报错"，而渲染读到的
 * 永远是 JDK 自带解码器就能处理的 PNG。
 *
 * <p>这条测试锁住四件事：
 * <ol>
 *   <li>WebP 上传后落盘的是 PNG（扩展名与真实格式都是 PNG）；</li>
 *   <li>PNG 里的 alpha 与通道顺序与原图一致（立绘靠 alpha 裁剪，错了就废）；</li>
 *   <li>原 WebP 被备份下来（转换可回退）；</li>
 *   <li>解不出来的 WebP <b>当场抛异常且不留任何文件</b>（不允许再出现"存进去了但读不出来"）。</li>
 * </ol>
 *
 * <p>用 Mockito 顶掉 {@link CharacterFolderService}：它要查数据库才能解析角色目录名，
 * 而这里要测的是文件落盘行为，不该依赖 DB。素材目录走 Spring 环境里真实的
 * {@link AppConfig}（测试期由 surefire 的 {@code lbc.data.dir} 指向 demo/）。
 */
@SpringBootTest(classes = com.lbc_plot.config.Application.class)
class PortraitImportConversionTest {

    private static final String PORTRAIT_ID = "portrait_import_test";
    private static final String FOLDER_NAME = "char_import_test";
    private static final String SAMPLE_RESOURCE = "fixtures/webp/portrait-alpha.webp";

    @Autowired
    private StorageService storageService;

    @Autowired
    private AppConfig appConfig;

    private File characterDir;

    @BeforeEach
    void setUp() {
        // 目录名解析交给真实的 CharacterFolderService 会去查库；这里固定成测试目录
        characterDir = new File(appConfig.getAssets().getCharacters(), FOLDER_NAME);
        deleteRecursively(characterDir.toPath());

        CharacterFolderService folderService = org.mockito.Mockito.mock(CharacterFolderService.class);
        when(folderService.resolveOrCreateFolder(anyString())).thenReturn(FOLDER_NAME);
        when(folderService.getCharacterDir(anyString())).thenReturn(characterDir);
        ReflectionTestUtils.setField(storageService, "characterFolderService", folderService);
    }

    @AfterEach
    void tearDown() {
        deleteRecursively(characterDir.toPath());
    }

    @Test
    void webpPortraitIsStoredAsPngWithOriginalBackedUp() throws Exception {
        byte[] webp = readSampleWebp();
        MockMultipartFile upload = new MockMultipartFile("file", "portrait.webp", "image/webp", webp);

        StorageService.PortraitUploadResult result =
                storageService.uploadPortraitFile(upload, "char_x", PORTRAIT_ID, "normal");

        // 1) 数据库/前端拿到的是 .png 路径（相对角色目录，供 /assets/** 拼接）
        assertEquals(FOLDER_NAME + "/" + PORTRAIT_ID + ".png", result.getImagePath(),
                "WebP 入库后应当返回 PNG 路径，否则前端与 DB 会指向一个不再存在的 .webp 文件");

        File png = new File(characterDir, PORTRAIT_ID + ".png");
        assertTrue(png.isFile(), "转换后的 PNG 应当落盘: " + png.getAbsolutePath());

        // 2) 磁盘上不能再留一个同名的 .webp（否则读取路径会随机命中旧文件）
        assertFalse(new File(characterDir, PORTRAIT_ID + ".webp").exists(),
                "不应同时留下未转换的 .webp 主文件");

        // 3) 落盘文件必须是真的 PNG，且 ImageIO（JDK 自带，无原生依赖）能直接读
        assertTrue(isPng(png), "落盘文件必须是真正的 PNG（按魔数判断，不看扩展名）");
        BufferedImage decoded = ImageIO.read(png);
        assertNotNull(decoded, "PNG 必须能被 JDK 自带解码器读出 —— 这正是入库转换的全部意义");

        // 4) alpha 与通道顺序：源图四角透明、存在完全不透明像素
        assertEquals(0, alphaAt(decoded, 5, 5), "左上角应保持全透明");
        assertEquals(0, alphaAt(decoded, decoded.getWidth() - 5, 5), "右上角应保持全透明");
        assertTrue(solidPixelCount(decoded) > 0, "应当存在完全不透明的立绘像素（alpha=255）");

        // 5) 原图备份：内容必须与上传字节完全一致，且保留原扩展名
        File backup = new File(new File(characterDir, StorageService.ORIGINAL_BACKUP_DIR),
                PORTRAIT_ID + ".webp");
        assertTrue(backup.isFile(), "原 WebP 必须被备份，转换才有回退余地: " + backup.getAbsolutePath());
        assertArrayEqualsMessage(webp, Files.readAllBytes(backup.toPath()));
    }

    @Test
    void pngPortraitIsStoredAsIsWithoutBackup() throws Exception {
        // 非 WebP 走原逻辑：原字节存盘、不做转换、不产生备份（避免凭空多一份文件）
        byte[] png = createPngBytes();
        MockMultipartFile upload = new MockMultipartFile("file", "portrait.png", "image/png", png);

        StorageService.PortraitUploadResult result =
                storageService.uploadPortraitFile(upload, "char_x", PORTRAIT_ID, "normal");

        assertEquals(FOLDER_NAME + "/" + PORTRAIT_ID + ".png", result.getImagePath());
        File stored = new File(characterDir, PORTRAIT_ID + ".png");
        assertTrue(stored.isFile());
        assertArrayEqualsMessage(png, Files.readAllBytes(stored.toPath()), "非 WebP 应当按原字节存盘");

        File backupDir = new File(characterDir, StorageService.ORIGINAL_BACKUP_DIR);
        assertFalse(backupDir.exists(), "非 WebP 不应产生原图备份");
    }

    @Test
    void undecodableWebpIsRejectedWithoutLeavingFiles() throws Exception {
        // 合法 RIFF/WEBP 魔数 + 垃圾内容：会被识别成 WebP，但解不出像素
        byte[] broken = new byte[64];
        System.arraycopy("RIFF".getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, broken, 0, 4);
        System.arraycopy("WEBP".getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, broken, 8, 4);
        broken[12] = 'V'; broken[13] = 'P'; broken[14] = '8'; broken[15] = ' ';

        MockMultipartFile upload = new MockMultipartFile("file", "broken.webp", "image/webp", broken);

        IOException thrown = assertThrows(IOException.class,
                () -> storageService.uploadPortraitFile(upload, "char_x", PORTRAIT_ID, "normal"),
                "解不出来的 WebP 必须当场拒绝，而不是存下来等渲染时变红方块");
        assertTrue(thrown.getMessage().contains("无法解码"),
                "报错要说清是解码失败: " + thrown.getMessage());

        // 关键：失败时不能留下任何"看起来存在、其实读不出来"的文件
        try (Stream<Path> files = Files.walk(characterDir.toPath())) {
            long left = files.filter(Files::isRegularFile).count();
            assertEquals(0, left, "上传失败后不应留下半成品文件");
        }
    }

    // ---------------- 辅助 ----------------

    private static byte[] readSampleWebp() throws IOException {
        java.net.URL resource = PortraitImportConversionTest.class.getClassLoader()
                .getResource(SAMPLE_RESOURCE);
        assertNotNull(resource, "缺少测试样本 " + SAMPLE_RESOURCE);
        try (var in = resource.openStream()) {
            return in.readAllBytes();
        }
    }

    private static byte[] createPngBytes() throws IOException {
        BufferedImage image = new BufferedImage(8, 8, BufferedImage.TYPE_INT_ARGB);
        image.setRGB(0, 0, 0xFF3366CC);
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        assertTrue(ImageIO.write(image, "png", out), "当前环境必须支持 PNG 编码");
        return out.toByteArray();
    }

    /** 按魔数判断是不是 PNG（不信任扩展名） */
    private static boolean isPng(File file) throws IOException {
        byte[] header = new byte[8];
        try (var in = Files.newInputStream(file.toPath())) {
            if (in.read(header) < header.length) {
                return false;
            }
        }
        byte[] expected = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
        return java.util.Arrays.equals(header, expected);
    }

    private static int alphaAt(BufferedImage image, int x, int y) {
        return (image.getRGB(x, y) >>> 24) & 0xFF;
    }

    private static long solidPixelCount(BufferedImage image) {
        long count = 0;
        for (int y = 0; y < image.getHeight(); y += 3) {
            for (int x = 0; x < image.getWidth(); x += 3) {
                if (alphaAt(image, x, y) == 255) {
                    count++;
                }
            }
        }
        return count;
    }

    private static void assertArrayEqualsMessage(byte[] expected, byte[] actual) {
        assertArrayEqualsMessage(expected, actual, "备份内容必须与上传字节完全一致");
    }

    private static void assertArrayEqualsMessage(byte[] expected, byte[] actual, String message) {
        assertEquals(expected.length, actual.length, message + "（长度不一致）");
        assertTrue(java.util.Arrays.equals(expected, actual), message);
    }

    private static void deleteRecursively(Path root) {
        if (!Files.exists(root)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(root)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // 测试清理失败不影响断言
                }
            });
        } catch (IOException ignored) {
            // 同上
        }
    }
}
