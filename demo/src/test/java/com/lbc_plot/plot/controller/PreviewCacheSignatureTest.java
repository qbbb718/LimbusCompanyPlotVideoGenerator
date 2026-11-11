package com.lbc_plot.plot.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.EffectVisual;

/**
 * 预览图磁盘缓存键（{@link RecordController#previewSignature}）。
 *
 * <p>为什么值得单独测：开关 T 巢滤镜时，记录的 uuid / 立绘 / 文本 / 情绪动画可能<b>一个字节都没变</b>，
 * 而重新打开工程时记录是干净的（不带 {@code forceRefresh}）。缓存键如果不体现滤镜状态，
 * 用户会看到开关明明勾着、预览图却是没染色的旧图——"开关不生效"这类问题最难查。
 *
 * <p>反过来，<b>没开滤镜时必须保持原来的键</b>（返回情绪动画签名本身），
 * 否则这次改动会让所有历史预览缓存一次性作废、全量重渲。
 */
@DisplayName("预览图缓存键 - T 巢滤镜")
class PreviewCacheSignatureTest {

    private static Record recordWith(EffectVisual... effects) {
        Record record = new Record.Builder().uuid("preview-signature").build();
        for (EffectVisual effect : effects) {
            record.addEffectVisual(effect);
        }
        return record;
    }

    @Test
    @DisplayName("没开滤镜：缓存键与改动前完全一致（老缓存继续有效）")
    void offKeepsLegacySignature() {
        assertEquals("none", RecordController.previewSignature(recordWith()),
                "空记录仍是 'none'");
        assertEquals("none",
                RecordController.previewSignature(recordWith(new EffectVisual(EffectVisual.TYPE_CROSS_DISSOLVE))),
                "起始转场不影响画面内容，也不该改键");
        assertEquals("none",
                RecordController.previewSignature(recordWith(new EffectVisual(EffectVisual.TYPE_CAMERA_SHAKE))),
                "镜头摇动沿用旧键（它原本就没有单独签名）");
    }

    @Test
    @DisplayName("开了滤镜：换一个键，避免与未染色的旧图互相覆盖")
    void onChangesSignature() {
        String off = RecordController.previewSignature(recordWith());
        String on = RecordController.previewSignature(recordWith(EffectVisual.tCorpFilter()));

        assertNotEquals(off, on, "开关滤镜必须落在不同的缓存文件上");
        assertTrue(on.contains("tone"), "键里应能看出是染色版本，实际: " + on);
    }

    @Test
    @DisplayName("enabled:false 的条目（手改工程）不改变缓存键")
    void disabledFilterKeepsLegacySignature() {
        EffectVisual disabled = EffectVisual.tCorpFilter();
        disabled.setEnabled(false);

        assertEquals("none", RecordController.previewSignature(recordWith(disabled)));
    }

    @Test
    @DisplayName("同时开滤镜与别的特效：键只由滤镜开关决定，不随无关特效应答而变")
    void unrelatedEffectsDoNotDisturbKey() {
        String toneOnly = RecordController.previewSignature(recordWith(EffectVisual.tCorpFilter()));
        String toneWithTransition = RecordController.previewSignature(
                recordWith(EffectVisual.tCorpFilter(), new EffectVisual(EffectVisual.TYPE_FADE_FROM_BLACK)));

        assertEquals(toneOnly, toneWithTransition,
                "加一条起始转场不该让预览图重新渲染一遍");
    }
}
