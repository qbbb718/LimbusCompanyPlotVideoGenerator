package com.lbc_plot.render.video;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.lbc_plot.config.ProjectConfig;

/**
 * 摄像机：把「世界坐标」映射到「场景画布」。
 *
 * <h2>坐标系</h2>
 * <pre>
 *   世界空间（可以远大于 1920×1080）   背景 / 立绘 / 临时图片 的坐标都在这里
 *        │  scene = (world - center) * zoom + 画布中心
 *        ▼
 *   场景画布 1920×1080（= 摄像机取景）  → 再 ×0.8 并偏移 (192,108) 贴到设计画布
 * </pre>
 *
 * <p>只有「场景层」（背景 / 立绘 / 临时图片）经过摄像机；边框、对话框、角色名片、地点牌、
 * 台词文字都在设计画布上直接绘制，**不受摄像机影响**。
 *
 * <h2>向后兼容</h2>
 * 缺省值 (960, 540, 1.0) 是恒等变换，也就是加摄像机之前的效果：
 * {@link #isIdentity()} 为真时渲染器走原来那条完全不经过换算的路径，旧工程逐像素不变。
 *
 * <p>坐标与缩放的语义与前端「剧情编辑 → 摄像机模式」一致（见 preview/previewLayout.ts 的
 * {@code worldToScene} / {@code clampCamera}），改这里的常量要同步那边。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class Camera {

    /** 取景中心 X（世界坐标；960 = 画布中心） */
    private float centerX = ProjectConfig.VIDEO_WIDTH / 2f;
    /** 取景中心 Y（世界坐标；540 = 画布中心） */
    private float centerY = ProjectConfig.VIDEO_HEIGHT / 2f;
    /** 1 = 取景框正好 1920×1080；2 = 放大一倍（取景框缩到一半） */
    private float zoom = 1f;

    /**
     * 终点镜头（C2 的"起止镜头"）；null = 静止镜头。
     *
     * <p>形状与起点相同，所以直接复用本类：JSON 里是 {@code "to": {"centerX":..., ...}}。
     */
    private Camera to;

    /**
     * 缓动：linear / easeIn / easeOut / easeInOut。
     *
     * <p>缺省 **easeOut（慢出）**，与前端 cameraView.DEFAULT_CAMERA_EASING 一致：
     * 拖出一个终点镜头时默认就是"起速快、收尾慢"，比匀速自然。
     */
    private String easing = "easeOut";

    /** 运镜时长的默认值（帧）：24 帧 @30fps = 0.8 秒 */
    public static final int DEFAULT_MOVE_FRAMES = 24;

    /**
     * 从起点走到终点用多少帧。
     *
     * <p>走完之后镜头**停住**，等这条记录剩下的时间播完。
     * 缺省 24；非法值（<1）一律回退默认值。
     */
    private int moveFrames = DEFAULT_MOVE_FRAMES;

    /** 与前端 MIN_CAMERA_ZOOM / MAX_CAMERA_ZOOM 保持一致 */
    private static final float MIN_ZOOM = 0.5f;
    private static final float MAX_ZOOM = 4f;
    /** 判定"恒等"的容差：小于半个像素、且缩放基本为 1 时按恒等处理 */
    private static final float IDENTITY_EPSILON = 0.5f;

    public Camera() {
    }

    public Camera(float centerX, float centerY, float zoom) {
        this.centerX = centerX;
        this.centerY = centerY;
        this.zoom = zoom;
    }

    @JsonProperty
    public float getCenterX() {
        return centerX;
    }

    public void setCenterX(float centerX) {
        this.centerX = centerX;
    }

    @JsonProperty
    public float getCenterY() {
        return centerY;
    }

    public void setCenterY(float centerY) {
        this.centerY = centerY;
    }

    @JsonProperty
    public float getZoom() {
        return zoom;
    }

    public void setZoom(float zoom) {
        this.zoom = zoom;
    }

    @JsonProperty
    public Camera getTo() {
        return to;
    }

    public void setTo(Camera to) {
        this.to = to;
    }

    @JsonProperty
    public String getEasing() {
        return easing;
    }

    public void setEasing(String easing) {
        this.easing = easing;
    }

    @JsonProperty
    public int getMoveFrames() {
        return moveFrames;
    }

    public void setMoveFrames(int moveFrames) {
        this.moveFrames = moveFrames;
    }

    /** 归一化后的运镜时长：<1 一律按 {@link #DEFAULT_MOVE_FRAMES} */
    @JsonIgnore
    public int getMoveFramesSafe() {
        return moveFrames >= 1 ? moveFrames : DEFAULT_MOVE_FRAMES;
    }

    /**
     * 第 {@code frameIndex} 帧的镜头进度（0~1）。
     *
     * <p>`moveFrames` 帧内走完：第 0 帧还在起点，第 `moveFrames - 1` 帧到终点，之后保持 1。
     * 与前端 `cameraView.cameraProgressOf` 是同一个公式（预览、最终效果播放、导出必须一致）。
     *
     * @param frameIndex 从 0 开始的帧序
     * @param moveFrames 运镜时长（帧），<1 时按默认值
     */
    @JsonIgnore
    public static float progressAt(int frameIndex, int moveFrames) {
        int total = moveFrames >= 1 ? moveFrames : DEFAULT_MOVE_FRAMES;
        if (frameIndex <= 0) {
            return 0f;
        }
        if (total <= 1) {
            return 1f;
        }
        return Math.min(1f, frameIndex / (float) (total - 1));
    }

    /**
     * 镜头在动吗：有终点，且终点与起点确实不同（差半个像素以内当静止）。
     *
     * <p>渲染端据此决定"整段只渲一次静态层"还是"每帧重渲"。
     */
    @JsonIgnore
    public boolean isAnimated() {
        if (to == null) {
            return false;
        }
        return Math.abs(to.centerX - centerX) > 0.5f
                || Math.abs(to.centerY - centerY) > 0.5f
                || Math.abs(to.getZoomFactor() - getZoomFactor()) > 1e-4f;
    }

    /**
     * 缓动进度（0~1 → 0~1）。
     *
     * <p>三次曲线，与前端 cameraView.easeProgress 完全一致（两边必须同一条曲线，
     * 否则 DOM 播放和成片对不上）。
     */
    @JsonIgnore
    public static float ease(float t, String easing) {
        float clamped = Math.max(0f, Math.min(1f, t));
        String curve = easing == null ? "linear" : easing;
        switch (curve) {
            case "easeIn":
                return clamped * clamped * clamped;
            case "easeOut":
                float inv = 1f - clamped;
                return 1f - inv * inv * inv;
            case "easeInOut":
                if (clamped < 0.5f) {
                    return 4f * clamped * clamped * clamped;
                }
                float rest = 1f - clamped;
                return 1f - 4f * rest * rest * rest;
            case "linear":
            default:
                return clamped;
        }
    }

    /**
     * 取 t（0~1）时刻的镜头。
     *
     * <p>静止镜头永远返回自身；动画镜头按缓动插值，返回的 Camera 不带 {@code to}
     * （已经是"某一瞬间"的镜头，不能再拿去做动画）。
     *
     * @param camera 记录里的镜头（可为 null）
     * @param t      0 = 起点，1 = 终点
     */
    @JsonIgnore
    public static Camera at(Camera camera, float t) {
        if (camera == null) {
            return new Camera();
        }
        if (!camera.isAnimated()) {
            return camera;
        }
        float progress = ease(t, camera.easing);
        Camera frame = new Camera(
                camera.centerX + (camera.to.centerX - camera.centerX) * progress,
                camera.centerY + (camera.to.centerY - camera.centerY) * progress,
                camera.zoom + (camera.to.zoom - camera.zoom) * progress);
        return frame;
    }

    /**
     * 归一化后的缩放：非数字 / 非正数按 1，越界收敛到 [0.5, 4]。
     * 与前端 normalizeCamera 同一套兜底，保证界面显示的数值与实际渲染一致。
     */
    @JsonIgnore
    public float getZoomFactor() {
        if (!Float.isFinite(zoom) || zoom <= 0f) {
            return 1f;
        }
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    }

    /** 世界 X → 场景画布 X */
    @JsonIgnore
    public int screenX(float worldX) {
        return Math.round((worldX - centerX) * getZoomFactor() + ProjectConfig.VIDEO_WIDTH / 2f);
    }

    /** 世界 Y → 场景画布 Y */
    @JsonIgnore
    public int screenY(float worldY) {
        return Math.round((worldY - centerY) * getZoomFactor() + ProjectConfig.VIDEO_HEIGHT / 2f);
    }

    /** 图层缩放也要跟着乘以 zoom（世界里的 1 像素 = 场景里的 zoom 像素） */
    @JsonIgnore
    public float screenScale(float worldScale) {
        return worldScale * getZoomFactor();
    }

    /**
     * 是否恒等（= 加摄像机之前的效果）。
     *
     * <p>渲染器在这里短路，避免给旧工程引入取整误差。
     */
    @JsonIgnore
    public boolean isIdentity() {
        if (!Float.isFinite(centerX) || !Float.isFinite(centerY)) {
            return true;
        }
        return Math.abs(getZoomFactor() - 1f) < 1e-4f
                && Math.abs(centerX - ProjectConfig.VIDEO_WIDTH / 2f) < IDENTITY_EPSILON
                && Math.abs(centerY - ProjectConfig.VIDEO_HEIGHT / 2f) < IDENTITY_EPSILON;
    }

    @Override
    public String toString() {
        return String.format("Camera{center=(%.1f,%.1f), zoom=%.3f}", centerX, centerY, getZoomFactor());
    }
}
