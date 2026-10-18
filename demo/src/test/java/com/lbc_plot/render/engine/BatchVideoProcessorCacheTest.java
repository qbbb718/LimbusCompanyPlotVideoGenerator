package com.lbc_plot.render.engine;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.video.EffectVisual;

/**
 * "保留中间文件"的片段复用规则测试。
 *
 * <p>复用片段是导出加速的关键，但复用得不对会直接反映在成片里，所以把判断抽成
 * {@link BatchVideoProcessor#canReuseRenderedClip(Record, boolean)} 单独测：
 * <ul>
 *   <li>记录改过 → 必须重渲；</li>
 *   <li>片段不存在 → 没有可复用的东西；</li>
 *   <li>勾了交叉溶解 → 即使没改过也要重渲：它叠的是上一条记录的最后一帧，
 *       上一条改动/记录换位置都会让旧片段里的叠化画面过期；</li>
 *   <li>黑屏/白屏转场只叠纯色，不依赖其它记录 → 未修改时照常复用缓存。</li>
 * </ul>
 */
@DisplayName("BatchVideoProcessor 片段复用规则")
class BatchVideoProcessorCacheTest {

    @Test
    @DisplayName("未修改且已有片段、没有特效 → 复用")
    void cleanRecordReusesExistingClip() {
        Record clean = new Record.Builder().isDirty(false).build();
        assertTrue(BatchVideoProcessor.canReuseRenderedClip(clean, true));
    }

    @Test
    @DisplayName("记录改过 → 不复用")
    void dirtyRecordIsRerendered() {
        Record dirty = new Record.Builder().isDirty(true).build();
        assertFalse(BatchVideoProcessor.canReuseRenderedClip(dirty, true));
    }

    @Test
    @DisplayName("片段文件不存在 → 不复用")
    void missingClipIsRendered() {
        Record clean = new Record.Builder().isDirty(false).build();
        assertFalse(BatchVideoProcessor.canReuseRenderedClip(clean, false));
    }

    @Test
    @DisplayName("勾了交叉溶解 → 不复用（叠的是上一条记录的画面）")
    void crossDissolveRecordIsAlwaysRerendered() {
        Record record = new Record.Builder()
                .isDirty(false)
                .addEffect(EffectVisual.crossDissolve())
                .build();
        assertFalse(BatchVideoProcessor.canReuseRenderedClip(record, true),
                "交叉溶解记录必须重渲，否则可能叠着上一条改之前的最后一帧");
    }

    @Test
    @DisplayName("黑屏/白屏转场不依赖上一条记录 → 未修改时照常复用")
    void solidColorTransitionsKeepCacheUsable() {
        Record black = new Record.Builder()
                .isDirty(false)
                .addEffect(EffectVisual.fadeFromBlack())
                .build();
        assertTrue(BatchVideoProcessor.canReuseRenderedClip(black, true),
                "黑屏转场只叠纯黑，记录没改过就可以复用缓存");

        Record white = new Record.Builder()
                .isDirty(false)
                .addEffect(EffectVisual.fadeFromWhite())
                .build();
        assertTrue(BatchVideoProcessor.canReuseRenderedClip(white, true),
                "白屏转场只叠纯白，记录没改过就可以复用缓存");
    }

    @Test
    @DisplayName("其它特效 / 未勾选的转场不影响复用")
    void otherEffectsDoNotDisableReuse() {
        EffectVisual disabled = EffectVisual.crossDissolve();
        disabled.setEnabled(false);

        Record otherEffect = new Record.Builder()
                .isDirty(false)
                .addEffect(new EffectVisual("SOMETHING_ELSE"))
                .build();
        assertTrue(BatchVideoProcessor.canReuseRenderedClip(otherEffect, true));

        Record disabledEffect = new Record.Builder()
                .isDirty(false)
                .addEffect(disabled)
                .build();
        assertTrue(BatchVideoProcessor.canReuseRenderedClip(disabledEffect, true));
    }
}
