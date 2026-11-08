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
 * 情绪动画几何的**跨语言对拍**测试（{@code animation-fixtures.json} 的 {@code emotionPlacement} 段）。
 *
 * <p>锁两件事，都是"错了不会抛异常、只会画歪"的那类：
 * <ol>
 *   <li>{@link EmotionAnimPlacement#faceOffset}：脸框中心相对立绘左上角的偏移；</li>
 *   <li>{@link EmotionAnimPlacement#spriteRect}：素材矩形（中心对齐 + 偏移 + 跟随用户缩放）。</li>
 * </ol>
 */
class EmotionAnimPlacementTest {

    private static final double EPS = 1e-6;

    private static EmotionPlacement fixtures;

    @BeforeAll
    static void loadFixtures() throws IOException {
        try (InputStream in = EmotionAnimPlacementTest.class.getResourceAsStream("/animation-fixtures.json")) {
            assertNotNull(in, "找不到夹具 src/test/resources/animation-fixtures.json");
            PlacementFixtures root = new ObjectMapper()
                    .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                    .readValue(in, PlacementFixtures.class);
            fixtures = root == null ? null : root.emotionPlacement;
        }
        assertNotNull(fixtures, "夹具里没有 emotionPlacement 段");
    }

    @Test
    @DisplayName("头部方框边长：跨角色恒定（裁剪框被归一化），只有用户缩放会改它")
    void headSizeMatchesFixtures() {
        List<String> failures = new ArrayList<>();
        for (HeadSizeCase testCase : fixtures.headSize) {
            double actual = EmotionAnimPlacement.headSize(testCase.length, testCase.renderScale);
            if (Math.abs(actual - testCase.expect) > EPS) {
                failures.add(testCase.name + ": expect=" + testCase.expect + " actual=" + actual);
            }
        }
        assertTrue(failures.isEmpty(), "与夹具不一致:\n  " + String.join("\n  ", failures));
    }

    @Test
    @DisplayName("脸框中心偏移：与夹具一致")
    void faceOffsetMatchesFixtures() {
        List<String> failures = new ArrayList<>();
        for (FaceOffsetCase testCase : fixtures.faceOffset) {
            double actual = EmotionAnimPlacement.faceOffset(testCase.face, testCase.length,
                    testCase.renderScale);
            if (Math.abs(actual - testCase.expect) > EPS) {
                failures.add(testCase.name + ": expect=" + testCase.expect + " actual=" + actual);
            }
        }
        assertTrue(failures.isEmpty(), "与夹具不一致:\n  " + String.join("\n  ", failures));
    }

    @Test
    @DisplayName("素材矩形：与夹具一致")
    void spriteRectMatchesFixtures() {
        List<String> failures = new ArrayList<>();
        for (RectCase testCase : fixtures.spriteRect) {
            EmotionAnimPlacement.Rect rect = EmotionAnimPlacement.spriteRect(
                    testCase.faceCenterX, testCase.faceCenterY, testCase.headSize,
                    testCase.canvasWidth, testCase.canvasHeight,
                    testCase.scale, testCase.userScale,
                    testCase.offsetX, testCase.offsetY);
            check(failures, testCase.name, "x", testCase.expect.x, rect.x());
            check(failures, testCase.name, "y", testCase.expect.y, rect.y());
            check(failures, testCase.name, "w", testCase.expect.w, rect.w());
            check(failures, testCase.name, "h", testCase.expect.h, rect.h());
        }
        assertTrue(failures.isEmpty(), "与夹具不一致:\n  " + String.join("\n  ", failures));
    }

    @Test
    @DisplayName("恒定不变量：素材中心永远落在 脸框中心 + 偏移 上（与缩放无关）")
    void spriteCenterTracksFaceCenterRegardlessOfScale() {
        for (double scale : new double[] { 0.1d, 0.5d, 1d, 2.5d }) {
            // 偏移单位是头部长度：0.05 个头右、-0.04 个头下；头宽 200 → (+10, -8)
            EmotionAnimPlacement.Rect rect = EmotionAnimPlacement.spriteRect(960, 221, 200, 600, 400,
                    scale, 1.7d, 0.05d, -0.04d);
            assertEquals(960 + 10, rect.centerX(), EPS, "scale=" + scale);
            assertEquals(221 - 8, rect.centerY(), EPS, "scale=" + scale);
        }
    }

    @Test
    @DisplayName("非法参数不产生 NaN/负尺寸（否则 drawImage 会静默什么都不画）")
    void invalidInputsAreSanitized() {
        EmotionAnimPlacement.Rect rect = EmotionAnimPlacement.spriteRect(0, 0, Double.NaN, 0, -5,
                Double.NaN, 0, Double.NaN, Double.NaN);
        assertTrue(Double.isFinite(rect.x()) && Double.isFinite(rect.y()), "坐标不能是 NaN: " + rect);
        assertTrue(rect.w() > 0 && rect.h() > 0, "尺寸必须为正: " + rect);
    }

    private static void check(List<String> failures, String name, String field, double expect, double actual) {
        if (Math.abs(expect - actual) > EPS) {
            failures.add(name + " " + field + ": expect=" + expect + " actual=" + actual);
        }
    }

    /* ==================== 夹具模型 ==================== */

    static class PlacementFixtures {
        public EmotionPlacement emotionPlacement;
    }

    static class EmotionPlacement {
        public List<HeadSizeCase> headSize = new ArrayList<>();
        public List<FaceOffsetCase> faceOffset = new ArrayList<>();
        public List<RectCase> spriteRect = new ArrayList<>();
    }

    static class HeadSizeCase {
        public String name;
        public double length;
        public double renderScale;
        public double expect;
    }

    static class FaceOffsetCase {
        public String name;
        public double face;
        public double length;
        public double renderScale;
        public double expect;
    }

    static class RectCase {
        public String name;
        public double faceCenterX;
        public double faceCenterY;
        public double headSize;
        public double canvasWidth;
        public double canvasHeight;
        public double scale;
        public double userScale;
        public double offsetX;
        public double offsetY;
        public ExpectRect expect;
    }

    static class ExpectRect {
        public double x;
        public double y;
        public double w;
        public double h;
    }
}
