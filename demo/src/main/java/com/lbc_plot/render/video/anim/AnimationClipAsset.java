package com.lbc_plot.render.video.anim;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * @module 情绪动画（序列帧）素材
 * 一套可复用的帧序列动画，落盘为 {@code {dataRoot}/assets/animation-clips/<id>/clip.json}
 * + 同目录的 {@code frames/0001.png ...}。
 *
 * <h2>为什么是"一个素材一个目录"，而不是往数据库里加表</h2>
 * <ul>
 *   <li>用户把一批 PNG 丢进目录就能用，不需要开软件、不需要过数据库；</li>
 *   <li>目录即素材包，压缩成 zip 就是"导出动画文件"，解压就是"导入"，不涉及任何迁移；</li>
 *   <li>帧图走已经存在的 {@code /assets/**} 静态映射，前端 {@code <img>} 直接可播，
 *       不需要为预览另开一条数据通道。</li>
 * </ul>
 *
 * <h2>frameHolds 是"每张图占几帧"，不是帧率</h2>
 * 用户的心智模型是"这张停 3 帧、那张停 1 帧"。存帧率（fps）会让"两帧一拍"这种手绘节奏
 * 表达不出来，而且 fps 换成帧数要除、反算要乘，两端必然因为取整而不一致。
 * 存整数帧则完全确定。{@link #getFps()} 只是**契约断言**（全项目恒 30），读到别的值给告警、不做静默换算。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class AnimationClipAsset {

    /** 文件格式标识：防止用户把随便一个 zip 当动画包导入 */
    public static final String KIND = "lbc-animation-clip";

    /** 数据版本；格式变更时 +1，旧文件被拒绝并给出明确原因 */
    private Integer version = 1;

    /** 固定 {@link #KIND} */
    private String kind = KIND;

    /** 素材 id（= 目录名 = URL 段），{@code ^[A-Za-z0-9_-]{1,64}$} */
    private String id;

    /** 显示名 */
    private String name;

    /** 画布宽（所有帧统一贴到这个画布上，保证逐帧几何不跳） */
    private int canvasWidth;

    /** 画布高 */
    private int canvasHeight;

    /** 帧率（契约断言，恒 30） */
    private int fps = 30;

    /** 每帧持续帧数；长度 = 帧数 */
    private List<Integer> frameHolds = new ArrayList<>();

    /* ==================== 播放参数（跟着素材走，跨记录共享） ==================== */

    /**
     * 循环模式：once / hold / loop / pingpong。
     *
     * <p>播放参数放在**素材**上而不是记录上：一段动画的播法是它自身的一部分
     * （"花开"就是淡入一次），不跟着每条记录的台词长短变。要另一种播法就复制一套素材。
     */
    private String loop = "once";

    /** 循环次数；null = 无限（仅 loop / pingpong 有意义） */
    private Integer iterations;

    /** 延迟启动（帧，相对记录开头） */
    private int startFrame;

    /** 淡入帧数（序列局部时间） */
    private int fadeInFrames;

    /** 淡出帧数；loop / pingpong 下会被强制视为 0 */
    private int fadeOutFrames;

    /** 整体不透明度乘子 */
    private float opacity = 1f;

    /**
     * 代表帧配置：显示第几张 + **相对头部区域**的摆放。
     *
     * <p>这就是"在资源管理里把动画摆到脸上"的产物，也是剧情编辑页唯一不暴露、
     * 只按素材渲染的那部分数据。
     */
    private Poster poster = new Poster();

    /** 创建时间戳（毫秒），仅用于列表排序 */
    private long createdAt;

    /** 格式是否自洽（不检查磁盘上到底有几张图，那是 Repository 的事） */
    @JsonIgnore
    public boolean isValid() {
        return id != null && !id.isBlank()
                && canvasWidth > 0 && canvasHeight > 0
                && frameHolds != null && !frameHolds.isEmpty();
    }

    /** 帧数 */
    @JsonIgnore
    public int frameCount() {
        return frameHolds == null ? 0 : frameHolds.size();
    }

    /** 一轮总帧数 */
    @JsonIgnore
    public int totalFrames() {
        if (frameHolds == null || frameHolds.isEmpty()) {
            return 0;
        }
        int[] holds = new int[frameHolds.size()];
        for (int i = 0; i < holds.length; i++) {
            Integer hold = frameHolds.get(i);
            holds[i] = hold == null ? 1 : Math.max(1, hold);
        }
        return SequenceTiming.totalFrames(holds);
    }

    /** 帧率是否与项目约定（30）不一致（告警用，不静默换算） */
    @JsonIgnore
    public boolean isForeignFrameRate() {
        return fps > 0 && fps != 30;
    }

    /** 代表帧的图片序号（收敛到 {@code [0, frameCount-1]}；没有帧时 {@link SequenceTiming#NO_FRAME}） */
    @JsonIgnore
    public int posterFrameIndex() {
        int total = frameCount();
        if (total <= 0) {
            return SequenceTiming.NO_FRAME;
        }
        return Math.min(Math.max(0, poster == null ? 0 : poster.getFrame()), total - 1);
    }

    @Override
    public String toString() {
        return "AnimationClipAsset{id=" + id + ", name=" + name + ", frames=" + frameCount()
                + ", canvas=" + canvasWidth + "x" + canvasHeight + '}';
    }

    /**
     * 代表帧配置。
     *
     * <h2>为什么存"相对头部区域"而不是屏幕坐标</h2>
     * 同一段动画要能挂到不同角色身上。若存绝对坐标，换个身高/站位的角色就飞了。
     * 这里以**脸框（头部方框）**为基准：
     * <ul>
     *   <li>{@code offsetX/offsetY} 的单位是**头部长度**（1.0 = 一个头宽），
     *       所以"头顶往上 0.4 个头"在任何角色身上都是同一个相对位置；</li>
     *   <li>{@code scale} 是素材的缩放倍率（1 = 原始像素）。素材画布尺寸是素材自身的属性，
     *       所以"画面占几个头宽"对同一素材是常量，跨角色一致。</li>
     * </ul>
     *
     * <h2>为什么头部方框是可靠的基准</h2>
     * 立绘的裁剪框 {@code (faceX, faceY, length)} 会被缩放到恒定
     * {@code DEFAULT_CHARACTER_HEAD_LENGTH = 183} 场景像素（见 {@code CharacterVisual.updatePos}），
     * 于是"头部方框在场景里恒为 {@code 183 × 用户缩放}"——**与角色身高、站位、裁剪框大小全部无关**。
     * 这是全项目唯一一个真正跨角色可比的长度尺度。
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Poster {

        /** 显示第几张（0 起） */
        private int frame;

        /** 相对头部区域的水平偏移（单位：头部长度） */
        private double offsetX;

        /** 相对头部区域的垂直偏移（单位：头部长度，+ 向下） */
        private double offsetY;

        /** 缩放倍率（1 = 素材原始像素） */
        private double scale = 1d;

        public Poster() {
        }

        public Poster(int frame, double offsetX, double offsetY, double scale) {
            this.frame = frame;
            this.offsetX = offsetX;
            this.offsetY = offsetY;
            this.scale = scale;
        }

        /** 缩放倍率（非法/非正 → 1） */
        @JsonIgnore
        public double safeScale() {
            return Double.isFinite(scale) && scale > 0 ? scale : 1d;
        }

        /** 水平偏移（单位：头部长度） */
        @JsonIgnore
        public double safeOffsetX() {
            return Double.isFinite(offsetX) ? offsetX : 0d;
        }

        /** 垂直偏移（单位：头部长度） */
        @JsonIgnore
        public double safeOffsetY() {
            return Double.isFinite(offsetY) ? offsetY : 0d;
        }

        @JsonProperty
        public int getFrame() {
            return frame;
        }

        public void setFrame(int frame) {
            this.frame = frame;
        }

        @JsonProperty
        public double getOffsetX() {
            return offsetX;
        }

        public void setOffsetX(double offsetX) {
            this.offsetX = offsetX;
        }

        @JsonProperty
        public double getOffsetY() {
            return offsetY;
        }

        public void setOffsetY(double offsetY) {
            this.offsetY = offsetY;
        }

        @JsonProperty
        public double getScale() {
            return scale;
        }

        public void setScale(double scale) {
            this.scale = scale;
        }
    }

    /* ==================== getter / setter ==================== */

    @JsonProperty
    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer version) {
        this.version = version;
    }

    @JsonProperty
    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    @JsonProperty
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    @JsonProperty
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    @JsonProperty
    public int getCanvasWidth() {
        return canvasWidth;
    }

    public void setCanvasWidth(int canvasWidth) {
        this.canvasWidth = canvasWidth;
    }

    @JsonProperty
    public int getCanvasHeight() {
        return canvasHeight;
    }

    public void setCanvasHeight(int canvasHeight) {
        this.canvasHeight = canvasHeight;
    }

    @JsonProperty
    public int getFps() {
        return fps;
    }

    public void setFps(int fps) {
        this.fps = fps;
    }

    @JsonProperty
    public List<Integer> getFrameHolds() {
        return frameHolds;
    }

    public void setFrameHolds(List<Integer> frameHolds) {
        this.frameHolds = frameHolds;
    }

    @JsonProperty
    public long getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(long createdAt) {
        this.createdAt = createdAt;
    }

    @JsonProperty
    public String getLoop() {
        return loop;
    }

    public void setLoop(String loop) {
        this.loop = loop;
    }

    @JsonProperty
    public Integer getIterations() {
        return iterations;
    }

    public void setIterations(Integer iterations) {
        this.iterations = iterations;
    }

    @JsonProperty
    public int getStartFrame() {
        return startFrame;
    }

    public void setStartFrame(int startFrame) {
        this.startFrame = startFrame;
    }

    @JsonProperty
    public int getFadeInFrames() {
        return fadeInFrames;
    }

    public void setFadeInFrames(int fadeInFrames) {
        this.fadeInFrames = fadeInFrames;
    }

    @JsonProperty
    public int getFadeOutFrames() {
        return fadeOutFrames;
    }

    public void setFadeOutFrames(int fadeOutFrames) {
        this.fadeOutFrames = fadeOutFrames;
    }

    @JsonProperty
    public float getOpacity() {
        return opacity;
    }

    public void setOpacity(float opacity) {
        this.opacity = opacity;
    }

    @JsonProperty
    public Poster getPoster() {
        return poster;
    }

    public void setPoster(Poster poster) {
        this.poster = poster;
    }
}
