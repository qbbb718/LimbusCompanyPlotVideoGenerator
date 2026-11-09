package com.lbc_plot.render.controller;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.lbc_plot.render.video.anim.AnimationClipAsset;
import com.lbc_plot.render.video.emotion.AnimationClipImporter;
import com.lbc_plot.render.video.emotion.AnimationClipStore;

/**
 * @module 情绪动画素材库接口
 * 列出 / 导入 / 改名改时序 / 删除 / 导出动画文件（单个或整批）。
 *
 * <h2>素材库是可跨记录复用的</h2>
 * 一条记录的立绘引用的是「素材 id」，所以同一套"开心花开"可以被十条记录共用。
 * 删素材**不会**动任何记录：下次渲染时找不到帧就只是不画（并在面板上提示素材缺失），
 * 工程文件不会因此打不开。
 *
 * <h2>导出格式</h2>
 * {@code .lcaf} 就是一个普通 zip（{@code clip.json} + {@code frames/*.png}），
 * 可以直接用资源管理器打开看；导入时也接受这种 zip 或任意"图片序列 zip"。
 */
@RestController
@RequestMapping("/api/animation-clips")
public class AnimationClipController {

    private static final Logger logger = LoggerFactory.getLogger(AnimationClipController.class);

    /** 导出文件的推荐后缀（本质是 zip） */
    public static final String EXPORT_EXTENSION = ".lcaf";

    private final AnimationClipImporter importer;

    public AnimationClipController(AnimationClipImporter importer) {
        this.importer = importer;
    }

    /* ==================== 查询 ==================== */

