package com.lbc_plot.render.video.anim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 立绘动画求值内核的**跨语言对拍**测试。
 *
 * <p>夹具 {@code src/test/resources/animation-fixtures.json} 是前端 {@code spriteAnimator.test.ts}
 * 与本测试**共用的同一份真值**。它由一份独立实现算出（不是从本类输出截的图），所以：
 * <ul>
 *   <li>本测试通过 = Java 侧算法与夹具一致；</li>
 *   <li>前端测试也通过 = 两端一致；</li>
 *   <li>任一侧改了公式而没更新夹具 = 那一侧立刻红，不会静默漂移。</li>
 * </ul>
 *
 * <p>这是"预览与成片必须一致"这条验收的唯一机械化保障——两条渲染路径本身没法互测。
 */
class SpriteAnimatorTest {

    /** 夹具期望值保留 6 位小数，比较容差要略大于舍入误差 */
    private static final double EPS = 1e-6;

    private static Fixtures fixtures;

    @BeforeAll
    static void loadFixtures() throws IOException {
        try (InputStream in = SpriteAnimatorTest.class.getResourceAsStream("/animation-fixtures.json")) {
            assertNotNull(in, "找不到夹具 src/test/resources/animation-fixtures.json");
            // 夹具里带 $comment 之类的说明字段，也可能随迭代新增字段 —— 读夹具要宽容，别因为注释就红
            fixtures = new ObjectMapper()
                    .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                    .readValue(in, Fixtures.class);
        }
        assertNotNull(fixtures);
        assertFalse(fixtures.cases.isEmpty(), "夹具里没有任何用例");
    }

    /* ==================== 夹具对拍 ==================== */

    @Test
    @DisplayName("抖动哈希：与前端逐位一致")
    void hashMatchesFrontend() {
        for (HashCase hashCase : fixtures.hash) {
            assertEquals(hashCase.expect, Hash32.hash01(hashCase.seed, hashCase.index, hashCase.axis), EPS,
                    "hash01(seed=" + hashCase.seed + ", index=" + hashCase.index + ", axis=" + hashCase.axis + ")");
        }
    }

    @Test
    @DisplayName("全部夹具用例：每个采样帧的五通道都一致")
    void allFixtureCasesMatch() {
        List<String> failures = new ArrayList<>();
        for (Case testCase : fixtures.cases) {
            for (FrameExpect expect : testCase.frames) {
                TransformState actual = SpriteAnimator.evaluate(testCase.anim, expect.frame);
                check(failures, testCase.name + " @frame " + expect.frame + " x", expect.expect.x, actual.getX());
                check(failures, testCase.name + " @frame " + expect.frame + " y", expect.expect.y, actual.getY());
                check(failures, testCase.name + " @frame " + expect.frame + " scale", expect.expect.scale,
                        actual.getScale());
                check(failures, testCase.name + " @frame " + expect.frame + " rotate", expect.expect.rotate,
                        actual.getRotate());
                check(failures, testCase.name + " @frame " + expect.frame + " alpha", expect.expect.alpha,
                        actual.getAlpha());
            }
        }
        assertTrue(failures.isEmpty(), "与夹具不一致:\n  " + String.join("\n  ", failures));
    }

    @Test
    @DisplayName("每条预设在第 0 帧都必须返回恒等值（否则一加动画就跳一下）")
    void everyPresetIsIdentityAtFrameZero() {
        for (PresetId preset : PresetId.values()) {
            AnimationClip clip = new AnimationClip();
            clip.setKind("preset");
            clip.setPreset(preset.getCode());
            clip.setDurationFrames(60);
            clip.setLoop("loop");

            SpriteAnimation anim = animationOf(clip);
            TransformState state = SpriteAnimator.evaluate(anim, 0);
            assertTrue(state.isIdentity(), preset.getCode() + " 在第 0 帧不是恒等: " + state);
        }
    }

    /* ==================== 投影（时间）规则 ==================== */

    @Test
    @DisplayName("once 播完回恒等；hold 收到 hold 时停在最后一帧")
    void onceEndsAndHoldStays() {
        AnimationClip clip = new AnimationClip();
        clip.setKind("preset");
        clip.setPreset("pulse");
        clip.setDurationFrames(10);
        clip.setLoop("once");

        assertNotNull(SpriteAnimator.project(clip, 9), "第 9 帧还在播");
        assertNull(SpriteAnimator.project(clip, 10), "第 10 帧 once 应当结束");

        clip.setOnEnd("hold");
        assertEquals(9d, SpriteAnimator.project(clip, 25), EPS, "onEnd=hold 应当停在最后一帧");
    }

