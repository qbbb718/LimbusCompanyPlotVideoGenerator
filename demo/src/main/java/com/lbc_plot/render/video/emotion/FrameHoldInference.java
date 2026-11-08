package com.lbc_plot.render.video.emotion;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * @module 序列帧动画导入
 * 「按文件名编号自动推算每帧持续帧数」的纯函数内核。
 *
 * <h2>要解决什么</h2>
 * 美术从 AE 导出补零序列（{@code xxx_00000.png …}），编号连续 → 每张 1 帧，没什么可推的。
 * 但另一类更常见：用户**手挑**若干张图，文件名里带着"这两张之间隔了几帧"的信息，
 * 例如 {@code xxx_1 / 2 / 3 / 7 / 9}——它表达的是"第 3 张之后停 4 帧、第 7 张之后停 2 帧"。
 * 逐张手填时长非常痛苦，而这个信息本来就在文件名里。
 *
 * <h2>规则（与需求一一对应）</h2>
 * <ol>
 *   <li><b>模板一致才算同一序列</b>：把每张文件名（去掉扩展名）里**最后一段连续数字**换成
 *       {@code #}，得到模板；一批里所有模板必须相同，否则视为"前缀不一致"，不参与推算。</li>
 *   <li><b>编号必须严格递增</b>：重复编号、逆序都视为命名不规则 → 不推算并提示。
 *       （自然排序已经把文件名排成升序，这里再校验一次数值，防止 {@code xxx_10} 排在
 *       {@code xxx_9} 前面这种意外。）</li>
 *   <li><b>时长 = 相邻编号差</b>：第 i 张 = {@code n[i+1] - n[i]} 帧；<b>最后一张取默认值</b>
 *       （{@code defaultHold}，正常是 1 帧）——它没有后继编号可用。</li>
 *   <li><b>差值上限</b>：超过 {@code maxGapFrames} 的间隔被截断到上限并提示，
 *       防止 {@code xxx_1.png / xxx_600.png} 这种命名让某张图定格 20 秒。</li>
 *   <li><b>总时长上限</b>：推算结果总和超过 {@code maxTotalFrames} 时整体回落到"每张默认帧"，
 *       并提示原因（宁可回到朴素行为，也不要生成一个播半小时的动画）。</li>
 *   <li><b>兜底不阻断</b>：任何一条不满足都只是"不推算"，导入照常完成；
 *       只有"本该能推、但数据有问题"的情况（重复编号、前缀不一致、截断、超上限）才回一句提示。</li>
 * </ol>
 *
 * <h2>为什么不做成双端内核</h2>
 * 它只在**导入那一刻**算一次，结果直接写进 {@code clip.json} 的 {@code frameHolds}；
 * 之后预览与成片读的都是同一份数据，不存在"两端各算一遍"的问题，
 * 所以不像 {@code SequenceTiming} 那样需要夹具对拍。
 */
public final class FrameHoldInference {

    /** 单张时长上限的默认值（60 帧 = 2 秒，超过基本可以断定是命名异常） */
    public static final int DEFAULT_MAX_GAP_FRAMES = 60;

    /** 数字段占位符（模板比较用） */
    private static final String NUMBER_PLACEHOLDER = "#";

    /** 文件名里"最后一段连续数字"（从右往左找，所以 {@code xxx_2_5} 取 5） */
    private static final Pattern TRAILING_NUMBER = Pattern.compile("(\\d+)(?!.*\\d)");

    private FrameHoldInference() {
    }

    /**
     * 推算结果。
     *
     * @param holds    每张图的持续帧数（长度 = 文件数）；{@code applied=false} 时全是 {@code defaultHold}
     * @param applied  是否真的按编号推算了
     * @param warnings 需要给用户看的提示（没推算的原因是"正常情况"时为空）
     */
    public record Result(List<Integer> holds, boolean applied, List<String> warnings) {

        /** 不推算，全部用默认值 */
        static Result fallback(int count, int defaultHold, List<String> warnings) {
            List<Integer> holds = new ArrayList<>(count);
            for (int i = 0; i < count; i++) {
                holds.add(defaultHold);
            }
            return new Result(holds, false, warnings);
        }
    }

    /**
     * 按文件名编号推算每帧持续帧数。
     *
     * @param fileNames       已经按**自然排序**排好的文件名（顺序即播放顺序）
     * @param defaultHold     最后一张（以及不推算时）的默认持续帧数，会被收敛到 ≥1
     * @param maxGapFrames    单张时长上限；≤0 时用 {@link #DEFAULT_MAX_GAP_FRAMES}
     * @param maxTotalFrames  一轮总时长上限；≤0 表示不限制
     * @return 推算结果；**永不抛异常**（算法只管"能不能推"，不负责让导入失败）
     */
    public static Result infer(List<String> fileNames, int defaultHold, int maxGapFrames, int maxTotalFrames) {
        int count = fileNames == null ? 0 : fileNames.size();
        int fallbackHold = Math.max(1, defaultHold);
        List<String> warnings = new ArrayList<>();

        // 单张：没有后继编号，无法推算（这是正常情况，不打扰用户）
        if (count < 2) {
            return Result.fallback(count, fallbackHold, warnings);
        }

        List<String> templates = new ArrayList<>(count);
        List<Long> numbers = new ArrayList<>(count);
        for (String fileName : fileNames) {
            ParsedName parsed = parse(fileName);
            if (parsed == null) {
                // 有文件根本没有编号 → 无法确定它在序列里的位置（正常情况，不提示）
                return Result.fallback(count, fallbackHold, warnings);
            }
            templates.add(parsed.template());
            numbers.add(parsed.number());
        }

        // 前缀/后缀模式必须一致，否则不是同一序列
        String first = templates.get(0);
        for (int i = 1; i < templates.size(); i++) {
            if (!first.equals(templates.get(i))) {
                warnings.add(String.format(
                        "文件名前缀不一致（「%s」与「%s」），不属于同一序列，已按每张 %d 帧导入",
                        sampleOf(fileNames.get(0)), sampleOf(fileNames.get(i)), fallbackHold));
                return Result.fallback(count, fallbackHold, warnings);
            }
        }

        // 编号必须严格递增：重复（拿不到差值）与逆序（差值会变成负数）都不算规律
        for (int i = 0; i < numbers.size() - 1; i++) {
            long current = numbers.get(i);
            long next = numbers.get(i + 1);
            if (current == next) {
                warnings.add(String.format(
                        "检测到重复编号 %d（%s），已按每张 %d 帧导入",
                        current, sampleOf(fileNames.get(i + 1)), fallbackHold));
                return Result.fallback(count, fallbackHold, warnings);
            }
            if (current > next) {
                warnings.add(String.format(
                        "文件名编号不是递增的（%d 之后是 %d），已按每张 %d 帧导入",
                        current, next, fallbackHold));
                return Result.fallback(count, fallbackHold, warnings);
            }
        }

        int cap = maxGapFrames > 0 ? maxGapFrames : DEFAULT_MAX_GAP_FRAMES;
        List<Integer> holds = new ArrayList<>(count);
        int clamped = 0;
        long total = 0;
        for (int i = 0; i < count - 1; i++) {
            long gap = numbers.get(i + 1) - numbers.get(i);
            int hold = (int) Math.min(gap, cap);
            if (gap > cap) {
                clamped++;
            }
            holds.add(hold);
            total += hold;
        }
        // 最后一张没有后继编号：用默认值（UI 上要说明这一点）
        holds.add(fallbackHold);
        total += fallbackHold;

        if (maxTotalFrames > 0 && total > maxTotalFrames) {
            warnings.add(String.format(
                    "按编号推算出的总时长 %d 帧超过上限 %d 帧，已改按每张 %d 帧导入",
                    total, maxTotalFrames, fallbackHold));
            return Result.fallback(count, fallbackHold, warnings);
        }

        if (clamped > 0) {
            warnings.add(String.format(
                    "有 %d 张图的编号间隔超过 %d 帧，已截断到 %d 帧", clamped, cap, cap));
        }
        warnings.add(String.format(
                "已按文件名编号推算每帧时长（最后一张无后继编号，按默认 %d 帧）", fallbackHold));
        return new Result(holds, true, warnings);
    }

    /**
     * 解析一个文件名：提取最后一段数字 + 把那段换成 {@code #} 得到模板。
     *
     * @return 没有数字时返回 {@code null}
     */
    static ParsedName parse(String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return null;
        }
        String base = stripExtension(fileName.trim());
        Matcher matcher = TRAILING_NUMBER.matcher(base);
        if (!matcher.find()) {
            return null;
        }
        String digits = matcher.group(1);
        long value;
        try {
            value = Long.parseLong(digits);
        } catch (NumberFormatException overflow) {
            // 19 位以上的数字：不是正常编号，当作"没有编号"
            return null;
        }
        String template = base.substring(0, matcher.start()) + NUMBER_PLACEHOLDER
                + base.substring(matcher.end());
        return new ParsedName(template.toLowerCase(Locale.ROOT), value);
    }

    /** 去掉最后一个扩展名（{@code xxx_1.png} → {@code xxx_1}） */
    private static String stripExtension(String fileName) {
        int dot = fileName.lastIndexOf('.');
        // dot <= 0：没有扩展名，或者文件本身以 "." 开头
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }

    /** 提示里只显示文件名，不带目录（导入时上传的名字本来就只有文件名） */
    private static String sampleOf(String fileName) {
        return fileName == null ? "" : fileName;
    }

    /** 一个文件名的解析结果 */
    record ParsedName(String template, long number) {
    }
}
