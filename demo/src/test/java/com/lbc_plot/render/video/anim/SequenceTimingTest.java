package com.lbc_plot.render.video.anim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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
 * 情绪动画（序列帧）时序内核的**跨语言对拍**测试。
 *
 * <p>夹具 {@code src/test/resources/animation-fixtures.json} 的 {@code sequenceTiming} 段是
 * 前端 {@code sequenceTiming.test.ts} 与本测试**共用的同一份真值**。它由一份独立的手算结果写成，
 * 不是从任一端输出截的图，所以：
 * <ul>
 *   <li>本测试通过 = Java 侧时序与夹具一致；</li>
 *   <li>前端测试也通过 = 两端一致；</li>
 *   <li>任一侧改了公式而没更新夹具 = 那一侧立刻红，不会静默漂移。</li>
 * </ul>
 *
 * <p>为什么这条对拍特别关键：序列帧是"第 N 帧显示第几张图"，一旦两端差一帧，
 * 表现就是"编辑器里第 40 帧是第 6 张图、成片里却是第 5 张"——肉眼几乎无法定位。
 */
class SequenceTimingTest {

    private static final double EPS = 1e-6;

    private static Fixtures fixtures;

    @BeforeAll
    static void loadFixtures() throws IOException {
        try (InputStream in = SequenceTimingTest.class.getResourceAsStream("/animation-fixtures.json")) {
            assertNotNull(in, "找不到夹具 src/test/resources/animation-fixtures.json");
            fixtures = new ObjectMapper()
                    .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                    .readValue(in, Fixtures.class);
        }
        assertNotNull(fixtures);
        assertTrue(fixtures.sequenceTiming != null && !fixtures.sequenceTiming.isEmpty(),
                "夹具里没有 sequenceTiming 用例");
    }

    @Test
    @DisplayName("全部夹具用例：图片序号 / 局部帧号 / 透明度都一致")
    void allFixtureCasesMatch() {
        List<String> failures = new ArrayList<>();
        for (TimingCase testCase : fixtures.sequenceTiming) {
            int[] holds = testCase.frameHolds.stream().mapToInt(Integer::intValue).toArray();
            LoopMode loop = LoopMode.of(testCase.loop);
            SequenceTiming.Sample sample = SequenceTiming.sample(holds, loop, testCase.iterations,
                    testCase.startFrame, testCase.fadeInFrames, testCase.fadeOutFrames,
                    testCase.opacity, testCase.frame);

            if (sample.imageIndex() != testCase.expect.imageIndex) {
                failures.add(testCase.name + ": imageIndex expect=" + testCase.expect.imageIndex
                        + " actual=" + sample.imageIndex());
            }
            if (sample.localFrame() != testCase.expect.localFrame) {
                failures.add(testCase.name + ": localFrame expect=" + testCase.expect.localFrame
                        + " actual=" + sample.localFrame());
            }
            if (Math.abs(sample.alpha() - testCase.expect.alpha) > EPS) {
                failures.add(testCase.name + ": alpha expect=" + testCase.expect.alpha
                        + " actual=" + sample.alpha());
            }
        }
        assertTrue(failures.isEmpty(), "与夹具不一致:\n  " + String.join("\n  ", failures));
    }

    /* ==================== 独立的行为约束 ==================== */

    @Test
    @DisplayName("总帧数 = 每帧持续帧数之和；非法值按 1 帧算")
    void totalFramesSumsHolds() {
        assertEquals(6, SequenceTiming.totalFrames(new int[] { 3, 1, 2 }));
        assertEquals(0, SequenceTiming.totalFrames(new int[0]));
        assertEquals(0, SequenceTiming.totalFrames(null));
        // 0 / 负数都按 1 帧，而不是"跳过这一帧"：跳过会让用户数不清第几张图
        assertEquals(4, SequenceTiming.totalFrames(new int[] { 0, -5, 2 }), "1 + 1 + 2");
    }

    @Test
    @DisplayName("空帧序列一律不画，且不抛异常")
    void emptySequenceDrawsNothing() {
        SequenceTiming.Sample sample = SequenceTiming.sample(null, LoopMode.ONCE, null, 0, 0, 0, 1d, 0);
        assertEquals(SequenceTiming.NO_FRAME, sample.imageIndex());
        assertEquals(0d, sample.alpha(), EPS);
        assertEquals(false, sample.visible());
    }

    @Test
    @DisplayName("淡出以最后一帧为 0（与 clip 的 envelope 口径不同，见类注释）")
    void fadeOutEndsAtZeroOnLastFrame() {
        int[] holds = { 1, 1, 1, 1 };
        assertEquals(0d, SequenceTiming.alphaAt(holds, 3, 0, 3, 1d), EPS);
        assertEquals(1d / 3d, SequenceTiming.alphaAt(holds, 2, 0, 3, 1d), EPS);
        assertEquals(1d, SequenceTiming.alphaAt(holds, 0, 0, 3, 1d), EPS);
    }

    @Test
    @DisplayName("淡入淡出帧数被收敛到 len-1：单帧序列不会永远不可见")
    void singleFrameIgnoresFades() {
        int[] holds = { 1 };
        assertEquals(1d, SequenceTiming.alphaAt(holds, 0, 5, 5, 1d), EPS);
    }

    @Test
    @DisplayName("loop / pingpong 强制忽略淡出（否则每轮接缝一淡一显）")
    void loopingModesIgnoreFadeOut() {
        int[] holds = { 2, 2, 2 };
        assertEquals(1d, SequenceTiming.sample(holds, LoopMode.LOOP, null, 0, 0, 4, 1d, 4).alpha(), EPS);
        assertEquals(1d, SequenceTiming.sample(holds, LoopMode.PINGPONG, null, 0, 0, 4, 1d, 4).alpha(), EPS);
        assertTrue(SequenceTiming.sample(holds, LoopMode.ONCE, null, 0, 0, 4, 1d, 4).alpha() < 1d);
    }

    /* ==================== 夹具模型 ==================== */

    static class Fixtures {
        public List<TimingCase> sequenceTiming = new ArrayList<>();
    }

    static class TimingCase {
        public String name;
        public List<Integer> frameHolds = new ArrayList<>();
        public String loop;
        public Integer iterations;
        public int startFrame;
        public int fadeInFrames;
        public int fadeOutFrames;
        public double opacity = 1d;
        public int frame;
        public Expect expect;
    }

    static class Expect {
        public int imageIndex;
        public int localFrame;
        public double alpha;
    }
}
