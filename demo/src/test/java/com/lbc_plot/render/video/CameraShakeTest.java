package com.lbc_plot.render.video;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.plot.model.Record;

/**
 * 镜头摇动（特效 {@code CAMERA_SHAKE}）。
 *
 * <p>与前端 {@code cameraShake.test.ts} 用**同一组参数与期望值**（周期 4 帧，
 * 峰值正好落在整数帧上）：两端各跑一遍，就等于锁住了"预览晃的幅度/相位 == 成片"。
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
    @DisplayName("缺省幅度/周期与前端一致，非法值回落缺省")
    void defaultsMatchFrontend() {
        double[] defaults = CameraShake.configOf(recordWith(shake(null, null)));
        assertEquals(CameraShake.DEFAULT_AMPLITUDE, defaults[0], 1e-9);
        assertEquals(CameraShake.DEFAULT_PERIOD_FRAMES, defaults[1], 1e-9);

        double[] sanitized = CameraShake.configOf(recordWith(shake(-3d, 0d)));
        assertEquals(CameraShake.DEFAULT_AMPLITUDE, sanitized[0], 1e-9);
        assertEquals(CameraShake.DEFAULT_PERIOD_FRAMES, sanitized[1], 1e-9);
    }

    @Test
    @DisplayName("第 0 帧不动；四分之一周期到峰值；整周期回 0")
    void formulaMatchesFrontend() {
        double[] config = { 10d, 4d };

        double[] atZero = CameraShake.offsetOf(config, 0);
        assertEquals(0d, atZero[0], 1e-9);
        assertEquals(0d, atZero[1], 1e-9);

        double[] atQuarter = CameraShake.offsetOf(config, 1);
        assertEquals(10d, atQuarter[0], 1e-6);
        assertTrue(Math.abs(atQuarter[1]) < 10d * 0.45d, "纵轴与横轴不同频，四分之一周期时不该也在峰值");

        // 横轴整周期回 0；纵轴周期是 0.73 倍，整数帧上不会同时归零（这正是"不像画圆"的原因）
        double[] atFull = CameraShake.offsetOf(config, 4);
        assertEquals(0d, atFull[0], 1e-6);
        assertTrue(Math.abs(atFull[1]) <= 10d * 0.45d + 1e-9);
    }

    @Test
    @DisplayName("叠加到相机：屏幕位移要除以 zoom，推近时晃动幅度不变")
    void shiftsCenterByZoom() {
        Camera camera = new Camera(960f, 540f, 2f);
        Camera shaken = CameraShake.apply(camera, recordWith(shake(10d, 4d)), 1);
        double[] offset = CameraShake.offsetOf(CameraShake.configOf(recordWith(shake(10d, 4d))), 1);

        assertEquals(960f - 10f / 2f, shaken.getCenterX(), 1e-3f);
        assertEquals(540f - (float) offset[1] / 2f, shaken.getCenterY(), 1e-3f);
        assertEquals(2f, shaken.getZoom(), 1e-6f);
        // 不改入参：调用方还要拿原相机做缓存键
        assertEquals(960f, camera.getCenterX(), 1e-6f);
    }

    @Test
    @DisplayName("第 0 帧 / 没启用 → 原样返回同一个相机")
    void returnsSameCameraWhenNoShift() {
        Camera camera = new Camera(960f, 540f, 1f);
        assertSame(camera, CameraShake.apply(camera, recordWith(shake(10d, 4d)), 0));
        assertSame(camera, CameraShake.apply(camera, recordWith(), 5));
    }
}
