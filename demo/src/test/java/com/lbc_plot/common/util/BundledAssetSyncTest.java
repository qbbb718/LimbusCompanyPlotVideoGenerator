package com.lbc_plot.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * {@link BundledAssetSync} 的单元测试：只补缺失、不覆盖已有、不删除任何文件。
 */
class BundledAssetSyncTest {

    private static void write(Path file, String content) throws IOException {
        Path parent = file.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.write(file, content.getBytes(StandardCharsets.UTF_8));
    }

    private static Path bundled(Path root) throws IOException {
        Path bundled = root.resolve("bundled").resolve("assets");
        write(bundled.resolve("ui").resolve("border_1080p.png"), "ui-border");
        write(bundled.resolve("ui").resolve("dialogBox.png"), "ui-dialog");
        write(bundled.resolve("effects").resolve("fx-1.png"), "effect-1");
        write(bundled.resolve("effects").resolve("fx-2.png"), "effect-2");
        write(bundled.resolve("fonts").resolve("ChineseFont.ttf"), "font");
        return bundled;
    }

    @Test
    void copiesEveryMissingFileIncludingNestedDirs(@TempDir Path root) throws IOException {
        Path bundled = bundled(root);
        Path target = root.resolve("userdata").resolve("assets");

        BundledAssetSync.SyncResult result = BundledAssetSync.sync(bundled, target);

        assertTrue(result.bundledAvailable);
        assertTrue(result.isOk(), "不应有失败项: " + result.failed);
        assertEquals(5, result.bundledFiles);
        assertEquals(5, result.copied);
        assertEquals(0, result.skipped);

        assertEquals("ui-border", Files.readString(target.resolve("ui").resolve("border_1080p.png")));
        assertEquals("effect-2", Files.readString(target.resolve("effects").resolve("fx-2.png")));
        assertEquals("font", Files.readString(target.resolve("fonts").resolve("ChineseFont.ttf")));
    }

    @Test
    void keepsExistingFilesUntouchedAndOnlyFillsTheGaps(@TempDir Path root) throws IOException {
        Path bundled = bundled(root);
        Path target = root.resolve("userdata").resolve("assets");

        // 用户自己替换过的 ui 素材 + 已经存在的一个特效文件：都必须原样保留
        write(target.resolve("ui").resolve("dialogBox.png"), "user-customized");
        write(target.resolve("effects").resolve("fx-1.png"), "effect-1");

        BundledAssetSync.SyncResult result = BundledAssetSync.sync(bundled, target);

        assertTrue(result.isOk(), "不应有失败项: " + result.failed);
        assertEquals(3, result.copied, "只应补 ui/border_1080p.png、effects/fx-2.png、fonts/ChineseFont.ttf");
        assertEquals(2, result.skipped);
        assertEquals("user-customized", Files.readString(target.resolve("ui").resolve("dialogBox.png")));
        assertEquals("ui-border", Files.readString(target.resolve("ui").resolve("border_1080p.png")));
    }

    @Test
    void replacesZeroByteFileLeftByInterruptedCopy(@TempDir Path root) throws IOException {
        Path bundled = bundled(root);
        Path target = root.resolve("userdata").resolve("assets");

        Path broken = target.resolve("ui").resolve("border_1080p.png");
        Files.createDirectories(broken.getParent());
        Files.createFile(broken); // 0 字节 = 上次复制中断的残留

        BundledAssetSync.SyncResult result = BundledAssetSync.sync(bundled, target);

        assertTrue(result.isOk(), "不应有失败项: " + result.failed);
        assertEquals(5, result.copied);
        assertEquals("ui-border", Files.readString(broken));
    }

    @Test
    void isIdempotentWhenTargetIsAlreadyComplete(@TempDir Path root) throws IOException {
        Path bundled = bundled(root);
        Path target = root.resolve("userdata").resolve("assets");

        BundledAssetSync.sync(bundled, target);
        BundledAssetSync.SyncResult second = BundledAssetSync.sync(bundled, target);

        assertEquals(0, second.copied);
        assertEquals(5, second.skipped);
        assertTrue(second.isOk());
    }

    @Test
    void reportsUnavailableWhenBundledDirIsMissingOrNotProvided(@TempDir Path root) throws IOException {
        Path target = root.resolve("userdata").resolve("assets");

        BundledAssetSync.SyncResult noProperty = BundledAssetSync.sync(null, target);
        assertFalse(noProperty.bundledAvailable);
        assertTrue(noProperty.isOk());
        assertEquals(0, noProperty.bundledFiles);
        assertTrue(noProperty.note.contains("开发模式"), "提示应说明是开发模式: " + noProperty.note);

        BundledAssetSync.SyncResult missingDir = BundledAssetSync.sync(root.resolve("not-there"), target);
        assertFalse(missingDir.bundledAvailable);
        assertTrue(missingDir.isOk());
        assertEquals(0, missingDir.copied);
        assertTrue(missingDir.note.contains("不存在"), "提示应说明目录不存在: " + missingDir.note);
    }
}