    @Test
    @DisplayName("startFrame 之前不生效；endFrame 之后截断")
    void startAndEndFrameGateProjection() {
        AnimationClip clip = new AnimationClip();
        clip.setKind("preset");
        clip.setPreset("breathe");
        clip.setDurationFrames(100);
        clip.setLoop("loop");
        clip.setStartFrame(10);
        clip.setEndFrame(50);

        assertNull(SpriteAnimator.project(clip, 9));
        assertEquals(0d, SpriteAnimator.project(clip, 10), EPS);
        assertEquals(39d, SpriteAnimator.project(clip, 49), EPS);
        assertNull(SpriteAnimator.project(clip, 50), "endFrame 是开区间上界");
        assertNull(SpriteAnimator.project(clip, 60));
    }

    @Test
    @DisplayName("loop 取模、pingpong 三角波、timeScale 缩放时间")
    void loopAndPingpongAndTimeScale() {
        AnimationClip clip = new AnimationClip();
        clip.setKind("preset");
        clip.setPreset("breathe");
        clip.setDurationFrames(50);

        clip.setLoop("loop");
        assertEquals(10d, SpriteAnimator.project(clip, 60), EPS);
        assertEquals(0d, SpriteAnimator.project(clip, 100), EPS);

        clip.setLoop("pingpong");
        assertEquals(40d, SpriteAnimator.project(clip, 60), EPS);
        assertEquals(0d, SpriteAnimator.project(clip, 100), EPS);

        clip.setLoop("once");
        clip.setTimeScale(2d);
        assertEquals(10d, SpriteAnimator.project(clip, 5), EPS, "timeScale=2 时第 5 帧相当于原速第 10 帧");
        assertNull(SpriteAnimator.project(clip, 25), "timeScale=2 时 25 帧已经播完（25*2 > 50 之前的最后一帧是 24）");
    }

    @Test
    @DisplayName("权重包络：淡入淡出把贡献缩到 0，且不会越过 1")
    void envelopeClampsAndFades() {
        AnimationClip clip = new AnimationClip();
        clip.setDurationFrames(20);
        clip.setFadeInFrames(4);
        clip.setFadeOutFrames(4);

        assertEquals(0d, SpriteAnimator.envelope(clip, 0), EPS);
        assertEquals(0.5d, SpriteAnimator.envelope(clip, 2), EPS);
        assertEquals(1d, SpriteAnimator.envelope(clip, 10), EPS);
        assertEquals(0.5d, SpriteAnimator.envelope(clip, 18), EPS);
        assertEquals(0d, SpriteAnimator.envelope(clip, 20), EPS);

        clip.setFadeInFrames(0);
        clip.setFadeOutFrames(0);
        assertEquals(1d, SpriteAnimator.envelope(clip, 0), EPS, "没有包络时权重恒为 1");
    }

    /* ==================== 合成语义 ==================== */

    @Test
    @DisplayName("加法合成可交换：clip 顺序不影响结果")
    void additiveCompositionIsOrderIndependent() {
        AnimationClip left = keyframeClip("x", 10d, 0);
        AnimationClip right = keyframeClip("x", 25d, 0);

        SpriteAnimation forward = animationOf(left, right);
        SpriteAnimation backward = animationOf(right, left);

        assertEquals(35d, SpriteAnimator.evaluate(forward, 3).getX(), EPS);
        assertEquals(35d, SpriteAnimator.evaluate(backward, 3).getX(), EPS);
    }

    @Test
    @DisplayName("乘法合成不是简单相加：缩放 1.2 × 1.2 = 1.44")
    void multiplicativeComposition() {
        assertTrue(PresetId.BREATHE.channels().contains(AnimChannel.SCALE));

        AnimationClip clip = new AnimationClip();
        clip.setKind("keyframes");
        clip.setDurationFrames(10);
        clip.setLoop("hold");
        KeyframeValue value = new KeyframeValue();
        value.setScale(1.2d);
        clip.setKeys(List.of(new Keyframe(0, value)));
        clip.setChannels(List.of("scale"));

        // 同一条 clip 复制成两份：1.2 × 1.2
        SpriteAnimation anim = animationOf(clip, clip);
        assertEquals(1.44d, SpriteAnimator.evaluate(anim, 0).getScale(), EPS);
    }

    @Test
    @DisplayName("replace 按 priority 覆盖：高优先级后求值")
    void replaceRespectsPriority() {
        AnimationClip low = keyframeClip("x", 10d, 0);
        low.setBlend("replace");
        AnimationClip high = keyframeClip("x", 90d, 5);
        high.setBlend("replace");

        assertEquals(90d, SpriteAnimator.evaluate(animationOf(low, high), 0).getX(), EPS);
        assertEquals(90d, SpriteAnimator.evaluate(animationOf(high, low), 0).getX(), EPS,
                "priority 高的应当后求值，与数组顺序无关");
    }

    /* ==================== 降级 ==================== */

