package com.lbc_plot.render.video;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lbc_plot.plot.model.Record;

/**
 * 起始转场（交叉溶解 / 黑屏 / 白屏）的行为测试。
 *
 * <p>覆盖四层，任何一层坏掉都会让导出视频里的转场不对：
 * <ol>
 *   <li>不透明度曲线：20 帧内从 100% 线性降到 0%（含两端），之后再叠加就是多余的；</li>
 *   <li>识别哪种转场：只认"已勾选"的条目；同时存在多种时按 交叉溶解 &gt; 黑屏 &gt; 白屏 取一种；</li>
 *   <li>混色：首帧完全是叠加层，末帧只剩记录自己的画面；</li>
 *   <li>序列化往返：特效必须活在记录 JSON 里，否则导出请求发到后端就丢了（此前
 *       {@code Record.effects} 是 {@code @JsonIgnore}，正是这个坑）。</li>
 * </ol>
 */
@DisplayName("起始转场")
class StartTransitionTest {

    @Test
    @DisplayName("20 帧内不透明度从 100% 线性降到 0%，之后不再叠加")
    void opacityFadesOutWithinTwentyFrames() {
        assertEquals(1.0f, StartTransition.opacityAt(0), 1e-6f, "第 0 帧应完全不透明");
        assertEquals(0.0f, StartTransition.opacityAt(StartTransition.FRAMES - 1), 1e-6f,
                "淡出范围的最后一帧应完全透明");
        assertEquals(0.0f, StartTransition.opacityAt(StartTransition.FRAMES), 1e-6f,
                "淡出结束后不应再叠加");
        assertEquals(0.0f, StartTransition.opacityAt(-1), 1e-6f, "负帧号按「不叠加」处理");

        // 线性：中间帧约等于线性插值，且逐帧单调递减
        float previous = 1.0f;
        for (int frame = 1; frame < StartTransition.FRAMES; frame++) {
            float opacity = StartTransition.opacityAt(frame);
            assertTrue(opacity < previous, "不透明度必须逐帧下降，第 " + frame + " 帧为 " + opacity);
            assertTrue(opacity > 0f || frame == StartTransition.FRAMES - 1,
                    "只有最后一帧可以降到 0，第 " + frame + " 帧为 " + opacity);
            previous = opacity;
        }
        assertEquals(1.0f - 9f / (StartTransition.FRAMES - 1), StartTransition.opacityAt(9), 1e-6f,
                "第 9 帧应为线性插值");
    }

    @Test
    @DisplayName("三种转场各自识别，未勾选/未知类型不算")
    void eachTransitionKindIsRecognised() {
        assertEquals(StartTransition.Kind.NONE, StartTransition.kindOf(null), "null 记录不应启用");
        assertEquals(StartTransition.Kind.NONE,
                StartTransition.kindOf(new Record.Builder().build()), "没有特效的记录不应启用");

        Record plain = new Record.Builder().addEffect(new EffectVisual("SOMETHING_ELSE")).build();
        assertEquals(StartTransition.Kind.NONE, StartTransition.kindOf(plain), "未知特效不应触发转场");

        EffectVisual disabled = EffectVisual.crossDissolve();
        disabled.setEnabled(false);
        assertEquals(StartTransition.Kind.NONE,
                StartTransition.kindOf(new Record.Builder().addEffect(disabled).build()),
                "取消勾选的特效不应触发");

        assertEquals(StartTransition.Kind.PREVIOUS_FRAME,
                StartTransition.kindOf(recordWith(EffectVisual.crossDissolve())));
        assertEquals(StartTransition.Kind.BLACK,
                StartTransition.kindOf(recordWith(EffectVisual.fadeFromBlack())));
        assertEquals(StartTransition.Kind.WHITE,
                StartTransition.kindOf(recordWith(EffectVisual.fadeFromWhite())));

        Record nullEffects = new Record.Builder().build();
        nullEffects.setEffects(null);
        assertEquals(StartTransition.Kind.NONE, StartTransition.kindOf(nullEffects),
                "特效列表为 null 时不应抛异常");

        assertTrue(EffectVisual.fadeFromBlack().isFadeFromBlack(), "黑屏特效应识别为黑屏转场");
        assertTrue(EffectVisual.fadeFromWhite().isFadeFromWhite(), "白屏特效应识别为白屏转场");
        assertTrue(EffectVisual.crossDissolve().isStartTransition(), "交叉溶解属于起始转场");
        assertFalse(new EffectVisual("SOMETHING_ELSE").isStartTransition(), "未知特效不属于起始转场");
    }

    @Test
    @DisplayName("同时勾多种转场时按 交叉溶解 > 黑屏 > 白屏 取一种")
    void multipleTransitionsPickByPriority() {
        // 故意按"优先级最低在前"的顺序放进列表，确认结果不看数组顺序
        Record all = new Record.Builder()
                .addEffect(EffectVisual.fadeFromWhite())
                .addEffect(EffectVisual.fadeFromBlack())
                .addEffect(EffectVisual.crossDissolve())
                .build();
        assertEquals(StartTransition.Kind.PREVIOUS_FRAME, StartTransition.kindOf(all),
                "交叉溶解优先级最高");
        assertTrue(StartTransition.isCrossDissolve(all));

        Record blackAndWhite = new Record.Builder()
                .addEffect(EffectVisual.fadeFromWhite())
                .addEffect(EffectVisual.fadeFromBlack())
                .build();
        assertEquals(StartTransition.Kind.BLACK, StartTransition.kindOf(blackAndWhite),
                "黑屏优先于白屏");

        Record whiteOnly = recordWith(EffectVisual.fadeFromWhite());
        assertEquals(StartTransition.Kind.WHITE, StartTransition.kindOf(whiteOnly));
        assertFalse(StartTransition.isCrossDissolve(whiteOnly), "白屏转场不是交叉溶解");
    }

