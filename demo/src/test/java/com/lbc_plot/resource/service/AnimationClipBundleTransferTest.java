package com.lbc_plot.resource.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

import com.lbc_plot.render.controller.AnimationClipController;
import com.lbc_plot.render.video.anim.AnimationClipAsset;
import com.lbc_plot.render.video.emotion.AnimationClipImporter;
import com.lbc_plot.render.video.emotion.AnimationClipStore;

/**
 * 序列帧动画与"资源包"的两件事：
 *
 * <ol>
 *   <li><b>全部资源包</b>里要带上动画（{@code animation-clips/*.lcaf}），导入时能还原；</li>
 *   <li><b>页面上的批量导出</b>要能一次把几套动画写进同一个目录。</li>
 * </ol>
 *
 * <p>动画没有数据库，所以这里不需要 Spring 上下文：素材库根目录指到临时目录
 * （{@link AnimationClipStore#setRootForTesting}），服务里的导入器用反射塞一个真身进去。
 * 包内只有动画时 {@code importAll} 不会碰 jdbi / appConfig 那条路，正好适合纯单测。
 */
class AnimationClipBundleTransferTest {

    @TempDir
    Path tempRoot;

    /** 素材库根目录（与导出用的工作目录分开，免得导出产物里混进素材） */
    private Path clipsRoot;

    private Path workDir;

    private ResourceTransferService service;

    @BeforeEach
    void setUp() throws IOException {
        clipsRoot = tempRoot.resolve("clips");
        workDir = tempRoot.resolve("work");
        Files.createDirectories(clipsRoot);
        Files.createDirectories(workDir);
        AnimationClipStore.setRootForTesting(clipsRoot);

        service = new ResourceTransferService();
        ReflectionTestUtils.setField(service, "animationClipImporter", new AnimationClipImporter());
    }

    @AfterEach
    void tearDown() {
        AnimationClipStore.setRootForTesting(null);
    }

    /* ==================== 导出：每套动画一个 .lcaf ==================== */

    @Test
    @DisplayName("导出动画资源包：每套一个 .lcaf，另附一个说明清单")
    void exportAnimationClipsWritesOneLcafPerClip() throws IOException {
        createClip("flow_a", "花开", List.of(3, 1));
        createClip("rain_b", "雨滴", List.of(1, 1, 2));

        Path zip = service.exportAnimationClips(null);
        try {
            Map<String, byte[]> entries = readZip(zip);
            assertTrue(entries.containsKey("animation-clips.json"), "要有说明清单：" + entries.keySet());
            assertTrue(entries.containsKey("花开.lcaf"), "每套动画一个 .lcaf：" + entries.keySet());
            assertTrue(entries.containsKey("雨滴.lcaf"), "每套动画一个 .lcaf：" + entries.keySet());

            // .lcaf 自己必须是一个完整可导入的动画包
            Map<String, byte[]> inner = readZip(entries.get("花开.lcaf"));
            assertTrue(inner.containsKey("clip.json"), ".lcaf 里要有 clip.json：" + inner.keySet());
            assertTrue(inner.containsKey("frames/0001.png"), ".lcaf 里要有帧图：" + inner.keySet());
            assertTrue(inner.containsKey("frames/0002.png"), ".lcaf 里要有帧图：" + inner.keySet());

            // 清单只是说明，但至少要能读出文件对应关系与帧数
            String manifest = new String(entries.get("animation-clips.json"), StandardCharsets.UTF_8);
            assertTrue(manifest.contains("花开.lcaf"), manifest);
            assertTrue(manifest.contains("\"frameCount\""), manifest);
        } finally {
            ResourceTransferService.deleteQuietly(zip);
        }
    }

    @Test
    @DisplayName("导出选了 id 时只导那几套；同名动画在包内自动改名，不互相覆盖")
    void exportAnimationClipsHandlesDuplicateNames() throws IOException {
        createClip("dup_one", "重名", List.of(1));
        createClip("dup_two", "重名", List.of(1));

        Path zip = service.exportAnimationClips(List.of("dup_one", "dup_two"));
        try {
            Map<String, byte[]> entries = readZip(zip);
            assertTrue(entries.containsKey("重名.lcaf"), entries.keySet().toString());
            assertTrue(entries.containsKey("重名_2.lcaf"), "第二套同名动画要另起文件名：" + entries.keySet());
        } finally {
            ResourceTransferService.deleteQuietly(zip);
        }
    }

    /* ==================== 导入：全部资源包里的动画 ==================== */