    @Test
    @DisplayName("空/禁用/未知预设/未知通道 一律恒等，不抛异常")
    void invalidInputsDegradeToIdentity() {
        assertTrue(SpriteAnimator.evaluate(null, 0).isIdentity());
        assertTrue(SpriteAnimator.evaluate(new SpriteAnimation(), 0).isIdentity());

        AnimationClip unknownPreset = new AnimationClip();
        unknownPreset.setKind("preset");
        unknownPreset.setPreset("no-such-preset");
        unknownPreset.setDurationFrames(30);
        SpriteAnimation anim = animationOf(unknownPreset);
        assertTrue(SpriteAnimator.evaluate(anim, 5).isIdentity());
        assertFalse(anim.isAnimated(), "未知预设不算'会动'，否则会白白拖慢导出");

        AnimationClip unknownChannel = new AnimationClip();
        unknownChannel.setKind("keyframes");
        unknownChannel.setDurationFrames(10);
        unknownChannel.setChannels(List.of("nope"));
        unknownChannel.setKeys(List.of(new Keyframe(0, new KeyframeValue())));
        assertTrue(SpriteAnimator.evaluate(animationOf(unknownChannel), 0).isIdentity());

        AnimationClip disabled = keyframeClip("x", 50d, 0);
        disabled.setEnabled(false);
        assertTrue(SpriteAnimator.evaluate(animationOf(disabled), 0).isIdentity());
        assertFalse(animationOf(disabled).isAnimated());
    }

    @Test
    @DisplayName("isAnimated 只在真的有内容时为 true（渲染端据此跳过整条动画路径）")
    void isAnimatedIsConservative() {
        assertFalse(new SpriteAnimation().isAnimated(), "没有 clips 不算会动");

        AnimationClip zeroDuration = keyframeClip("x", 10d, 0);
        zeroDuration.setDurationFrames(0);
        assertFalse(animationOf(zeroDuration).isAnimated(), "时长为 0 不算会动");

        assertTrue(animationOf(keyframeClip("x", 10d, 0)).isAnimated());
    }

    @Test
    @DisplayName("锚点：没配时用元素类型默认值（立绘脚底 / 图片中心）")
    void anchorDefaults() {
        SpriteAnimation anim = new SpriteAnimation();
        assertEquals(0.5d, anim.anchorOrDefault(0.5d, 1d).getX(), EPS);
        assertEquals(1d, anim.anchorOrDefault(0.5d, 1d).getY(), EPS, "立绘缺省锚点在脚底");

        SpriteAnimation.Anchor anchor = new SpriteAnimation.Anchor(0.5d, 0.2d);
        anim.setAnchor(anchor);
        assertEquals(0.2d, anim.anchorOrDefault(0.5d, 1d).getY(), EPS, "配了就用配的");

        anchor.setY(Double.NaN);
        assertEquals(1d, anim.anchorOrDefault(0.5d, 1d).getY(), EPS, "非法值回落到默认");
    }

    /* ==================== 工具 ==================== */

    private static void check(List<String> failures, String label, double expect, double actual) {
        if (Math.abs(expect - actual) > EPS) {
            failures.add(label + ": expect=" + expect + " actual=" + actual);
        }
    }

    private static SpriteAnimation animationOf(AnimationClip... clips) {
        SpriteAnimation anim = new SpriteAnimation();
        anim.setVersion(1);
        anim.setTimebase(new SpriteAnimation.Timebase("frame", 30));
        anim.setClips(new ArrayList<>(List.of(clips)));
        return anim;
    }

    /** 造一条"某通道恒为 value"的关键帧 clip（priority 可指定） */
    private static AnimationClip keyframeClip(String channel, double value, int priority) {
        KeyframeValue keyframeValue = new KeyframeValue();
        switch (channel) {
            case "x":
                keyframeValue.setX(value);
                break;
            case "y":
                keyframeValue.setY(value);
                break;
            case "scale":
                keyframeValue.setScale(value);
                break;
            case "rotate":
                keyframeValue.setRotate(value);
                break;
            case "alpha":
                keyframeValue.setAlpha(value);
                break;
            default:
                throw new IllegalArgumentException("未知通道: " + channel);
        }
        AnimationClip clip = new AnimationClip();
        clip.setKind("keyframes");
        clip.setDurationFrames(20);
        clip.setLoop("hold");
        clip.setChannels(List.of(channel));
        clip.setKeys(List.of(new Keyframe(0, keyframeValue)));
        clip.setPriority(priority);
        return clip;
    }

    /* ==================== 夹具的反序列化模型 ==================== */

    static class Fixtures {
        public TimebaseExpect timebase;
        public List<HashCase> hash = new ArrayList<>();
        public List<Case> cases = new ArrayList<>();
    }

    static class TimebaseExpect {
        public String unit;
        public int fps;
    }

    static class HashCase {
        public long seed;
        public int index;
        public int axis;
        public double expect;
    }

    static class Case {
        public String name;
        public SpriteAnimation anim;
        public List<FrameExpect> frames = new ArrayList<>();
    }

    static class FrameExpect {
        public int frame;
        public Expect expect;
    }

    static class Expect {
        public double x;
        public double y;
        public double scale;
        public double rotate;
        public double alpha;
    }
}
