package com.lbc_plot.common.service;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.lbc_plot.common.util.BundledAssetSync;
import com.lbc_plot.common.util.RuntimePaths;

/**
 * 素材维护服务：素材自检 + 从安装包补齐缺失素材。
 *
 * <p>安装版把随包发布的 {@code assets/} 复制到用户数据目录，后端以用户数据目录为工作目录运行。
 * 首次复制一旦被打断、或者用户从旧版本升级上来，{@code ui/}、{@code effects/} 这类必需素材
 * 就会永久缺失（原来的复制只在"目标目录不存在"时执行一次），预览图与视频导出都会失败。
 *
 * <p>本服务提供两件事：
 * <ol>
 *   <li>{@link #diagnostics()} —— 告诉前端/用户"素材目录在哪、缺哪些必需文件"；</li>
 *   <li>{@link #repair()} —— 以安装包内的素材为基准，逐文件补齐缺失项（已存在的文件与用户
 *       自己上传的素材一律保留，不删除任何文件）。</li>
 * </ol>
 *
 * <p>安装包素材目录由 Electron 启动后端时通过 {@code -Dapp.assets.bundled=<安装目录>\resources\assets}
 * 传入（见 {@code public/electron.js}）；开发模式（{@code mvn spring-boot:run}）没有该属性，
 * 此时 {@link #repair()} 会明确返回"未提供安装包素材目录"，不会误判。
 */
@Service
public class AssetMaintenanceService {

    private static final Logger logger = LoggerFactory.getLogger(AssetMaintenanceService.class);

    /** 预览图渲染必需的关键素材（相对 assets/ui 目录） */
    public static final String[] REQUIRED_UI_FILES = {
            "border_1080p.png",
            "dialogBox.png",
            "speaker-camp.png",
            "speaker-name.png",
            "location.png"
    };

    /** 关键字体（相对 assets 目录） */
    public static final String[] REQUIRED_FONT_FILES = {
            "fonts/ChineseFont.ttf"
    };

    /**
     * 安装包内随包发布的素材目录。
     *
     * <p>由 Electron 以 JVM 参数 {@code -Dapp.assets.bundled=...} 传入；开发模式下为空字符串。
     */
    @Value("${app.assets.bundled:}")
    private String bundledAssetsPath;

    /**
     * 解析运行时素材目录。
     *
     * <p>素材目录是唯一确定的：{@link RuntimePaths#getAssetsDir()}，即用户数据目录下的
     * {@code assets}（Windows 为 {@code %APPDATA%\limbus-company-plot-video-generator\assets}）。
     *
     * <p>旧实现会依次猜测"配置路径 → {@code ./assets} → {@code ../assets}"，第一个存在的目录即被采用。
     * 这让素材位置随 JVM 工作目录变化：从 {@code demo/} 启动就会落到 {@code demo/assets}，
     * 与安装版实际使用的目录不是同一个。现在不再猜测，只区分"目录是否存在"。
     */
    public Path resolveAssetsDir() {
        return RuntimePaths.getAssetsDir();
    }

    /** 解析安装包内随包发布的素材目录；开发模式或未传入时返回 null。 */
    public Path resolveBundledAssetsDir() {
        if (bundledAssetsPath == null || bundledAssetsPath.isBlank()) {
            return null;
        }
        return Paths.get(bundledAssetsPath).normalize();
    }

    /**
     * 素材自检：返回素材目录、关键素材是否存在、缺失清单。
     */
    public Map<String, Object> diagnostics() {
        Map<String, Object> result = new LinkedHashMap<>();

        Path assetsDir = resolveAssetsDir();
        File assetsFile = assetsDir.toFile();
        Path bundledDir = resolveBundledAssetsDir();

        result.put("assetsDir", assetsDir.toAbsolutePath().toString());
        result.put("assetsDirExists", assetsFile.isDirectory());
        result.put("workingDir", Paths.get(".").toAbsolutePath().normalize().toString());
        result.put("bundledDir", bundledDir == null ? "" : bundledDir.toAbsolutePath().toString());
        result.put("bundledAvailable", bundledDir != null && bundledDir.toFile().isDirectory());

        List<Map<String, Object>> checks = new ArrayList<>();
        List<String> missing = new ArrayList<>();

        for (String name : REQUIRED_UI_FILES) {
            checkFile(checks, missing, assetsDir, "ui/" + name, "UI 素材");
        }
        for (String name : REQUIRED_FONT_FILES) {
            checkFile(checks, missing, assetsDir, name, "字体");
        }
        // 特效素材（对话特效图）按内容命名，逐个列举不现实，这里做目录级检查：必须存在且非空
        checkDirNotEmpty(checks, missing, assetsDir, "effects", "特效素材");

        result.put("checks", checks);
        result.put("missing", missing);
        result.put("ok", missing.isEmpty());
        return result;
    }