    @Test
    @DisplayName("叠加按当前帧不透明度淡出：首帧全是叠加层，末帧只剩自己的画面")
    void applyBlendsOverlay() {
        BufferedImage frame = solid(Color.RED, 8, 8);
        BufferedImage overlay = solid(Color.BLUE, 8, 8);

        // 第 0 帧：完全不透明 → 画面看起来就是叠加层
        StartTransition.apply(frame, overlay, 0);
        assertEquals(Color.BLUE.getRGB() & 0xFFFFFF, colorOf(frame));

        // 淡出范围的最后一帧：完全透明 → 回到记录自己的画面
        BufferedImage lastFrame = solid(Color.RED, 8, 8);
        StartTransition.apply(lastFrame, overlay, StartTransition.FRAMES - 1);
        assertEquals(Color.RED.getRGB() & 0xFFFFFF, colorOf(lastFrame));

        // 淡出结束后再调用也不应改动画面
        BufferedImage afterFade = solid(Color.RED, 8, 8);
        StartTransition.apply(afterFade, overlay, StartTransition.FRAMES);
        assertEquals(Color.RED.getRGB() & 0xFFFFFF, colorOf(afterFade));

        // 中间帧：按线性不透明度混色（蓝的量 ≈ 52.6%）
        BufferedImage middle = solid(Color.RED, 8, 8);
        StartTransition.apply(middle, overlay, 9);
        Color blended = new Color(colorOf(middle));
        assertEquals(52.6, blended.getBlue() / 255.0 * 100, 1.0, "蓝色分量应接近 52.6%");
        assertEquals(47.3, blended.getRed() / 255.0 * 100, 1.0, "红色分量应接近 47.4%");
    }

    @Test
    @DisplayName("纯色叠加层：黑屏全黑、白屏全白")
    void solidOverlayIsFullyOpaqueColor() {
        BufferedImage black = StartTransition.solidOverlay(Color.BLACK, 16, 9);
        assertEquals(16, black.getWidth(), "按画面宽度生成");
        assertEquals(9, black.getHeight(), "按画面高度生成");
        assertEquals(Color.BLACK.getRGB(), black.getRGB(0, 0), "黑屏叠加层应为纯黑");
        assertEquals(Color.BLACK.getRGB(), black.getRGB(15, 8), "黑屏叠加层应铺满整幅画面");

        BufferedImage white = StartTransition.solidOverlay(Color.WHITE, 16, 9);
        assertEquals(Color.WHITE.getRGB(), white.getRGB(0, 0), "白屏叠加层应为纯白");
        assertEquals(Color.WHITE.getRGB(), white.getRGB(15, 8), "白屏叠加层应铺满整幅画面");
    }

    @Test
    @DisplayName("三种特效都能随记录序列化/反序列化，导出请求里不会丢")
    void effectsSurviveJsonRoundTrip() throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        Record record = new Record.Builder()
                .uuid("effect-record")
                .addEffect(EffectVisual.crossDissolve())
                .addEffect(EffectVisual.fadeFromBlack())
                .addEffect(EffectVisual.fadeFromWhite())
                .build();

        String json = mapper.writeValueAsString(record);
        assertTrue(json.contains("\"effects\""), "记录 JSON 必须带 effects 字段: " + json);
        assertTrue(json.contains(EffectVisual.TYPE_CROSS_DISSOLVE), "交叉溶解类型要写进 JSON: " + json);
        assertTrue(json.contains(EffectVisual.TYPE_FADE_FROM_BLACK), "黑屏转场类型要写进 JSON: " + json);
        assertTrue(json.contains(EffectVisual.TYPE_FADE_FROM_WHITE), "白屏转场类型要写进 JSON: " + json);

        Record parsed = mapper.readValue(json, Record.class);
        assertEquals(3, parsed.getEffects().size(), "反序列化后特效应全部保留");
        assertEquals(StartTransition.Kind.PREVIOUS_FRAME, StartTransition.kindOf(parsed),
                "解析出来的记录应按优先级识别为交叉溶解");

        // 只保留黑屏转场时，解析后应识别为黑屏
        Record blackOnly = new Record.Builder()
                .uuid("black-record")
                .addEffect(EffectVisual.fadeFromBlack())
                .build();
        Record parsedBlack = mapper.readValue(mapper.writeValueAsString(blackOnly), Record.class);
        assertEquals(StartTransition.Kind.BLACK, StartTransition.kindOf(parsedBlack));
    }

    private static Record recordWith(EffectVisual effect) {
        return new Record.Builder().addEffect(effect).build();
    }

    private static BufferedImage solid(Color color, int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g2d = image.createGraphics();
        try {
            g2d.setColor(color);
            g2d.fillRect(0, 0, width, height);
        } finally {
            g2d.dispose();
        }
        return image;
    }

    private static int colorOf(BufferedImage image) {
        return image.getRGB(image.getWidth() / 2, image.getHeight() / 2) & 0xFFFFFF;
    }
}
