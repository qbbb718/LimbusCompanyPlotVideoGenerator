package com.lbc_plot.render.video;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 摄像机（C2 起止镜头）单测。
 *
 * <p>锁三件事：
 * 1. 缓动曲线与前端 easeProgress 完全一致（两边不同步，预览与成片就会对不上）；
 * 2. {@link Camera#at} 的插值：t=0 是起点、t=1 是终点、中间按缓动走；
 * 3. 静止镜头不参与动画，{@code isAnimated()} 不能误判。
 */
public class CameraTest {

    private static Camera key(float x, float y, float zoom) {
        return new Camera(x, y, zoom);
    }

    @Test
    void identityCameraIsNotAnimated() {
        Camera camera = new Camera();
        assertFalse(camera.isAnimated());
        // 终点与起点一样也不算动画
        camera.setTo(new Camera(960f, 540f, 1f));
        assertFalse(camera.isAnimated());
        // 差半个像素以内当静止
        camera.setTo(new Camera(960.2f, 540.2f, 1f));
        assertFalse(camera.isAnimated());
    }

    @Test
    void animatedCameraInterpolatesEndpoints() {
        Camera camera = key(960f, 540f, 1f);
        camera.setTo(key(1400f, 700f, 2f));
        assertTrue(camera.isAnimated());

        Camera atStart = Camera.at(camera, 0f);
        assertEquals(960f, atStart.getCenterX(), 0.001f);
        assertEquals(540f, atStart.getCenterY(), 0.001f);
        assertEquals(1f, atStart.getZoom(), 0.001f);
        // 取出来的帧不该再带动画（否则会被二次插值）
        assertFalse(atStart.isAnimated());

        Camera atEnd = Camera.at(camera, 1f);
        assertEquals(1400f, atEnd.getCenterX(), 0.001f);
        assertEquals(700f, atEnd.getCenterY(), 0.001f);
        assertEquals(2f, atEnd.getZoom(), 0.001f);
    }

    @Test
    void easeCurvesMatchFrontend() {
        // 三次曲线：easeIn = t³、easeOut = 1-(1-t)³、easeInOut 分段
        assertEquals(0.125f, Camera.ease(0.5f, "easeIn"), 1e-6f);
        assertEquals(0.875f, Camera.ease(0.5f, "easeOut"), 1e-6f);
        assertEquals(0.5f, Camera.ease(0.5f, "easeInOut"), 1e-6f);
        assertEquals(0.5f, Camera.ease(0.5f, "linear"), 1e-6f);
        // 缺省 / 未知曲线都按匀速
        assertEquals(0.25f, Camera.ease(0.25f, null), 1e-6f);
        assertEquals(0.25f, Camera.ease(0.25f, "what"), 1e-6f);
        // 越界夹到 0~1
        assertEquals(0f, Camera.ease(-1f, "linear"), 1e-6f);
        assertEquals(1f, Camera.ease(2f, "easeIn"), 1e-6f);
    }

    @Test
    void easedInterpolationFollowsCurve() {
        Camera camera = key(0f, 0f, 1f);
        camera.setTo(key(100f, 0f, 1f));
        camera.setEasing("easeIn");
        // t=0.5 → 进度 0.125 → x = 12.5
        assertEquals(12.5f, Camera.at(camera, 0.5f).getCenterX(), 1e-4f);
    }

    @Test
    void zoomIsClampedForBothEndpoints() {
        Camera camera = key(960f, 540f, 99f);
        assertEquals(4f, camera.getZoomFactor(), 1e-6f);
        camera.setTo(key(960f, 540f, 0f));
        assertEquals(1f, camera.getTo().getZoomFactor(), 1e-6f);
    }

    @Test
    void moveFramesDefaultsTo24AndRejectsInvalid() {
        Camera camera = new Camera();
        assertEquals(24, camera.getMoveFrames());
        assertEquals(24, camera.getMoveFramesSafe());
        camera.setMoveFrames(0);
        assertEquals(24, camera.getMoveFramesSafe());
        camera.setMoveFrames(-5);
        assertEquals(24, camera.getMoveFramesSafe());
        camera.setMoveFrames(12);
        assertEquals(12, camera.getMoveFramesSafe());
    }

    @Test
    void progressAtSpansMoveFramesThenHolds() {
        // 24 帧：第 0 帧在起点、第 23 帧到终点，之后一直是 1
        assertEquals(0f, Camera.progressAt(0, 24), 1e-6f);
        assertEquals(11f / 23f, Camera.progressAt(11, 24), 1e-6f);
        assertEquals(1f, Camera.progressAt(23, 24), 1e-6f);
        assertEquals(1f, Camera.progressAt(100, 24), 1e-6f);
        // 1 帧：第 0 帧还在起点，第 1 帧就到终点
        assertEquals(0f, Camera.progressAt(0, 1), 1e-6f);
        assertEquals(1f, Camera.progressAt(1, 1), 1e-6f);
        // 非法时长按默认 24 处理
        assertEquals(1f, Camera.progressAt(23, 0), 1e-6f);
    }
    @Test
    void defaultEasingIsEaseOut() {
        Camera camera = new Camera();
        assertEquals("easeOut", camera.getEasing());
        // 慢出：t=0.5 已走过 87.5%
        assertEquals(0.875f, Camera.ease(0.5f, camera.getEasing()), 1e-6f);
    }}