    @Test
    @DisplayName("导入全部资源：animation-clips/ 里的 .lcaf 被逐套还原（时序、播放参数、缩略图都在）")
    void importAllRestoresAnimationClips() throws IOException {
        byte[] lcaf = exportSingleLcaf("flow_src", "花开", List.of(4, 2));

        // 清空素材库，模拟"换机后导进一个干净的库"
        AnimationClipStore.delete("flow_src");
        assertEquals(0, AnimationClipStore.list().size());

        Path bundle = writeZip(workDir.resolve("bundle.zip"),
                new ZipEntry("manifest.json"), "{\"formatVersion\":2}".getBytes(StandardCharsets.UTF_8),
                new ZipEntry("animation-clips/animation-clips.json"),
                "[{\"file\":\"花开.lcaf\"}]".getBytes(StandardCharsets.UTF_8),
                new ZipEntry("animation-clips/花开.lcaf"), lcaf);

        ResourceTransferService.BundleImportResult result = service.importAll(bundle);

        assertEquals(1, result.getAnimationClips());
        assertEquals(0, result.getCharacters());
        assertTrue(result.getWarnings().isEmpty(), result.getWarnings().toString());

        List<AnimationClipAsset> imported = AnimationClipStore.list();
        assertEquals(1, imported.size());
        AnimationClipAsset clip = imported.get(0);
        assertEquals("花开", clip.getName());
        assertEquals(List.of(4, 2), clip.getFrameHolds(), "每帧时长必须原样还原");
        assertEquals(1, clip.posterFrameIndex(), "缩略图是第几张也必须还原");
        assertEquals(0.25d, clip.getPoster().safeOffsetX(), 1e-9);
        assertEquals(-0.4d, clip.getPoster().safeOffsetY(), 1e-9);
        // 帧图要真的落到素材目录里（不是只写了 clip.json）
        assertEquals(2, AnimationClipStore.frameFileCount(clip.getId()));
    }

    @Test
    @DisplayName("导入全部资源：坏掉的某一套动画只产生警告，不影响其它套")
    void importAllSkipsBrokenClip() throws IOException {
        byte[] goodLcaf = exportSingleLcaf("good_clip", "好的", List.of(1));
        AnimationClipStore.delete("good_clip");

        Path bundle = writeZip(workDir.resolve("bundle2.zip"),
                new ZipEntry("manifest.json"), "{\"formatVersion\":2}".getBytes(StandardCharsets.UTF_8),
                // 一个根本不是 zip 的"动画"：不该让整个导入失败
                new ZipEntry("animation-clips/坏的.lcaf"), "not a zip".getBytes(StandardCharsets.UTF_8),
                new ZipEntry("animation-clips/好的.lcaf"), goodLcaf);

        ResourceTransferService.BundleImportResult result = service.importAll(bundle);

        assertEquals(1, result.getAnimationClips(), "好的那套照样导入");
        assertEquals(1, result.getWarnings().size(), "坏的那套要给一条警告：" + result.getWarnings());
        assertTrue(result.getWarnings().get(0).contains("坏的.lcaf"), result.getWarnings().get(0));
    }

