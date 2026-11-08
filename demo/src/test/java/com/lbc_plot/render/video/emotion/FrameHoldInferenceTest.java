package com.lbc_plot.render.video.emotion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 「按文件名编号推算每帧持续帧数」的规则测试。
 *
 * <p>核心用例就是需求里那张图：{@code xxx_1 / 2 / 3 / 7 / 9} → 时长 {@code 1 / 1 / 4 / 2 / 默认}。
 * 其它用例锁的是**异常不许阻断导入**（任何一条不满足都只是"不推算"，而不是报错）。
 */
class FrameHoldInferenceTest {

    /** 不限制总时长（大多数用例只关心差值规则） */
    private static FrameHoldInference.Result infer(String... names) {
        return FrameHoldInference.infer(List.of(names), 1, 60, 0);
    }

    /* ==================== 核心规则 ==================== */

    @Test
    @DisplayName("需求里的例子：1/2/3/7/9 → 1/1/4/2/默认(1)")
    void specExample() {
        FrameHoldInference.Result result = infer(
                "xxx_1.png", "xxx_2.png", "xxx_3.png", "xxx_7.png", "xxx_9.png");

        assertTrue(result.applied(), "应当启用推算");
        assertEquals(List.of(1, 1, 4, 2, 1), result.holds(), "最后一张取默认 1 帧");
        assertEquals(9, result.holds().stream().mapToInt(Integer::intValue).sum());
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("最后一张")),
                "提示里要说明最后一张的行为: " + result.warnings());
    }

    @Test
    @DisplayName("补零编号（AE 导出）照样能推：0001/0002/0003 → 全 1 帧")
    void zeroPaddedSequence() {
        FrameHoldInference.Result result = infer(
                "flower_0001.png", "flower_0002.png", "flower_0003.png");
        assertTrue(result.applied());
        assertEquals(List.of(1, 1, 1), result.holds());
    }

    @Test
    @DisplayName("编号在开头、无前缀也能推（1.png / 3.png）")
    void numberOnlyNames() {
        FrameHoldInference.Result result = infer("1.png", "3.png", "6.png");
        assertTrue(result.applied());
        assertEquals(List.of(2, 3, 1), result.holds());
    }

    @Test
    @DisplayName("最后一张用默认值时采用的是传入的 defaultHold，而不是写死 1")
    void lastHoldUsesDefault() {
        FrameHoldInference.Result result = FrameHoldInference.infer(
                List.of("a_1.png", "a_4.png"), 5, 60, 0);
        assertEquals(List.of(3, 5), result.holds());
    }

    /* ==================== 不该推算的情况 ==================== */

    @Test
    @DisplayName("单张图：无法推算，不提示（这是正常情况）")
    void singleImageCannotInfer() {
        FrameHoldInference.Result result = infer("xxx_1.png");
        assertFalse(result.applied());
        assertEquals(List.of(1), result.holds());
        assertTrue(result.warnings().isEmpty(), "单张不该打扰用户: " + result.warnings());
    }

    @Test
    @DisplayName("文件名里没有编号：不推算、不提示")
    void noNumbersIsSilent() {
        FrameHoldInference.Result result = infer("开场.png", "开门.png", "转身.png");
        assertFalse(result.applied());
        assertEquals(List.of(1, 1, 1), result.holds());
        assertTrue(result.warnings().isEmpty());
    }

    @Test
    @DisplayName("前缀不一致：不属于同一序列，不推算并提示")
    void mixedPrefixesAreReported() {
        FrameHoldInference.Result result = infer("aaa_1.png", "aaa_2.png", "bbb_5.png");
        assertFalse(result.applied());
        assertEquals(List.of(1, 1, 1), result.holds());
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("前缀不一致")), result.warnings().toString());
    }

    @Test
    @DisplayName("重复编号：视为命名不规则，不推算并提示")
    void duplicateNumbersAreReported() {
        // Frame_1 与 FRAME_1 模板相同（比较时统一小写）、编号相同 → 重复
        FrameHoldInference.Result result = infer("Frame_1.png", "FRAME_1.png", "frame_3.png");
        assertFalse(result.applied());
        assertEquals(List.of(1, 1, 1), result.holds());
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("重复编号")), result.warnings().toString());
    }

    @Test
    @DisplayName("编号逆序：差值会变成负数，判为命名不规则")
    void descendingNumbersRejected() {
        FrameHoldInference.Result result = infer("xxx_9.png", "xxx_3.png");
        assertFalse(result.applied());
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("递增")), result.warnings().toString());
    }

    @Test
    @DisplayName("任意一个文件没有编号就整体不推算（没法确定它在序列里的位置）")
    void oneFileWithoutNumberDisablesAll() {
        FrameHoldInference.Result result = infer("xxx_1.png", "xxx_2.png", "cover.png");
        assertFalse(result.applied());
        assertEquals(List.of(1, 1, 1), result.holds());
    }

    /* ==================== 上限 ==================== */

    @Test
    @DisplayName("差值超过上限：截断到上限并提示（防止异常命名让某张定格 20 秒）")
    void largeGapIsClamped() {
        FrameHoldInference.Result result = FrameHoldInference.infer(
                List.of("xxx_1.png", "xxx_600.png"), 1, 60, 0);
        assertTrue(result.applied());
        assertEquals(List.of(60, 1), result.holds(), "600-1 被截断到 60");
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("截断")), result.warnings().toString());
    }

    @Test
    @DisplayName("上限传 0 时用默认上限 60")
    void zeroCapFallsBackToDefault() {
        FrameHoldInference.Result result = FrameHoldInference.infer(
                List.of("xxx_1.png", "xxx_1000.png"), 1, 0, 0);
        assertEquals(List.of(FrameHoldInference.DEFAULT_MAX_GAP_FRAMES, 1), result.holds());
    }

    @Test
    @DisplayName("推算出的总时长超过上限：整体回落到每张 1 帧并说明原因")
    void totalOverflowFallsBack() {
        List<String> names = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            names.add("xxx_" + (i * 50 + 1) + ".png"); // 每张 50 帧 → 总 950 > 900
        }
        FrameHoldInference.Result result = FrameHoldInference.infer(names, 1, 60, 900);

        assertFalse(result.applied());
        assertEquals(20, result.holds().size());
        assertTrue(result.holds().stream().allMatch(hold -> hold == 1));
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("超过上限")), result.warnings().toString());
    }

    /* ==================== 解析细节 ==================== */

    @Test
    @DisplayName("取文件名里**最后一段**数字（xxx_2_5 → 5），前面的编号当普通文本")
    void usesLastNumberRun() {
        FrameHoldInference.ParsedName parsed = FrameHoldInference.parse("xxx_2_5.png");
        assertEquals("xxx_2_#", parsed.template());
        assertEquals(5L, parsed.number());
    }

    @Test
    @DisplayName("扩展名不参与模板（png 与 jpg 混选也能算同一序列）")
    void extensionIsIgnoredInTemplate() {
        FrameHoldInference.Result result = infer("a_1.png", "a_4.jpg");
        assertTrue(result.applied());
        assertEquals(List.of(3, 1), result.holds());
    }

    @Test
    @DisplayName("解析不出编号时返回 null，而不是抛异常")
    void parseReturnsNullForNonNumericNames() {
        assertEquals(null, FrameHoldInference.parse("cover.png"));
        assertEquals(null, FrameHoldInference.parse(""));
        assertEquals(null, FrameHoldInference.parse(null));
    }

    @Test
    @DisplayName("空列表：返回空结果，不抛")
    void emptyListIsSafe() {
        FrameHoldInference.Result result = FrameHoldInference.infer(List.of(), 1, 60, 0);
        assertFalse(result.applied());
        assertTrue(result.holds().isEmpty());
    }
}
