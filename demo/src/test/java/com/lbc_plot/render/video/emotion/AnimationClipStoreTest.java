package com.lbc_plot.render.video.emotion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import com.lbc_plot.render.video.anim.AnimationClipAsset;

/**
 * 情绪动画素材库的磁盘行为：id 安全边界、元数据往返、导入管线的校验与"不留半成品"。
 *
 * <p>素材根目录用 {@link AnimationClipStore#setRootForTesting} 指到临时目录，
 * 不去碰仓库里的 {@code demo/assets}（那是测试数据，被写脏了很难察觉）。
 */
class AnimationClipStoreTest {

    @TempDir
    Path tempRoot;

    private final AnimationClipImporter importer = new AnimationClipImporter();

    @BeforeEach
    void useTempRoot() {
        AnimationClipStore.setRootForTesting(tempRoot);
    }

    @AfterEach
    void restoreRoot() {
        AnimationClipStore.setRootForTesting(null);
    }

    /* ==================== id 安全边界 ==================== */

    @Test
    @DisplayName("id 白名单：目录穿越 / 空 / 超长一律拒绝")
    void idWhitelist() {
        assertTrue(AnimationClipStore.isValidId("flow_a1b2c3d4"));
        assertTrue(AnimationClipStore.isValidId("A-B_c9"));
        assertFalse(AnimationClipStore.isValidId("../etc/passwd"));
        assertFalse(AnimationClipStore.isValidId("a/b"));
        assertFalse(AnimationClipStore.isValidId("a\\b"));
        assertFalse(AnimationClipStore.isValidId(""));
        assertFalse(AnimationClipStore.isValidId(null));
        assertFalse(AnimationClipStore.isValidId("a".repeat(65)));
        assertTrue(AnimationClipStore.isValidId("a".repeat(64)));

        // 非法 id 拼路径必须直接拒绝，而不是"拼出来再说"
        assertThrows(IllegalArgumentException.class, () -> AnimationClipStore.clipDir("../evil"));
        assertEquals(0, AnimationClipStore.frameFileCount("../evil"), "非法 id 扫盘必须返回 0，不能真去扫");
    }

    /* ==================== 元数据往返 ==================== */

    @Test
    @DisplayName("save / find / list / delete 往返，且 frameHolds 保序")
    void metadataRoundTrip() throws IOException {
        AnimationClipAsset asset = asset("demo_001", "演示", 600, 400, List.of(3, 1, 2));
        AnimationClipStore.save(asset);

        Optional<AnimationClipAsset> loaded = AnimationClipStore.find("demo_001");
        assertTrue(loaded.isPresent());
        assertEquals(List.of(3, 1, 2), loaded.get().getFrameHolds());
        assertEquals(6, loaded.get().totalFrames());
        assertEquals(600, loaded.get().getCanvasWidth());

        assertEquals(1, AnimationClipStore.list().size());

        assertTrue(AnimationClipStore.delete("demo_001"));
        assertFalse(AnimationClipStore.find("demo_001").isPresent());
        assertTrue(AnimationClipStore.list().isEmpty());
        assertFalse(AnimationClipStore.delete("demo_001"), "重复删除返回 false，不抛");
    }

    @Test
    @DisplayName("坏 clip.json 被跳过而不是让整个素材库打不开")
    void brokenIndexIsSkipped() throws IOException {
        AnimationClipStore.save(asset("good_001", "好的", 100, 100, List.of(1)));
        Path broken = tempRoot.resolve("broken_001");
        Files.createDirectories(broken);
        Files.writeString(broken.resolve(AnimationClipStore.INDEX_FILE), "{ 这不是 json ");

        List<AnimationClipAsset> list = AnimationClipStore.list();
        assertEquals(1, list.size(), "坏素材被跳过");
        assertEquals("good_001", list.get(0).getId());
        assertFalse(AnimationClipStore.find("broken_001").isPresent());
    }

    @Test
    @DisplayName("目录名是 id 的唯一权威：clip.json 里写错了也以目录名为准")
    void directoryNameWins() throws IOException {
        AnimationClipStore.save(asset("dir_name_001", "名字", 100, 100, List.of(1)));
        Path index = AnimationClipStore.indexPath("dir_name_001");
        Files.writeString(index, Files.readString(index).replace("\"dir_name_001\"", "\"other_id\""));

        assertEquals("dir_name_001", AnimationClipStore.find("dir_name_001").orElseThrow().getId());
    }

