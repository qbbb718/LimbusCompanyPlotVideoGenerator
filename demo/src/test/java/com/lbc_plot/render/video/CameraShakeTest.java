package com.lbc_plot.render.video;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.plot.model.Record;

/**
 * 镜头摇动（摄像机预设 {@code CAMERA_SHAKE}）。
 *
 * <p>与前端 {@code cameraShake.test.ts} 用**同一组参数与期望值**（周期 4 帧，
 * 峰值正好落在整数帧上）：两端各跑一遍，就等于锁住了"预览晃的幅度/相位/包络 == 成片"。
 */
@DisplayName("镜头摇动 - 求值")
class CameraShakeTest {

    private static Record recordWith(EffectVisual... effects) {
        Record record = new Record.Builder().uuid("shake").build();
        for (EffectVisual effect : effects) {
            record.addEffectVisual(effect);
        }
        return record;
    }

    private static EffectVisual shake(Double amplitude, Double period) {
        EffectVisual effect = new EffectVisual(EffectVisual.TYPE_CAMERA_SHAKE);
        effect.setAmplitude(amplitude);
        effect.setPeriodFrames(period);
        return effect;
    }

    private static EffectVisual shakeWithTiming(Double duration, Double fadeIn, Double fadeOut) {
        EffectVisual effect = shake(10d, 4d);
        effect.setDurationFrames(duration);
        effect.setFadeInFrames(fadeIn);
        effect.setFadeOutFrames(fadeOut);
        return effect;
    }

    @Test
    @DisplayName("没有这一条 / 被禁用 → 不生效")
    void inactiveWithoutEnabledEffect() {
        assertNull(CameraShake.configOf(recordWith()));
        assertNull(CameraShake.configOf(recordWith(new EffectVisual(EffectVisual.TYPE_FADE_FROM_BLACK))));

        EffectVisual disabled = shake(10d, 4d);
        disabled.setEnabled(false);
        assertNull(CameraShake.configOf(recordWith(disabled)));
    }

    @Test
    @DisplayName("缺省幅度/周期/时长/渐入渐出与前端一致，非法值回落缺省")
    void defaultsMatchFrontend() {
        CameraShake.Config defaults = CameraShake.configOf(recordWith(shake(null, null)));
        assertEquals(CameraShake.DEFAULT_AMPLITUDE, defaults.amplitude, 1e-9);
        assertEquals(CameraShake.DEFAULT_PERIOD_FRAMES, defaults.periodFrames, 1e-9);
        assertEquals(0d, defaults.durationFrames, 1e-9);
        assertEquals(0d, defaults.fadeInFrames, 1e-9);
        assertEquals(0d, defaults.fadeOutFrames, 1e-9);

        CameraShake.Config sanitized = CameraShake.configOf(recordWith(shake(-3d, 0d)));
        assertEquals(CameraShake.DEFAULT_AMPLITUDE, sanitized.amplitude, 1e-9);
        assertEquals(CameraShake.DEFAULT_PERIOD_FRAMES, sanitized.periodFrames, 1e-9);

        // 时长/渐入/渐出：负数按 0（= 不分段），0 本身是合法值
        EffectVisual negative = shakeWithTiming(-5d, -1d, -2d);
        CameraShake.Config negativeConfig = CameraShake.configOf(recordWith(negative));
        assertEquals(0d, negativeConfig.durationFrames, 1e-9);
        assertEquals(0d, negativeConfig.fadeInFrames, 1e-9);
        assertEquals(0d, negativeConfig.fadeOutFrames, 1e-9);
    }

    @Test
    @DisplayName("第 0 帧不动；四分之一周期到峰值；整周期回 0")
    void formulaMatchesFrontend() {
        CameraShake.Config config = CameraShake.configOf(recordWith(shake(10d, 4d)));

        double[] atZero = CameraShake.offsetOf(config, 0, 0);
        assertEquals(0d, atZero[0], 1e-9);
        assertEquals(0d, atZero[1], 1e-9);

        double[] atQuarter = CameraShake.offsetOf(config, 1, 0);
        assertEquals(10d, atQuarter[0], 1e-6);
        assertTrue(Math.abs(atQuarter[1]) < 10d * 0.45d, "纵轴与横轴不同频，四分之一周期时不该也在峰值");

        // 横轴整周期回 0；纵轴周期是 0.73 倍，整数帧上不会同时归零（这正是"不像画圆"的原因）
        double[] atFull = CameraShake.offsetOf(config, 4, 0);
        assertEquals(0d, atFull[0], 1e-6);
        assertTrue(Math.abs(atFull[1]) <= 10d * 0.45d + 1e-9);
    }

