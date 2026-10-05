package com.lbc_plot.common.controller;

import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.config.ProjectConfig;

/**
 * 资源自检接口。
 *
 * <p>安装版把 {@code assets/} 从安装目录复制到用户数据目录，后端以用户数据目录为工作目录运行。
 * 一旦复制不完整（杀软拦截、复制中断、旧版本升级），预览图渲染会失败但错误信息不明确。
 * 该接口用于把"缺哪个素材、素材目录在哪"直接告诉前端和用户。
 */
@RestController
@RequestMapping("/api/diagnostics")
public class DiagnosticsController {

    private static final Logger logger = LoggerFactory.getLogger(DiagnosticsController.class);

    /** 预览图渲染必需的关键素材（相对 assets/ui 目录） */
    private static final String[] REQUIRED_UI_FILES = {
            "border_1080p.png",
            "dialogBox.png",
            "speaker-camp.png",
            "speaker-name.png",
            "location.png"
    };

    /** 关键字体（相对 assets 目录） */
    private static final String[] REQUIRED_FONT_FILES = {
            "fonts/ChineseFont.ttf"
    };

    /**
     * 资源自检：返回素材目录、关键素材是否存在、缺失清单。
     */
    @GetMapping("/assets")
    public Map<String, Object> assetDiagnostics() {
        Map<String, Object> result = new LinkedHashMap<>();

        Path assetsDir = resolveAssetsDir();
        File assetsFile = assetsDir.toFile();

        result.put("assetsDir", assetsDir.toAbsolutePath().toString());
        result.put("assetsDirExists", assetsFile.isDirectory());
        result.put("workingDir", Paths.get(".").toAbsolutePath().normalize().toString());

        List<Map<String, Object>> checks = new ArrayList<>();
        List<String> missing = new ArrayList<>();

        for (String name : REQUIRED_UI_FILES) {
            checkFile(checks, missing, assetsDir, "ui/" + name, "UI 素材");
        }
        for (String name : REQUIRED_FONT_FILES) {
            checkFile(checks, missing, assetsDir, name, "字体");
        }

        result.put("checks", checks);
        result.put("missing", missing);
        result.put("ok", missing.isEmpty());

        if (missing.isEmpty()) {
            logger.info("资源自检通过: assetsDir={}", assetsDir.toAbsolutePath());
        } else {
            logger.warn("资源自检发现缺失素材: assetsDir={}, missing={}", assetsDir.toAbsolutePath(), missing);
        }

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

    /**
     * 解析 assets 目录。
     *
     * <p>与 {@link ProjectConfig} 的配置保持一致，若配置的目录不存在，则回退到
     * 相对工作目录的 assets、上级目录的 assets（开发期从 demo/ 启动的兼容路径）。
     * 不使用 classpath 解析，避免与 jar 内路径混淆。
     */
    private Path resolveAssetsDir() {
        List<Path> candidates = new ArrayList<>();
        String configured = ProjectConfig.ASSETS_BASE_PATH;
        if (configured != null && !configured.isBlank()) {
            candidates.add(Paths.get(configured));
        }
        candidates.add(Paths.get("./assets"));
        candidates.add(Paths.get("../assets"));

        for (Path candidate : candidates) {
            if (candidate.toFile().isDirectory()) {
                return candidate.normalize();
            }
        }
        // 都不存在时返回配置路径，便于用户看到期望位置
        return candidates.get(0).normalize();
    }
}
