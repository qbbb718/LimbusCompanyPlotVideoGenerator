package com.lbc_plot.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import com.lbc_plot.common.service.AssetMaintenanceService;

/**
 * 启动时补齐缺失素材。
 *
 * <p>{@code ui/}、{@code effects/} 等素材是预览图渲染与视频导出的硬依赖。安装版首次启动时
 * Electron 会把随包发布的 {@code assets/} 复制到用户数据目录，但那次复制只在"目标目录不存在"
 * 时执行一次 —— 复制被打断或从旧版本升级上来时，素材会永久缺失。
 *
 * <p>这里在每次后端启动时做一次幂等补齐：以安装包内的素材为基准，只复制目标缺失的文件，
 * 已存在的文件（含用户自己上传/替换的）保持原样，不删除任何文件。开发模式没有
 * {@code app.assets.bundled} 属性，直接跳过。
 */
@Component
public class BundledAssetsInitializer implements CommandLineRunner {

    private static final Logger logger = LoggerFactory.getLogger(BundledAssetsInitializer.class);

    private final AssetMaintenanceService assetMaintenanceService;

    public BundledAssetsInitializer(AssetMaintenanceService assetMaintenanceService) {
        this.assetMaintenanceService = assetMaintenanceService;
    }

    @Override
    public void run(String... args) {
        if (assetMaintenanceService.resolveBundledAssetsDir() == null) {
            logger.info("未提供安装包素材目录（开发模式），跳过启动时素材补齐");
            return;
        }
        try {
            assetMaintenanceService.repair();
        } catch (Exception e) {
            // 素材补齐失败不应阻止应用启动，诊断接口/设置页的按钮仍可再次尝试
            logger.error("启动时补齐素材失败: {}", e.getMessage(), e);
        }
    }
}