    /**
     * 从安装包补齐缺失素材，并返回补齐统计与补齐后的自检结果。
     *
     * <p>只补"目标不存在或长度为 0"的文件，已存在的文件（含用户自己上传/替换的素材）保持原样。
     * 方法加了同步：启动时的自动补齐与用户在设置页点按钮可能同时发生。
     */
    public synchronized Map<String, Object> repair() {
        Path bundledDir = resolveBundledAssetsDir();
        Path assetsDir = resolveAssetsDir();

        if (bundledDir == null) {
            logger.info("未提供安装包素材目录（开发模式），跳过素材补齐");
        } else {
            logger.info("开始从安装包补齐素材: bundled={}, target={}", bundledDir.toAbsolutePath(),
                    assetsDir.toAbsolutePath());
        }

        BundledAssetSync.SyncResult sync = BundledAssetSync.sync(bundledDir, assetsDir);
        if (sync.bundledAvailable) {
            if (sync.copied > 0 || !sync.isOk()) {
                logger.info("素材补齐结果: 扫描={} 补齐={} 已存在={} 失败={}",
                        sync.bundledFiles, sync.copied, sync.skipped, sync.failed.size());
            } else {
                logger.info("素材齐全，无需补齐（共 {} 个文件）", sync.bundledFiles);
            }
            if (!sync.failed.isEmpty()) {
                logger.warn("素材补齐存在失败项: {}", sync.failed);
            }
        }
        if (sync.copied > 0) {
            logger.info("本次补上的素材: {}", sync.copiedFiles);
        }

        Map<String, Object> diagnostics = diagnostics();
        if (Boolean.TRUE.equals(diagnostics.get("ok"))) {
            logger.info("素材自检通过: assetsDir={}", diagnostics.get("assetsDir"));
        } else {
            logger.warn("素材自检发现缺失素材: assetsDir={}, missing={}", diagnostics.get("assetsDir"),
                    diagnostics.get("missing"));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sync", sync.toMap());
        result.put("diagnostics", diagnostics);
        return result;
    }

    private void checkFile(List<Map<String, Object>> checks, List<String> missing,
            Path assetsDir, String relativePath, String category) {
        Path file = assetsDir.resolve(relativePath);
        File f = file.toFile();
        boolean exists = f.isFile();

        Map<String, Object> item = new LinkedHashMap<>();
        item.put("category", category);
        item.put("path", relativePath);
        item.put("exists", exists);
        item.put("size", exists ? f.length() : 0L);
        checks.add(item);

        if (!exists) {
            missing.add(relativePath);
        }
    }

    private void checkDirNotEmpty(List<Map<String, Object>> checks, List<String> missing,
            Path assetsDir, String relativePath, String category) {
        Path dir = assetsDir.resolve(relativePath);
        int fileCount = countFiles(dir);
        boolean exists = fileCount > 0;

        Map<String, Object> item = new LinkedHashMap<>();
        item.put("category", category);
        item.put("path", relativePath + "/");
        item.put("exists", exists);
        item.put("size", 0L);
        item.put("files", fileCount);
        checks.add(item);

        if (!exists) {
            missing.add(relativePath + "/");
        }
    }

    private int countFiles(Path dir) {
        if (!Files.isDirectory(dir)) {
            return 0;
        }
        try (Stream<Path> walk = Files.walk(dir)) {
            return (int) walk.filter(Files::isRegularFile).count();
        } catch (Exception e) {
            logger.debug("统计素材文件数失败: {} ({})", dir, e.getMessage());
            return 0;
        }
    }
}