    @Test
    @DisplayName("持续时长：到点就停；超过记录长度时按记录长度算")
    void durationStopsShake() {
        CameraShake.Config config = CameraShake.configOf(recordWith(shakeWithTiming(10d, 0d, 0d)));

        assertEquals(10d, CameraShake.endFrame(config, 30), 1e-9);
        // 第 9 帧还在晃（周期 4 → 第 9 帧 sin(2π·9/4) = 1，正好是峰值）
        assertEquals(10d, CameraShake.offsetOf(config, 9, 30)[0], 1e-6);
        // 到第 10 帧结束 → 位移 0
        assertEquals(0d, CameraShake.offsetOf(config, 10, 30)[0], 1e-9);

        // 持续时长比记录还长：按记录长度结束
        CameraShake.Config longerThanRecord = CameraShake.configOf(recordWith(shakeWithTiming(300d, 0d, 0d)));
        assertEquals(30d, CameraShake.endFrame(longerThanRecord, 30), 1e-9);

        // 持续时长 = 0：整条记录
        CameraShake.Config wholeRecord = CameraShake.configOf(recordWith(shakeWithTiming(0d, 0d, 0d)));
        assertEquals(30d, CameraShake.endFrame(wholeRecord, 30), 1e-9);
        assertEquals(Double.POSITIVE_INFINITY, CameraShake.endFrame(wholeRecord, 0));
    }

    @Test
    @DisplayName("渐入：0 → 满幅度线性升，第 fadeIn 帧起满幅")
    void fadeInRampsUp() {
        // 周期 4 帧，第 1 帧横轴是峰值 10；渐入 4 帧时包络 1/4
        CameraShake.Config config = CameraShake.configOf(recordWith(shakeWithTiming(0d, 4d, 0d)));

        assertEquals(0d, CameraShake.envelopeAt(config, 0, 30), 1e-9);
        assertEquals(0.25d, CameraShake.envelopeAt(config, 1, 30), 1e-9);
        assertEquals(0.5d, CameraShake.envelopeAt(config, 2, 30), 1e-9);
        assertEquals(1d, CameraShake.envelopeAt(config, 4, 30), 1e-9);

        assertEquals(2.5d, CameraShake.offsetOf(config, 1, 30)[0], 1e-6);
        assertEquals(10d, CameraShake.offsetOf(config, 5, 30)[0], 1e-6);
    }

    @Test
    @DisplayName("渐出：对齐记录结尾往回推，末帧归 0")
    void fadeOutRampsDown() {
        CameraShake.Config config = CameraShake.configOf(recordWith(shakeWithTiming(0d, 0d, 4d)));

        assertEquals(1d, CameraShake.envelopeAt(config, 5, 10), 1e-9);
        assertEquals(1d, CameraShake.envelopeAt(config, 6, 10), 1e-9);
        assertEquals(0.5d, CameraShake.envelopeAt(config, 8, 10), 1e-9);
        assertEquals(0.25d, CameraShake.envelopeAt(config, 9, 10), 1e-9);
        // 最后一帧之后 = 结束
        assertEquals(0d, CameraShake.envelopeAt(config, 10, 10), 1e-9);
    }

    @Test
    @DisplayName("渐入 + 渐出 + 持续时长三者共存：取较小值，不会超过 1")
    void combinedEnvelope() {
        CameraShake.Config config = CameraShake.configOf(recordWith(shakeWithTiming(20d, 4d, 4d)));

        assertEquals(0.5d, CameraShake.envelopeAt(config, 2, 100), 1e-9); // 渐入段（2/4）
        assertEquals(1d, CameraShake.envelopeAt(config, 10, 100), 1e-9); // 中间满幅
        assertEquals(0.5d, CameraShake.envelopeAt(config, 18, 100), 1e-9); // 渐出段（(20-18)/4）
        assertEquals(0d, CameraShake.envelopeAt(config, 20, 100), 1e-9); // 结束
    }

    @Test
    @DisplayName("叠加到相机：屏幕位移要除以 zoom，推近时晃动幅度不变")
    void shiftsCenterByZoom() {
        Camera camera = new Camera(960f, 540f, 2f);
        Record record = recordWith(shake(10d, 4d));
        Camera shaken = CameraShake.apply(camera, record, 1, 30);
        double[] offset = CameraShake.offsetOf(CameraShake.configOf(record), 1, 30);

        assertEquals(960f - 10f / 2f, shaken.getCenterX(), 1e-3f);
        assertEquals(540f - (float) offset[1] / 2f, shaken.getCenterY(), 1e-3f);
        assertEquals(2f, shaken.getZoom(), 1e-6f);
        // 不改入参：调用方还要拿原相机做缓存键
        assertEquals(960f, camera.getCenterX(), 1e-6f);
    }

    @Test
    @DisplayName("第 0 帧 / 没启用 / 摇动已结束 → 原样返回同一个相机")
    void returnsSameCameraWhenNoShift() {
        Camera camera = new Camera(960f, 540f, 1f);
        assertSame(camera, CameraShake.apply(camera, recordWith(shake(10d, 4d)), 0, 30));
        assertSame(camera, CameraShake.apply(camera, recordWith(), 5, 30));
        // 持续 10 帧：第 12 帧已经停了
        assertSame(camera,
                CameraShake.apply(camera, recordWith(shakeWithTiming(10d, 0d, 0d)), 12, 30));
    }
}
