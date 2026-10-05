package com.lbc_plot.common.util;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * 安装包素材补齐工具。
 *
 * <p>安装版把随包发布的 {@code assets/}（安装目录 {@code resources/assets}）复制到用户数据目录。
 * 原来的复制只在"目标目录不存在"时执行一次，因此下面两种情况下 {@code ui/}、{@code effects/}
 * 这类必需素材会永久缺失，而预览图渲染/视频导出会直接失败：
 *
 * <ul>
 *   <li>首次复制被中断（杀软拦截、磁盘写满、用户强退）→ 目录已存在但文件不全；</li>
 *   <li>旧版本升级到带新素材的新版本 → 目标目录早已存在，新素材永远不会到位。</li>
 * </ul>
 *
 * <p>本工具改成"逐文件补齐"：以安装包内的素材为基准，只复制<b>目标缺失或长度为 0</b> 的文件，
 * 已存在的文件一律保留（用户自己上传/替换的素材不会被覆盖），也不会删除任何文件。
 */
public final class BundledAssetSync {

    private BundledAssetSync() {
    }

    /**
     * 把 {@code bundledDir} 中缺失的文件补齐到 {@code targetDir}。
     *
     * @param bundledDir 安装包内随包发布的素材目录，可为 null
     * @param targetDir  运行时使用的素材目录（通常为用户数据目录下的 assets）
     * @return 本次补齐的统计结果，不会抛异常
     */
    public static SyncResult sync(Path bundledDir, Path targetDir) {
        SyncResult result = new SyncResult();
        if (bundledDir == null) {
            result.note = "未提供安装包素材目录（开发模式）";
            return result;
        }
        result.bundledDir = bundledDir.toAbsolutePath().normalize().toString();
        result.targetDir = targetDir == null ? "" : targetDir.toAbsolutePath().normalize().toString();

        if (!Files.isDirectory(bundledDir)) {
            result.note = "安装包素材目录不存在";
            return result;
        }
        if (targetDir == null) {
            result.note = "无法确定素材目标目录";
            return result;
        }
        result.bundledAvailable = true;

        try {
            Files.createDirectories(targetDir);
        } catch (IOException e) {
            result.failed.add("创建素材目录失败: " + e.getMessage());
            result.note = "创建素材目录失败";
            return result;
        }

        try (Stream<Path> walk = Files.walk(bundledDir)) {
            walk.filter(Files::isRegularFile)
                    .forEach(src -> copyOne(bundledDir, targetDir, src, result));
        } catch (IOException e) {
            result.failed.add("遍历安装包素材失败: " + e.getMessage());
        }

        result.note = result.failed.isEmpty() ? "补齐完成" : "补齐完成但存在失败项";
        return result;
    }

    private static void copyOne(Path bundledDir, Path targetDir, Path src, SyncResult result) {
        Path relative = bundledDir.relativize(src);
        Path dst = targetDir.resolve(relative);
        result.bundledFiles++;
        try {
            if (Files.isRegularFile(dst) && Files.size(dst) > 0) {
                result.skipped++;
                return;
            }
            Path parent = dst.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            Files.copy(src, dst, StandardCopyOption.REPLACE_EXISTING);
            result.copied++;
            result.copiedFiles.add(toUnixPath(relative));
        } catch (IOException e) {
            result.failed.add(toUnixPath(relative) + " (" + e.getMessage() + ")");
        }
    }

    private static String toUnixPath(Path path) {
        return path.toString().replace('\\', '/');
    }

    /** 补齐结果。字段名与返回给前端的 JSON 保持一致。 */
    public static final class SyncResult {

        /** 安装包内素材目录（绝对路径），未提供时为空串 */
        public String bundledDir = "";
        /** 运行时素材目录（绝对路径） */
        public String targetDir = "";
        /** 安装包内素材目录是否存在可用 */
        public boolean bundledAvailable;
        /** 安装包内扫描到的文件总数 */
        public int bundledFiles;
        /** 本次实际补上的文件数（缺失或 0 字节） */
        public int copied;
        /** 目标已存在、按原样保留的文件数 */
        public int skipped;
        /** 失败项（相对路径 + 原因） */
        public final List<String> failed = new ArrayList<>();
        /** 本次补上的文件（相对路径，便于排查） */
        public final List<String> copiedFiles = new ArrayList<>();
        /** 一句话说明当前状态 */
        public String note = "";

        public boolean isOk() {
            return failed.isEmpty();
        }

        public Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("bundledDir", bundledDir);
            map.put("targetDir", targetDir);
            map.put("bundledAvailable", bundledAvailable);
            map.put("bundledFiles", bundledFiles);
            map.put("copied", copied);
            map.put("skipped", skipped);
            map.put("failed", failed);
            map.put("copiedFiles", copiedFiles);
            map.put("note", note);
            map.put("ok", isOk());
            return map;
        }
    }
}
