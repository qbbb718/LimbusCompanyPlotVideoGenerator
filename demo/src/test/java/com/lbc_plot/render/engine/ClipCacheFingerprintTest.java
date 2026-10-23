package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Path;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;

/**
 * 片段缓存指纹：防止"改了工程级设置却复用老片段"。
 *
 * <p>背景：跳过未修改记录的判断原本只看 {@code isDirty}，而剧情类型 / 分辨率 / 帧率 /
 * 结尾停留帧数都不在记录里。用户把结尾停留从 75 改成 30 再导出，记录没变 → 旧片段被复用 →
 * 成片长度还是老的（音画还会错位）。指纹旁文件就是为了堵这个口子。
 *
 * <p>这里刻意锁住"安全方向"：<b>指纹缺失一律视为不一致</b>。宁可多渲一次，
 * 也不能拿老片段冒充新设置。
 */
class ClipCacheFingerprintTest {

    private static final String LAYER = RenderOfVideo.LAYER_FULL;

    @Test
    @DisplayName("指纹随每个影响成片的设置变化")
    void fingerprintChangesWithSettings() {
        String base = ClipCacheFingerprint.of(true, 1920, 1080, 30, 75, LAYER);
        assertNotEquals(base, ClipCacheFingerprint.of(false, 1920, 1080, 30, 75, LAYER), "剧情类型不同");
        assertNotEquals(base, ClipCacheFingerprint.of(true, 1280, 720, 30, 75, LAYER), "分辨率不同");
        assertNotEquals(base, ClipCacheFingerprint.of(true, 1920, 1080, 60, 75, LAYER), "帧率不同");
        assertNotEquals(base, ClipCacheFingerprint.of(true, 1920, 1080, 30, 30, LAYER), "停留帧数不同");
        assertNotEquals(base, ClipCacheFingerprint.of(true, 1920, 1080, 30, 75,
                RenderOfVideo.LAYER_CHARACTERS_ONLY), "分层不同");
        // 同参数必须稳定（否则每次导出都会误判为"设置变了"从而全量重渲）
        assertTrue(base.equals(ClipCacheFingerprint.of(true, 1920, 1080, 30, 75, LAYER)));
    }

    @Test
    @DisplayName("没有指纹文件 → 不复用（安全方向：重渲一次并补写）")
    void missingFingerprintBlocksReuse(@TempDir Path temp) {
        File clip = temp.resolve("record_a.mp4").toFile();
        writeStub(clip);
        String fingerprint = ClipCacheFingerprint.of(true, 640, 360, 30, 75, LAYER);

        assertFalse(BatchVideoProcessor.canReuseRenderedClip(cleanRecord(), true, fingerprint,
                ClipCacheFingerprint.sidecarOf(clip.getAbsolutePath())),
                "没有指纹时必须重渲");
    }

    @Test
    @DisplayName("指纹一致 → 可以复用")
    void matchingFingerprintAllowsReuse(@TempDir Path temp) {
        File clip = temp.resolve("record_b.mp4").toFile();
        writeStub(clip);
        String fingerprint = ClipCacheFingerprint.of(true, 640, 360, 30, 75, LAYER);
        File sidecar = ClipCacheFingerprint.sidecarOf(clip.getAbsolutePath());
        ClipCacheFingerprint.write(sidecar, fingerprint);

        assertTrue(BatchVideoProcessor.canReuseRenderedClip(cleanRecord(), true, fingerprint, sidecar));
    }

    @Test
    @DisplayName("指纹不一致（用户改了停留帧数/分辨率）→ 不复用")
    void changedSettingsBlockReuse(@TempDir Path temp) {
        File clip = temp.resolve("record_c.mp4").toFile();
        writeStub(clip);
        File sidecar = ClipCacheFingerprint.sidecarOf(clip.getAbsolutePath());
        ClipCacheFingerprint.write(sidecar, ClipCacheFingerprint.of(true, 640, 360, 30, 75, LAYER));

        String newFingerprint = ClipCacheFingerprint.of(true, 640, 360, 30, 30, LAYER);
        assertFalse(BatchVideoProcessor.canReuseRenderedClip(cleanRecord(), true, newFingerprint, sidecar));
    }

    @Test
    @DisplayName("记录被改过 / 片段不存在 → 无论如何都不复用")
    void dirtyOrMissingClipBlocksReuse(@TempDir Path temp) {
        File clip = temp.resolve("record_d.mp4").toFile();
        writeStub(clip);
        String fingerprint = ClipCacheFingerprint.of(true, 640, 360, 30, 75, LAYER);
        File sidecar = ClipCacheFingerprint.sidecarOf(clip.getAbsolutePath());
        ClipCacheFingerprint.write(sidecar, fingerprint);

        Record dirty = cleanRecord();
        dirty.setDirty(true);
        assertFalse(BatchVideoProcessor.canReuseRenderedClip(dirty, true, fingerprint, sidecar));
        assertFalse(BatchVideoProcessor.canReuseRenderedClip(cleanRecord(), false, fingerprint, sidecar));
    }

    /* ==================== 工具 ==================== */

    private static Record cleanRecord() {
        return new Record.Builder()
                .uuid("fingerprint-record")
                .dialogue(Dialogue.builder().text("").speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .isDirty(false)
                .build();
    }

    private static void writeStub(File clip) {
        try {
            java.nio.file.Files.writeString(clip.toPath(), "stub");
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