    @Test
    @DisplayName("不认识的资源包：错误信息要提到 animation-clips，用户才知道该放什么")
    void importAllRejectsUnknownBundle() throws IOException {
        Path bundle = writeZip(workDir.resolve("random.zip"),
                new ZipEntry("readme.txt"), "hello".getBytes(StandardCharsets.UTF_8));

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.importAll(bundle));
        assertTrue(error.getMessage().contains("animation-clips"), error.getMessage());
    }

    @Test
    @DisplayName("包内只有根目录的 .lcaf、没有 animation-clips.json 时不当成动画包（防误吞）")
    void rootLcafWithoutManifestIsIgnored() throws IOException {
        Path bundle = writeZip(workDir.resolve("root.zip"),
                new ZipEntry("随便.lcaf"), "not a zip".getBytes(StandardCharsets.UTF_8));

        assertThrows(IllegalArgumentException.class, () -> service.importAll(bundle));
        assertTrue(AnimationClipStore.list().isEmpty(), "不该凭空造出素材");
    }

    /* ==================== 批量导出（页面上的多选导出） ==================== */

    @Test
    @DisplayName("批量导出：一次写进同一个目录，同名自动加序号；单套失败不影响其它")
    void exportBatchWritesFilesIntoDirectory() throws IOException {
        createClip("batch_one", "花开", List.of(1));
        createClip("batch_two", "花开", List.of(2));
        Path targetDir = Files.createDirectories(workDir.resolve("out"));

        AnimationClipController controller = new AnimationClipController(new AnimationClipImporter());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ids", List.of("batch_one", "batch_two", "missing_id"));
        body.put("targetDir", targetDir.toString());

        Map<String, Object> response = controller.exportBatch(body).getBody();
        assertNotNull(response);

        assertEquals(2, response.get("count"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> files = (List<Map<String, Object>>) response.get("files");
        assertEquals(2, files.size());
        assertTrue(Files.isRegularFile(targetDir.resolve("花开.lcaf")), "第一套");
        assertTrue(Files.isRegularFile(targetDir.resolve("花开_2.lcaf")), "第二套要改名，不能覆盖");
        assertTrue((int) files.get(0).get("frameCount") > 0);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> failures = (List<Map<String, Object>>) response.get("failures");
        assertEquals(1, failures.size(), "不存在的素材要进 failures 而不是让整批失败");
        assertEquals("missing_id", failures.get(0).get("id"));
    }

    @Test
    @DisplayName("批量导出：没选动画 / 目录不存在时给出明确原因，不写半个文件")
    void exportBatchValidatesInput() {
        AnimationClipController controller = new AnimationClipController(new AnimationClipImporter());

        Map<String, Object> noIds = new LinkedHashMap<>();
        noIds.put("ids", List.of());
        noIds.put("targetDir", workDir.toString());
        IllegalArgumentException emptyIds = assertThrows(IllegalArgumentException.class,
                () -> controller.exportBatch(noIds));
        assertTrue(emptyIds.getMessage().contains("没有选择"), emptyIds.getMessage());

        Map<String, Object> badDir = new LinkedHashMap<>();
        badDir.put("ids", List.of("any"));
        badDir.put("targetDir", workDir.resolve("不存在").toString());
        IllegalArgumentException missingDir = assertThrows(IllegalArgumentException.class,
                () -> controller.exportBatch(badDir));
        assertTrue(missingDir.getMessage().contains("导出目录不存在"), missingDir.getMessage());
    }

    /* ==================== 工具 ==================== */

    /** 造一套素材并导出成 {@code .lcaf} 的字节（几个用例共用） */
    private byte[] exportSingleLcaf(String id, String name, List<Integer> holds) throws IOException {
        createClip(id, name, holds);
        Path sub = service.exportAnimationClips(List.of(id));
        try {
            byte[] lcaf = readZip(sub).get(name + ".lcaf");
            assertNotNull(lcaf, "导出的 .lcaf 必须在包里");
            return lcaf;
        } finally {
            ResourceTransferService.deleteQuietly(sub);
        }
    }

    /**
     * 在临时素材库里造一套能导出的素材（元数据 + 真的帧图）。
     *
     * <p>缩略图固定摆"最后一张 + 偏移(0.25, -0.4)"：导入侧就是靠这些值验证
     * "导出再导入不丢配置"——这正是用户在资源管理里辛苦拖出来的东西。
     */
    private void createClip(String id, String name, List<Integer> holds) throws IOException {
        AnimationClipAsset asset = new AnimationClipAsset();
        asset.setId(id);
        asset.setName(name);
        asset.setCanvasWidth(40);
        asset.setCanvasHeight(40);
        asset.setFps(30);
        asset.setFrameHolds(new ArrayList<>(holds));
        asset.setLoop("hold");
        asset.setFadeInFrames(3);
        asset.setCreatedAt(System.currentTimeMillis());
        asset.setPoster(new AnimationClipAsset.Poster(holds.size() - 1, 0.25d, -0.4d, 1.5d));
        AnimationClipStore.save(asset);

        Files.createDirectories(AnimationClipStore.framesDir(id));
        for (int i = 0; i < holds.size(); i++) {
            BufferedImage image = new BufferedImage(40, 40, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = image.createGraphics();
            try {
                g.setColor(i % 2 == 0 ? Color.RED : Color.GREEN);
                g.fillRect(0, 0, 40, 40);
            } finally {
                g.dispose();
            }
            ImageIO.write(image, "png", AnimationClipStore.frameFile(id, i).toFile());
        }
    }

    private static Path writeZip(Path target, Object... entryBytesPairs) throws IOException {
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(target))) {
            for (int i = 0; i < entryBytesPairs.length; i += 2) {
                zip.putNextEntry((ZipEntry) entryBytesPairs[i]);
                zip.write((byte[]) entryBytesPairs[i + 1]);
                zip.closeEntry();
            }
        }
        return target;
    }

    /** 读一个 zip / .lcaf 的全部条目（都是小文件，测试里直接进内存） */
    private static Map<String, byte[]> readZip(Path zipFile) throws IOException {
        return readZip(Files.readAllBytes(zipFile));
    }

    private static Map<String, byte[]> readZip(byte[] bytes) throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                entries.put(entry.getName(), zip.readAllBytes());
            }
        }
        return entries;
    }
}
