package com.lbc_plot.common.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.common.service.AssetMaintenanceService;

/**
 * 资源自检 / 素材补齐接口。
 *
 * <p>安装版把 {@code assets/} 从安装目录复制到用户数据目录，后端以用户数据目录为工作目录运行。
 * 一旦复制不完整（杀软拦截、复制中断、旧版本升级），预览图渲染与视频导出会失败但错误信息不明确。
 * 该接口用于把"缺哪个素材、素材目录在哪"直接告诉前端和用户，并提供一键补齐。
 *
 * <p>具体逻辑见 {@link AssetMaintenanceService}。
 */
@RestController
@RequestMapping("/api/diagnostics")
public class DiagnosticsController {

    private final AssetMaintenanceService assetMaintenanceService;

    public DiagnosticsController(AssetMaintenanceService assetMaintenanceService) {
        this.assetMaintenanceService = assetMaintenanceService;
    }

    /**
     * 资源自检：返回素材目录、安装包素材目录、关键素材是否存在、缺失清单。
     */
    @GetMapping("/assets")
    public Map<String, Object> assetDiagnostics() {
        return assetMaintenanceService.diagnostics();
    }

    /**
     * 从安装包补齐缺失素材（可反复调用，幂等）。
     *
     * <p>只补目标缺失或长度为 0 的文件，已存在的素材（含用户自己上传/替换的）不会被覆盖，
     * 也不会删除任何文件。返回本次补齐统计 + 补齐之后的自检结果。
     */
    @PostMapping("/assets/sync")
    public Map<String, Object> syncAssets() {
        return assetMaintenanceService.repair();
    }

    /**
     * 渲染缓存现状（排查"为什么预览图不刷新 / 内存占用高"时用）。
     *
     * <p>返回解码图片缓存（{@link com.lbc_plot.common.util.io.ImageCache}）的条目数、占用字节、
     * 上限与命中率，以及说话人名片的缓存条目数。命中率长期偏低通常意味着缓存上限太小
     * （可用启动参数 {@code -Dlbc.image.cache.mb=384} 调大）。
     */
    @GetMapping("/render-cache")
    public Map<String, Object> renderCache() {
        var stats = com.lbc_plot.common.util.io.ImageCache.stats();
        long total = stats.hits + stats.misses;
        Map<String, Object> response = new java.util.LinkedHashMap<>();
        response.put("imageCacheMaxBytes", stats.maxBytes);
        response.put("imageCacheBytes", stats.bytes);
        response.put("imageCacheEntries", stats.entries);
        response.put("imageCacheHits", stats.hits);
        response.put("imageCacheMisses", stats.misses);
        response.put("imageCacheHitRate", total == 0 ? 0.0 : Math.round(stats.hits * 1000.0 / total) / 1000.0);
        response.put("namePlateCacheEntries",
                com.lbc_plot.render.engine.RenderOfImage.namePlateCacheSize());
        return response;
    }
}