    /* ==================== 导入 ==================== */

    @Test
    @DisplayName("导入 3 张图：按文件名自然排序、统一画布、每帧默认 1 帧")
    void importImagesSortsNaturallyAndNormalizesCanvas() throws Exception {
        // 故意用"字典序会排反"的文件名：frame_9 / frame_10
        List<org.springframework.web.multipart.MultipartFile> files = List.of(
                pngFile("frame_10.png", Color.GREEN, 80, 60),
                pngFile("frame_9.png", Color.RED, 100, 100),
                pngFile("frame_11.png", Color.BLUE, 40, 40));

        AnimationClipImporter.ImportResult result = importer.importImages(new ArrayList<>(files), "自然排序");
        AnimationClipAsset asset = result.asset();

        assertNotNull(asset.getId());
        assertEquals(3, asset.frameCount());
        assertEquals(List.of(1, 1, 1), asset.getFrameHolds());
        // 画布 = 最大宽 × 最大高（100 × 100）
        assertEquals(100, asset.getCanvasWidth());
        assertEquals(100, asset.getCanvasHeight());
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("尺寸不一致")), "应当提示已统一画布");

        // 磁盘上真的落了 3 张，且都是统一尺寸的 PNG
        assertEquals(3, AnimationClipStore.frameFileCount(asset.getId()));
        BufferedImage first = AnimationClipStore.frameImage(asset.getId(), 0);
        assertNotNull(first);
        assertEquals(100, first.getWidth());
        assertEquals(100, first.getHeight());

        // 第 0 张应当是 frame_9（红色）—— 自然排序把 9 排在 10、11 前面
        Color center = new Color(first.getRGB(50, 50), true);
        assertTrue(center.getRed() > 200 && center.getGreen() < 60,
                "第 0 帧应当是 frame_9.png（红色），实际 " + center);
    }

    @Test
    @DisplayName("导入时按文件名编号推算每帧时长（需求例子：1/2/3/7/9 → 1/1/4/2/1）")
    void importInfersHoldsFromFileNumbers() throws Exception {
        List<org.springframework.web.multipart.MultipartFile> files = List.of(
                pngFile("frame_1.png", Color.RED, 50, 50),
                pngFile("frame_2.png", Color.GREEN, 50, 50),
                pngFile("frame_3.png", Color.BLUE, 50, 50),
                pngFile("frame_7.png", Color.YELLOW, 50, 50),
                pngFile("frame_9.png", Color.CYAN, 50, 50));

        AnimationClipImporter.ImportResult result = importer.importImages(new ArrayList<>(files), "编号", true, 60);

        assertEquals(List.of(1, 1, 4, 2, 1), result.asset().getFrameHolds(),
                "第 3 张之后隔 4、第 7 张之后隔 2，最后一张取默认 1 帧");
        assertEquals(9, result.asset().totalFrames());
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("推算")),
                "要告诉用户时长是推出来的: " + result.warnings());
    }

    @Test
    @DisplayName("关闭自动推算后一律每张 1 帧（开关生效）")
    void importWithoutInferenceUsesDefaultHolds() throws Exception {
        List<org.springframework.web.multipart.MultipartFile> files = List.of(
                pngFile("frame_1.png", Color.RED, 50, 50),
                pngFile("frame_5.png", Color.GREEN, 50, 50));

        AnimationClipImporter.ImportResult result = importer.importImages(new ArrayList<>(files), "关掉", false, 60);

        assertEquals(List.of(1, 1), result.asset().getFrameHolds());
        assertTrue(result.warnings().stream().noneMatch(w -> w.contains("推算")), result.warnings().toString());
    }

    @Test
    @DisplayName("命名不规律时照常导入、时长回默认，并给出提示（不阻断）")
    void importWithIrregularNamesStillWorks() throws Exception {
        List<org.springframework.web.multipart.MultipartFile> files = List.of(
                pngFile("aaa_1.png", Color.RED, 50, 50),
                pngFile("bbb_4.png", Color.GREEN, 50, 50));

        AnimationClipImporter.ImportResult result = importer.importImages(new ArrayList<>(files), "乱", true, 60);

        assertEquals(List.of(1, 1), result.asset().getFrameHolds());
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("前缀不一致")), result.warnings().toString());
    }

    @Test
    @DisplayName("zip 导入：包里带时序时以包为准，不被文件名推算覆盖")
    void zipPackagedHoldsWinOverInference() throws Exception {
        byte[] zip = zipOf(
                new ZipEntry(AnimationClipStore.INDEX_FILE), zipIndexJson("包里的动画", 2).getBytes(java.nio.charset.StandardCharsets.UTF_8),
                // 文件名本身就"暗示"了 1 → 5 的间隔（4 帧），但包里写了 3/1，应该听包的
                new ZipEntry("frames/0001.png"), pngBytes(Color.RED, 50, 50),
                new ZipEntry("frames/0002.png"), pngBytes(Color.GREEN, 50, 50));

        AnimationClipImporter.ImportResult result = importer.importZip(
                new MockMultipartFile("file", "包.lcaf", "application/zip", zip), null, true, 60);
        assertEquals(List.of(3, 1), result.asset().getFrameHolds());
    }

    @Test
    @DisplayName("zip 导入：包里没带时序时按文件名编号推算")
    void zipWithoutIndexInfersFromNames() throws Exception {
        byte[] zip = zipOf(
                new ZipEntry("frames/shot_1.png"), pngBytes(Color.RED, 50, 50),
                new ZipEntry("frames/shot_4.png"), pngBytes(Color.GREEN, 50, 50));

        AnimationClipImporter.ImportResult result = importer.importZip(
                new MockMultipartFile("file", "序列.zip", "application/zip", zip), null, true, 60);
        assertEquals(List.of(3, 1), result.asset().getFrameHolds(), "1→4 隔 3 帧，最后一张默认 1");
    }

    @Test
    @DisplayName("解不出画面的图：整体拒绝，且不留下半个素材目录")
    void undecodableImageLeavesNoTrace() throws Exception {
        MockMultipartFile broken = new MockMultipartFile("files", "bad.png", "image/png",
                "这不是图片".getBytes());
        assertThrows(IllegalArgumentException.class,
                () -> importer.importImages(List.of(broken), "坏图"));

        assertEquals(0, AnimationClipStore.list().size(), "失败后素材库必须还是空的");
        try (Stream<Path> entries = Files.list(tempRoot)) {
            assertEquals(0, entries.count(), "临时导入目录必须被清掉");
        }
    }

    @Test
    @DisplayName("帧数超上限：直接拒绝并说明当前数量")
    void tooManyFramesRejected() {
        List<org.springframework.web.multipart.MultipartFile> files = new ArrayList<>();
        for (int i = 0; i < AnimationClipImporter.MAX_FRAMES + 1; i++) {
            files.add(new MockMultipartFile("files", String.format("f%04d.png", i), "image/png",
                    new byte[] { 1 }));
        }
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> importer.importImages(files, "太多"));
        assertTrue(error.getMessage().contains("超过上限"), "错误信息要能直接给用户看：" + error.getMessage());
    }

    @Test
    @DisplayName("zip 导入：包里的 clip.json 能还原时序、播放参数与代表帧摆放")
    void zipImportRestoresHolds() throws Exception {
        byte[] zip = zipOf(
                new ZipEntry(AnimationClipStore.INDEX_FILE), zipIndexJson("包里的动画", 2).getBytes(java.nio.charset.StandardCharsets.UTF_8),
                new ZipEntry("frames/0001.png"), pngBytes(Color.RED, 50, 50),
                new ZipEntry("frames/0002.png"), pngBytes(Color.GREEN, 50, 50));

        AnimationClipImporter.ImportResult result = importer.importZip(
                new MockMultipartFile("file", "包.lcaf", "application/zip", zip), null);

        assertEquals(2, result.asset().frameCount());
        assertEquals(List.of(3, 1), result.asset().getFrameHolds(), "包里的时序应当被还原");
        assertEquals("包里的动画", result.asset().getName(), "包里的名字应当被沿用");
        // 导出再导入必须保住"用户在资源管理里拖出来的摆放"，否则每分享一次就丢一次配置
        assertEquals("hold", result.asset().getLoop());
        assertEquals(4, result.asset().getFadeInFrames());
        assertEquals(0.8f, result.asset().getOpacity(), 1e-6);
        assertNotNull(result.asset().getPoster());
        assertEquals(1, result.asset().getPoster().getFrame());
        assertEquals(0.25d, result.asset().getPoster().getOffsetX(), 1e-9);
        assertEquals(-0.4d, result.asset().getPoster().getOffsetY(), 1e-9);
        assertEquals(1.5d, result.asset().getPoster().getScale(), 1e-9);
    }

    @Test
    @DisplayName("zip 导入：包里的代表帧序号超出图片数量时被夹回有效范围")
    void zipImportClampsPosterFrame() throws Exception {
        // 包里的 clip.json 写着 poster.frame=9，但只带了两张图
        byte[] zip = zipOf(
                new ZipEntry(AnimationClipStore.INDEX_FILE), zipIndexJson("越界", 2, 9).getBytes(java.nio.charset.StandardCharsets.UTF_8),
                new ZipEntry("frames/0001.png"), pngBytes(Color.RED, 50, 50),
                new ZipEntry("frames/0002.png"), pngBytes(Color.GREEN, 50, 50));

        AnimationClipImporter.ImportResult result = importer.importZip(
                new MockMultipartFile("file", "包.lcaf", "application/zip", zip), null);
        assertEquals(1, result.asset().getPoster().getFrame(), "夹到最后一帧，不能指向不存在的帧");
    }

    @Test
    @DisplayName("zip 导入：包里没有图片时明确报错")
    void zipWithoutImagesRejected() throws Exception {
        byte[] zip = zipOf(new ZipEntry("readme.txt"), "hello".getBytes());
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> importer.importZip(new MockMultipartFile("file", "x.zip", "application/zip", zip), null));
        assertTrue(error.getMessage().contains("没有找到图片"), error.getMessage());
    }

    /* ==================== 自然排序 ==================== */

    @Test
    @DisplayName("自然排序：数字按数值比，而不是字典序")
    void naturalComparatorOrdersNumbersNumerically() {
        List<String> names = new ArrayList<>(List.of(
                "frame_10.png", "frame_2.png", "frame_1.png", "frame_100.png"));
        names.sort(AnimationClipImporter.naturalComparator());
        assertEquals(List.of("frame_1.png", "frame_2.png", "frame_10.png", "frame_100.png"), names);
    }

    /* ==================== 工具 ==================== */

    private static AnimationClipAsset asset(String id, String name, int canvasWidth, int canvasHeight,
            List<Integer> holds) {
        AnimationClipAsset asset = new AnimationClipAsset();
        asset.setId(id);
        asset.setName(name);
        asset.setCanvasWidth(canvasWidth);
        asset.setCanvasHeight(canvasHeight);
        asset.setFrameHolds(new ArrayList<>(holds));
        asset.setCreatedAt(System.currentTimeMillis());
        return asset;
    }

    private static MockMultipartFile pngFile(String name, Color color, int width, int height)
            throws IOException {
        return new MockMultipartFile("files", name, "image/png", pngBytes(color, width, height));
    }

    private static byte[] pngBytes(Color color, int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(color);
            g.fillRect(0, 0, width, height);
        } finally {
            g.dispose();
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private static String zipIndexJson(String name, int frames) {
        return zipIndexJson(name, frames, 1);
    }

    /**
     * 造一个"导出包里的 clip.json"。
     *
     * @param posterFrame 代表帧序号；传越界值可以验证导入时的夹取
     */
    private static String zipIndexJson(String name, int frames, int posterFrame) {
        StringBuilder holds = new StringBuilder();
        for (int i = 0; i < frames; i++) {
            if (i > 0) {
                holds.append(',');
            }
            // 第一张 3 帧、第二张 1 帧 —— 与测试里的断言对应
            holds.append(i == 0 ? 3 : 1);
        }
        return "{\"version\":1,\"kind\":\"lbc-animation-clip\",\"id\":\"packed\",\"name\":\"" + name
                + "\",\"canvasWidth\":50,\"canvasHeight\":50,\"fps\":30,\"frameHolds\":[" + holds
                + "],\"loop\":\"hold\",\"iterations\":null,\"startFrame\":0,"
                + "\"fadeInFrames\":4,\"fadeOutFrames\":0,\"opacity\":0.8,"
                + "\"poster\":{\"frame\":" + posterFrame + ",\"offsetX\":0.25,\"offsetY\":-0.4,\"scale\":1.5},"
                + "\"createdAt\":1}";
    }

    /** 拼一个 {entry, bytes, entry, bytes, ...} 形式的 zip */
    private static byte[] zipOf(Object... entryBytesPairs) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            for (int i = 0; i < entryBytesPairs.length; i += 2) {
                zip.putNextEntry((ZipEntry) entryBytesPairs[i]);
                zip.write((byte[]) entryBytesPairs[i + 1]);
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }
}