    /** 素材列表（按创建时间倒序） */
    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (AnimationClipAsset asset : AnimationClipStore.list()) {
            result.add(toDto(asset));
        }
        return ResponseEntity.ok(result);
    }

    /** 单个素材 */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable String id) {
        Optional<AnimationClipAsset> asset = AnimationClipStore.find(id);
        if (asset.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(toDto(asset.get()));
    }

    /* ==================== 导入 ==================== */

    /**
     * 从一批图片导入（多选 / 文件夹里全选都走这里）。
     *
     * @param files        图片文件，字段名可以重复；顺序由后端按文件名自然排序决定
     * @param name         素材名（可空，空则从文件名推导）
     * @param inferHolds   是否按文件名编号自动推算每帧持续帧数（缺省 true）
     * @param maxGapFrames 单张时长上限（缺省 60 帧；≤0 用默认值）
     */
    @PostMapping("/import")
    public ResponseEntity<Map<String, Object>> importImages(
            @RequestParam(value = "files", required = false) List<MultipartFile> files,
            @RequestParam(value = "name", required = false) String name,
            @RequestParam(value = "inferHolds", defaultValue = "true") boolean inferHolds,
            @RequestParam(value = "maxGapFrames", defaultValue = "60") int maxGapFrames) throws IOException {
        AnimationClipImporter.ImportResult result = importer.importImages(files, name, inferHolds, maxGapFrames);
        return ResponseEntity.ok(toImportResponse(result));
    }

    /**
     * 从一个 zip 导入（图片序列 zip，或本功能导出的 .lcaf）。
     *
     * @param inferHolds   包里没带时序时，是否按文件名编号推算
     * @param maxGapFrames 单张时长上限
     */
    @PostMapping("/import-zip")
    public ResponseEntity<Map<String, Object>> importZip(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "name", required = false) String name,
            @RequestParam(value = "inferHolds", defaultValue = "true") boolean inferHolds,
            @RequestParam(value = "maxGapFrames", defaultValue = "60") int maxGapFrames) throws IOException {
        AnimationClipImporter.ImportResult result = importer.importZip(file, name, inferHolds, maxGapFrames);
        return ResponseEntity.ok(toImportResponse(result));
    }

    /* ==================== 编辑 ==================== */

    /**
     * 改名 / 改每帧持续帧数。
     *
     * <p>只要 body 里出现哪个字段就改哪个，不出现的保持原样（PUT 语义做成"部分更新"，
     * 因为前端面板是分两个控件改的，硬要一次传全会让并发编辑互相覆盖）。
     *
     * <p><b>注意</b>：改时序不会自动同步到已经引用了它的记录（记录里存的是内联快照，
     * 这是刻意的：改素材不该让老工程画面变样）。要同步由用户在立绘面板上点「从素材同步」。
     */
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> update(@PathVariable String id,
            @RequestBody Map<String, Object> body) throws IOException {
        Optional<AnimationClipAsset> existing = AnimationClipStore.find(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        AnimationClipAsset asset = existing.get();

        Object name = body.get("name");
        if (name instanceof String && !((String) name).trim().isEmpty()) {
            asset.setName(((String) name).trim());
        }

        Object rawHolds = body.get("frameHolds");
        if (rawHolds instanceof List<?> list) {
            List<Integer> holds = new ArrayList<>(list.size());
            for (Object item : list) {
                int hold = toInt(item, 1);
                holds.add(Math.max(1, hold));
            }
            if (holds.size() != asset.frameCount()) {
                throw new IllegalArgumentException(
                        "每帧时长的个数必须与帧数一致：当前 " + holds.size() + " 个，帧数 " + asset.frameCount());
            }
            if (!AnimationClipImporter.isTotalFramesWithinLimit(holds)) {
                throw new IllegalArgumentException(
                        "总时长超过上限（最多 " + AnimationClipImporter.MAX_TOTAL_FRAMES + " 帧）");
            }
            asset.setFrameHolds(holds);
        }

        // 播放参数（跟着素材走）
        Object loop = body.get("loop");
        if (loop instanceof String text && !text.isBlank()) {
            String normalized = text.trim().toLowerCase();
            if (!List.of("once", "hold", "loop", "pingpong").contains(normalized)) {
                throw new IllegalArgumentException("不认识的循环模式：" + text);
            }
            asset.setLoop(normalized);
        }
        if (body.containsKey("iterations")) {
            int value = toInt(body.get("iterations"), 0);
            asset.setIterations(value > 0 ? value : null);
        }
        if (body.containsKey("startFrame")) {
            asset.setStartFrame(Math.max(0, toInt(body.get("startFrame"), 0)));
        }
        if (body.containsKey("fadeInFrames")) {
            asset.setFadeInFrames(Math.max(0, toInt(body.get("fadeInFrames"), 0)));
        }
        if (body.containsKey("fadeOutFrames")) {
            asset.setFadeOutFrames(Math.max(0, toInt(body.get("fadeOutFrames"), 0)));
        }
        if (body.containsKey("opacity")) {
            float value = (float) toDouble(body.get("opacity"), asset.getOpacity());
            asset.setOpacity(Math.min(1f, Math.max(0f, value)));
        }

        // 代表帧：哪一张 + 相对头部区域的偏移与缩放
        Object rawPoster = body.get("poster");
        if (rawPoster instanceof Map<?, ?> map) {
            AnimationClipAsset.Poster poster = asset.getPoster() == null
                    ? new AnimationClipAsset.Poster()
                    : asset.getPoster();
            if (map.containsKey("frame")) {
                poster.setFrame(Math.min(Math.max(0, toInt(map.get("frame"), 0)),
                        Math.max(0, asset.frameCount() - 1)));
            }
            if (map.containsKey("offsetX")) {
                poster.setOffsetX(clamp(toDouble(map.get("offsetX"), poster.getOffsetX()), -20d, 20d));
            }
            if (map.containsKey("offsetY")) {
                poster.setOffsetY(clamp(toDouble(map.get("offsetY"), poster.getOffsetY()), -20d, 20d));
            }
            if (map.containsKey("scale")) {
                poster.setScale(clamp(toDouble(map.get("scale"), poster.safeScale()), 0.01d, 20d));
            }
            asset.setPoster(poster);
        }

        AnimationClipStore.save(asset);
        return ResponseEntity.ok(toDto(asset));
    }

    /** 删除素材（不动任何记录；引用它的立绘只是"找不到帧，不画"） */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> delete(@PathVariable String id) {
        boolean deleted = AnimationClipStore.delete(id);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", deleted);
        return ResponseEntity.ok(body);
    }

    /* ==================== 导入导出（文件形式） ==================== */

    /**
     * 把一个素材导出成单个文件（{@code .lcaf}，内容就是 zip）。
     *
     * <p>前端先弹系统保存框拿到绝对路径，再把路径传进来由后端写盘
     * ——与视频导出同一个模式：不把几十 MB 的字节流来回搬过 IPC。
     *
     * @param body {@code {"targetPath": "D:/xxx/花开.lcaf"}}
     */
    @PostMapping("/{id}/export")
    public ResponseEntity<Map<String, Object>> export(@PathVariable String id,
            @RequestBody Map<String, Object> body) throws IOException {
        Optional<AnimationClipAsset> existing = AnimationClipStore.find(id);
        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        AnimationClipAsset asset = existing.get();

        String targetPath = body.get("targetPath") instanceof String ? (String) body.get("targetPath") : null;
        if (targetPath == null || targetPath.isBlank()) {
            throw new IllegalArgumentException("没有指定保存路径");
        }
        Path target = Paths.get(targetPath).toAbsolutePath().normalize();
        if (!isZipName(target.toString())) {
            target = Paths.get(target.toString() + EXPORT_EXTENSION);
        }
        Path parent = target.getParent();
        if (parent == null || !Files.isDirectory(parent)) {
            throw new IllegalArgumentException("保存目录不存在：" + parent);
        }

        int frames = AnimationClipStore.writeLcaf(id, target);
        long bytes = Files.size(target);
        logger.info("情绪动画已导出: id={}, 目标={}, {} 帧, {} 字节", id, target, frames, bytes);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("filePath", com.lbc_plot.common.util.RuntimePaths.toPortableString(target));
        result.put("frameCount", frames);
        result.put("bytes", bytes);
        return ResponseEntity.ok(result);
    }

    /**
     * @function 批量导出：把选中的几套动画各写成一个 {@code .lcaf} 到同一个目录
     *
     * <p>为什么由后端写盘：一次导几十套时，前端"逐个弹保存框"根本没法用；而把几十个
     * {@code .lcaf} 的字节流搬过 IPC 也不合适（与单套导出同一个理由）。
     * 前端只弹**一次**目录选择框，把目录交给这里。
     *
     * <p>单个素材失败（被人删了帧图之类）**不打断整批**：成功的照常落盘，
     * 失败的进 {@code failures} 数组，界面可以逐条告诉用户是哪一套、为什么。
     *
     * @param body {@code {"ids": ["flow_a1b2c3d4", ...], "targetDir": "D:/share/anim"}}
     * @return {@code {count, targetDir, files: [...], failures: [...]}}
     */
    @PostMapping("/export-batch")
    public ResponseEntity<Map<String, Object>> exportBatch(@RequestBody Map<String, Object> body) {
        List<String> ids = toStringList(body.get("ids"));
        if (ids.isEmpty()) {
            throw new IllegalArgumentException("没有选择要导出的动画");
        }
        String rawDir = body.get("targetDir") instanceof String text ? text : null;
        if (rawDir == null || rawDir.isBlank()) {
            throw new IllegalArgumentException("没有指定导出目录");
        }
        Path targetDir = Paths.get(rawDir).toAbsolutePath().normalize();
        if (!Files.isDirectory(targetDir)) {
            throw new IllegalArgumentException("导出目录不存在：" + targetDir);
        }

        List<Map<String, Object>> files = new ArrayList<>();
        List<Map<String, Object>> failures = new ArrayList<>();
        /** 本批已用过的文件名（小写比较）：两套同名动画不能互相覆盖 */
        Set<String> usedNames = new LinkedHashSet<>();

        for (String id : ids) {
            Optional<AnimationClipAsset> existing = AnimationClipStore.find(id);
            if (existing.isEmpty()) {
                failures.add(failure(id, id, "素材不存在（可能已被删除）"));
                continue;
            }
            AnimationClipAsset asset = existing.get();
            String displayName = asset.getName() == null || asset.getName().isBlank()
                    ? asset.getId()
                    : asset.getName();
            try {
                String fileName = uniqueFileName(
                        AnimationClipStore.safeExportFileName(displayName, asset.getId()), usedNames);
                Path target = targetDir.resolve(fileName + EXPORT_EXTENSION);
                int frames = AnimationClipStore.writeLcaf(asset.getId(), target);
                usedNames.add(fileName.toLowerCase(Locale.ROOT));

                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("id", asset.getId());
                entry.put("name", displayName);
                entry.put("filePath",
                        com.lbc_plot.common.util.RuntimePaths.toPortableString(target));
                entry.put("frameCount", frames);
                entry.put("bytes", Files.size(target));
                files.add(entry);
            } catch (IOException | RuntimeException e) {
                // 单套失败不影响其它：把原因写进结果，前端逐条展示
                logger.warn("批量导出时跳过素材 {}: {}", id, e.getMessage());
                failures.add(failure(asset.getId(), displayName,
                        e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
            }
        }

        logger.info("情绪动画批量导出完成: 成功 {} 套 / 失败 {} 套, 目录={}",
                files.size(), failures.size(), targetDir);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("count", files.size());
        result.put("targetDir", com.lbc_plot.common.util.RuntimePaths.toPortableString(targetDir));
        result.put("files", files);
        result.put("failures", failures);
        return ResponseEntity.ok(result);
    }

    /* ==================== 内部 ==================== */

    private static Map<String, Object> failure(String id, String name, String message) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", id);
        entry.put("name", name);
        entry.put("message", message);
        return entry;
    }

    /**
     * 同一个目录里不能有两个同名文件：重名时依次加 {@code _2}、{@code _3}…
     *
     * <p>只在本批内去重（不查磁盘）：重复导出同一套动画时覆盖上一版是预期行为，
     * 而"两套不同动画同名"必须都留下来，否则用户永远少一套。
     */
    private static String uniqueFileName(String base, Set<String> usedLowerNames) {
        if (!usedLowerNames.contains(base.toLowerCase(Locale.ROOT))) {
            return base;
        }
        int suffix = 2;
        while (usedLowerNames.contains((base + "_" + suffix).toLowerCase(Locale.ROOT))) {
            suffix++;
        }
        return base + "_" + suffix;
    }

    /** body 里的 ids：只认字符串（数字/对象一律忽略，避免拼出奇怪路径） */
    private static List<String> toStringList(Object value) {
        List<String> result = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof String text && !text.isBlank()) {
                    result.add(text.trim());
                }
            }
        } else if (value instanceof String text && !text.isBlank()) {
            result.add(text.trim());
        }
        return result;
    }

    private Map<String, Object> toImportResponse(AnimationClipImporter.ImportResult result) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("asset", toDto(result.asset()));
        body.put("warnings", result.warnings());
        return body;
    }

    private Map<String, Object> toDto(AnimationClipAsset asset) {
        int framesOnDisk = AnimationClipStore.frameFileCount(asset.getId());
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", asset.getId());
        dto.put("name", asset.getName());
        dto.put("canvasWidth", asset.getCanvasWidth());
        dto.put("canvasHeight", asset.getCanvasHeight());
        dto.put("fps", asset.getFps());
        dto.put("frameCount", asset.frameCount());
        dto.put("totalFrames", asset.totalFrames());
        dto.put("frameHolds", asset.getFrameHolds());
        // 播放参数与代表帧摆放：剧情编辑页只读展示，编辑入口在资源管理
        dto.put("loop", asset.getLoop());
        dto.put("iterations", asset.getIterations());
        dto.put("startFrame", asset.getStartFrame());
        dto.put("fadeInFrames", asset.getFadeInFrames());
        dto.put("fadeOutFrames", asset.getFadeOutFrames());
        dto.put("opacity", asset.getOpacity());
        Map<String, Object> poster = new LinkedHashMap<>();
        AnimationClipAsset.Poster posterConfig = asset.getPoster() == null
                ? new AnimationClipAsset.Poster()
                : asset.getPoster();
        poster.put("frame", asset.posterFrameIndex() == -1 ? 0 : asset.posterFrameIndex());
        poster.put("offsetX", posterConfig.safeOffsetX());
        poster.put("offsetY", posterConfig.safeOffsetY());
        poster.put("scale", posterConfig.safeScale());
        dto.put("poster", poster);
        dto.put("createdAt", asset.getCreatedAt());
        // 帧图地址：前端按 frameBaseUrl + %04d.png 拼，不需要把 240 个 URL 全传一遍
        dto.put("frameBaseUrl", "/assets/animation-clips/" + asset.getId() + "/"
                + AnimationClipStore.FRAMES_DIR + "/");
        dto.put("coverUrl", AnimationClipStore.frameUrl(asset.getId(), 0));
        // 磁盘上真的有几张：与 frameCount 不一致说明素材被部分删除/拷漏，面板要提示
        dto.put("framesOnDisk", framesOnDisk);
        dto.put("missingFrames", framesOnDisk < asset.frameCount());
        return dto;
    }

    private static boolean isZipName(String path) {
        String lower = path.toLowerCase();
        return lower.endsWith(".lcaf") || lower.endsWith(".zip");
    }

    private static int toInt(Object value, int fallback) {
        if (value instanceof Number number) {
            return (int) Math.round(number.doubleValue());
        }
        if (value instanceof String text) {
            try {
                return (int) Math.round(Double.parseDouble(text.trim()));
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    private static double toDouble(Object value, double fallback) {
        if (value instanceof Number number) {
            double result = number.doubleValue();
            return Double.isFinite(result) ? result : fallback;
        }
        if (value instanceof String text) {
            try {
                double result = Double.parseDouble(text.trim());
                return Double.isFinite(result) ? result : fallback;
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    private static double clamp(double value, double min, double max) {
        return Math.min(max, Math.max(min, value));
    }
}
