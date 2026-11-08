package com.lbc_plot.render.video.anim;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * @module 情绪动画（序列帧）
 * 挂在**一个立绘**身上的序列帧动画：用哪套素材、播多久一张、怎么淡入淡出、摆在哪。
 *
 * <h2>为什么时序要抄一份进记录（而不是每次去读素材的 clip.json）</h2>
 * 因为三条链路都要求"只凭记录就能算"：
 * <ol>
 *   <li>{@code RecordAnimation.sceneSignature()} 每帧都要知道"现在该显示第几张图"，
 *       它是纯函数、明确不读盘的（导出时每秒调 30 次，读盘会直接把导出拖垮）；</li>
 *   <li>素材目录被删/换机器后，至少还能算出"这个动画本该多长、播到哪"，UI 才能给出
 *       "素材缺失：花开（60 帧）"这种能看懂的提示，而不是一片空白；</li>
 *   <li>与项目既有哲学一致：预设套用 = **内联快照** + sourceId
 *       （见 {@code features/record/animation/presetFile.ts} 的说明）。</li>
 * </ol>
 * 代价是"改素材不会回溯老工程"——这正是想要的行为：画面稳定性优先。要同步时由用户在面板上
 * 主动点「从素材同步」。
 *
 * <h2>只有像素引用目录</h2>
 * 帧图不在记录里，而是按 {@link #clipId} 去 {@code {dataRoot}/assets/animation-clips/<id>/frames/}
 * 取。所以把工程文件拷给别人时，动画素材需要一起传（用面板上的「导出动画文件」打成一个包）。
 *
 * <p>与前端 {@code features/record/animation/animationTypes.ts} 的 {@code EmotionAnim} 一一对应。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class EmotionAnim {

    /** 数据版本；将来加字段时用它做迁移判断 */
    private Integer version = 1;

    /** 素材 id（同时也是磁盘目录名与 URL 段，{@code ^[A-Za-z0-9_-]{1,64}$}） */
    private String clipId;

    /** 素材显示名（快照；素材缺失时用来告诉用户"丢了哪个动画"） */
    private String name;

    /** 素材画布宽（快照；决定绘制尺寸，缺素材也能算出矩形不跳位） */
    private int canvasWidth;

    /** 素材画布高（快照） */
    private int canvasHeight;

    /**
     * 每帧持续帧数（快照，**时序的唯一权威**）。
     *
     * <p>长度 = 图有几张；第 i 个值 = 第 i 张图占几帧。总时长 = 各项之和。
     * 非法值（≤0）按 1 帧算（见 {@link SequenceTiming#totalFrames}）。
     */
    private List<Integer> frameHolds;

    /** once / hold / loop / pingpong；缺省 once（见 {@link LoopMode#of}） */
    private String loop;

    /** 循环次数；缺省 null = 无限（仅 loop / pingpong 有意义） */
    private Integer iterations;

    /** 延迟启动（帧，相对记录开头）；缺省 0 */
    private int startFrame;

    /**
     * 相对**头部区域**的水平偏移，单位 = 头部长度（1.0 = 一个头宽）。
     *
     * <p>不是屏幕像素：同一套动画要能挂到不同角色身上，绝对像素换个人就飞了。
     * 头部方框在场景里恒为 {@code 183 × 用户缩放}（见 {@code CharacterVisual.updatePos}），
     * 所以"头宽"是唯一跨角色可比的长度尺度。
     */
    private double offsetX;

    /** 相对头部区域的垂直偏移（单位：头部长度，+ 向下） */
    private double offsetY;

    /** 素材整体缩放倍率（1 = 原始尺寸） */
    private float scale = 1f;

    /** 淡入帧数（序列局部时间）；缺省 0 */
    private int fadeInFrames;

    /**
     * 淡出帧数；缺省 0。
     * <b>loop / pingpong 下会被强制视为 0</b>（否则每轮接缝一淡一显），见 {@link SequenceTiming#sample}。
     */
    private int fadeOutFrames;

    /** 整体不透明度乘子（1 = 不透明） */
    private float opacity = 1f;

    /** 代表帧：静止预览（栅格图）显示第几张。缺省 0 */
    private int posterFrame;

    /**
     * 这份配置是否可用（有没有素材 id、有没有帧）。
     *
     * <p>渲染端/预览端靠它决定"要不要进情绪动画分支"：不可用就完全跳过，
     * 保证没挂动画的记录**逐像素不变**。
     */
    @JsonIgnore
    public boolean isUsable() {
        return clipId != null && !clipId.isBlank()
                && frameHolds != null && !frameHolds.isEmpty();
    }

    /** 图有几张 */
    @JsonIgnore
    public int frameCount() {
        return frameHolds == null ? 0 : frameHolds.size();
    }

    /** 一轮总帧数（= Σ frameHolds） */
    @JsonIgnore
    public int totalFrames() {
        return SequenceTiming.totalFrames(holdsArray());
    }

    /** 帧持续帧数的数组视图（不复制，调用方只读） */
    @JsonIgnore
    public int[] holdsArray() {
        if (frameHolds == null || frameHolds.isEmpty()) {
            return new int[0];
        }
        int[] holds = new int[frameHolds.size()];
        for (int i = 0; i < holds.length; i++) {
            Integer hold = frameHolds.get(i);
            holds[i] = hold == null ? 1 : Math.max(1, hold);
        }
        return holds;
    }

    /** 解析循环模式（不认识按 once） */
    @JsonIgnore
    public LoopMode loopMode() {
        return LoopMode.of(loop);
    }

    /** 用户对素材的缩放（非法值按 1） */
    @JsonIgnore
    public float safeScale() {
        return Float.isFinite(scale) && scale > 0 ? scale : 1f;
    }

    /** 整体不透明度（收敛到 [0,1]，非法值按 1） */
    @JsonIgnore
    public float safeOpacity() {
        if (!Float.isFinite(opacity)) {
            return 1f;
        }
        return Math.min(1f, Math.max(0f, opacity));
    }

    /**
     * 求某一帧该显示第几张图、多透明。
     *
     * @param frameIndex 记录内的绝对帧号
     * @return 永不 null；{@code imageIndex == SequenceTiming.NO_FRAME} 表示不画
     */
    @JsonIgnore
    public SequenceTiming.Sample sampleAt(int frameIndex) {
        return SequenceTiming.sample(holdsArray(), loopMode(), iterations, startFrame,
                fadeInFrames, fadeOutFrames, safeOpacity(), frameIndex);
    }

    /**
     * 代表帧（静止预览用）的局部帧号。
     *
     * <p>收敛到 {@code [0, totalFrames-1]}：素材被改成 5 帧而记录里还写着 posterFrame=9 时，
     * 退到最后一帧而不是"什么都不画"。
     */
    @JsonIgnore
    public int posterLocalFrame() {
        int total = totalFrames();
        if (total <= 0) {
            return SequenceTiming.NO_FRAME;
        }
        return Math.min(Math.max(0, posterFrame), total - 1);
    }

    /** 代表帧对应第几张图 */
    @JsonIgnore
    public int posterImageIndex() {
        return SequenceTiming.frameIndexAt(holdsArray(), posterLocalFrame());
    }

    /**
     * 取代表帧的透明度（把代表帧当成"局部帧"来算包络）。
     *
     * <p>静止预览要让人看得见：如果只把 imageIndex 摆上去而不带 alpha，淡入起点（alpha=0）的
     * 动画在栅格图里会是一块完全透明的空——用户会以为素材没导入成功。
     */
    @JsonIgnore
    public double posterAlpha() {
        int local = posterLocalFrame();
        if (local == SequenceTiming.NO_FRAME) {
            return 0d;
        }
        LoopMode mode = loopMode();
        boolean looping = mode == LoopMode.LOOP || mode == LoopMode.PINGPONG;
        return SequenceTiming.alphaAt(holdsArray(), local, fadeInFrames, looping ? 0 : fadeOutFrames,
                safeOpacity());
    }

    /** 从素材建一份**内联快照**（挂到立绘上时调用） */
    public static EmotionAnim fromAsset(AnimationClipAsset asset) {
        EmotionAnim anim = new EmotionAnim();
        if (asset == null) {
            return anim;
        }
        anim.clipId = asset.getId();
        anim.name = asset.getName();
        anim.canvasWidth = asset.getCanvasWidth();
        anim.canvasHeight = asset.getCanvasHeight();
        anim.frameHolds = asset.getFrameHolds();
        // 播放参数与代表帧摆放都跟着素材走：剧情编辑页只负责"选哪一段"，不再逐条调
        anim.loop = asset.getLoop();
        anim.iterations = asset.getIterations();
        anim.startFrame = asset.getStartFrame();
        anim.fadeInFrames = asset.getFadeInFrames();
        anim.fadeOutFrames = asset.getFadeOutFrames();
        anim.opacity = asset.getOpacity();
        AnimationClipAsset.Poster poster = asset.getPoster();
        if (poster != null) {
            anim.posterFrame = poster.getFrame();
            anim.offsetX = poster.safeOffsetX();
            anim.offsetY = poster.safeOffsetY();
            anim.scale = (float) poster.safeScale();
        }
        return anim;
    }

    @Override
    public String toString() {
        return "EmotionAnim{clipId=" + clipId + ", frames=" + frameCount()
                + ", total=" + totalFrames() + ", loop=" + loop + '}';
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
    public String getClipId() {
        return clipId;
    }

    public void setClipId(String clipId) {
        this.clipId = clipId;
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
    public List<Integer> getFrameHolds() {
        return frameHolds;
    }

    public void setFrameHolds(List<Integer> frameHolds) {
        this.frameHolds = frameHolds;
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
    public float getScale() {
        return scale;
    }

    public void setScale(float scale) {
        this.scale = scale;
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
    public int getPosterFrame() {
        return posterFrame;
    }

    public void setPosterFrame(int posterFrame) {
        this.posterFrame = posterFrame;
    }
}
