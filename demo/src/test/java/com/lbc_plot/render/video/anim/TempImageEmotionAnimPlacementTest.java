package com.lbc_plot.render.video.anim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 临时图片的**头部正方形区域**（情绪动画的坐标基准）的纯算术验证。
 *
 * <p>需求原文只有四句话：
 * <ol>
 *   <li>设图片宽度为 {@code x}；</li>
 *   <li>头部区域是边长 {@code s = x / 3} 的正方形；</li>
 *   <li>水平居中；</li>
 *   <li>竖直方向贴合上边缘（正方形上边与图片上边缘对齐）。</li>
 * </ol>
 *
 * <p>这四条在这里逐条钉死：动的是纯函数，错一位都不会抛异常，只会在成片里"气泡飘到脸上/画面外"。
 * 前端 {@code previewLayout.tempImageHeadBox} 与它是同一份公式的两种语言，改一边必须同步另一边。
 */
class TempImageEmotionAnimPlacementTest {

    @Test
    @DisplayName("边长 = 图片宽度 / 3，且只看宽度（与图片高度无关）")
    void headBoxIsOneThirdOfTheDisplayedWidth() {
        // 300 宽 → 100；高度 900 再大也不影响
        EmotionAnimPlacement.Rect head = EmotionAnimPlacement.tempImageHeadBox(760, 300, 300);
        assertEquals(100d, head.w(), 1e-9);
        assertEquals(100d, head.h(), 1e-9, "必须是正方形");

        // 宽度翻倍 → 边长跟着翻倍
        assertEquals(200d, EmotionAnimPlacement.tempImageHeadSize(600), 1e-9);
        // 小数宽度也照原值算（预览不取整，后端只在绘制时取整）
        assertEquals(50d, EmotionAnimPlacement.tempImageHeadSize(150), 1e-9);
    }

    @Test
    @DisplayName("水平居中：左右两条留白相等，中心在图片宽度的中点")
    void headBoxIsHorizontallyCentered() {
        EmotionAnimPlacement.Rect head = EmotionAnimPlacement.tempImageHeadBox(760, 300, 300);

        // 左边距 = 760 → 860 是 100；右边 = 1060 − (860+100) = 100
        double leftGap = head.x() - 760d;
        double rightGap = (760d + 300d) - (head.x() + head.w());
        assertEquals(leftGap, rightGap, 1e-9, "左右留白必须相等（水平居中）");
        assertEquals(760d + 300d / 2d, head.centerX(), 1e-9,
                "方框中心 X 必须落在图片宽度的中点");
    }

    @Test
    @DisplayName("顶部贴合：正方形上边与图片上边缘重合，不往下掉")
    void headBoxHugsTheTopEdge() {
        EmotionAnimPlacement.Rect head = EmotionAnimPlacement.tempImageHeadBox(760, 300, 300);

        assertEquals(300d, head.y(), 1e-9, "头部区域上边必须与图片上边缘对齐");
        assertEquals(300d + 100d, head.y() + head.h(), 1e-9);
        // 中心在方框竖直方向正中：图片顶边 + 半边长
        assertEquals(300d + 50d, head.centerY(), 1e-9);
    }

    @Test
    @DisplayName("不同位置的图片：方框整体跟着平移，形状与相对位置不变")
    void headBoxFollowsTheImage() {
        EmotionAnimPlacement.Rect a = EmotionAnimPlacement.tempImageHeadBox(0, 0, 300);
        EmotionAnimPlacement.Rect b = EmotionAnimPlacement.tempImageHeadBox(500, 200, 300);

        assertEquals(a.w(), b.w(), 1e-9);
        assertEquals(a.x() + 500d, b.x(), 1e-9);
        assertEquals(a.y() + 200d, b.y(), 1e-9);
    }

    @Test
    @DisplayName("非正 / 非法宽度不会产生 NaN：按 1px 兜底")
    void invalidWidthFallsBack() {
        for (double width : new double[] { 0d, -300d, Double.NaN }) {
            EmotionAnimPlacement.Rect head = EmotionAnimPlacement.tempImageHeadBox(0, 0, width);
            assertTrue(Double.isFinite(head.x()) && Double.isFinite(head.w()), "不能出现 NaN: " + width);
            assertEquals(1d / EmotionAnimPlacement.TEMP_IMAGE_HEAD_WIDTH_DIVISOR, head.w(), 1e-9);
        }
    }

    @Test
    @DisplayName("情绪动画矩形以头部区域中心对齐，偏移单位 = 头部区域边长")
    void spriteRectUsesTheHeadBoxAsOrigin() {
        double imageX = 760;
        double imageY = 300;
        double imageWidth = 300;
        EmotionAnimPlacement.Rect head = EmotionAnimPlacement.tempImageHeadBox(imageX, imageY, imageWidth);

        // 偏移 0：素材中心正好落在头部区域中心；素材 200×200、缩放 1、用户缩放 1
        EmotionAnimPlacement.Rect centered = EmotionAnimPlacement.spriteRect(
                head.centerX(), head.centerY(), head.w(), 200, 200, 1d, 1d, 0d, 0d);
        assertEquals(head.centerX(), centered.centerX(), 1e-9);
        assertEquals(head.centerY(), centered.centerY(), 1e-9);
        // 头部中心 = (910, 350) → 素材左上角 (810, 250)
        assertEquals(810d, centered.x(), 1e-9);
        assertEquals(250d, centered.y(), 1e-9);

        // 偏移 (1, -0.5)：右移一个头宽（100）、上移半个头宽（50）
        EmotionAnimPlacement.Rect shifted = EmotionAnimPlacement.spriteRect(
                head.centerX(), head.centerY(), head.w(), 200, 200, 1d, 1d, 1d, -0.5d);
        assertEquals(head.centerX() + 100d, shifted.centerX(), 1e-9);
        assertEquals(head.centerY() - 50d, shifted.centerY(), 1e-9);
    }

    @Test
    @DisplayName("图片放大 / 缩小：头部区域与素材一起缩放，相对位置不变")
    void scalingTheImageKeepsTheRelativePlacement() {
        // 同一份摆放（偏移 1 个头宽）在 1× 与 2× 下都落在"图片宽度的同一相对位置"
        EmotionAnimPlacement.Rect head1x = EmotionAnimPlacement.tempImageHeadBox(760, 300, 300);
        EmotionAnimPlacement.Rect head2x = EmotionAnimPlacement.tempImageHeadBox(760, 300, 600);

        assertEquals(2d * head1x.w(), head2x.w(), 1e-9);
        // 中心 X 都在各自图片宽度的中点
        assertEquals(760d + 150d, head1x.centerX(), 1e-9);
        assertEquals(760d + 300d, head2x.centerX(), 1e-9);
        // 顶部始终贴合：图片上边缘没动，方框上边也没动
        assertEquals(300d, head1x.y(), 1e-9);
        assertEquals(300d, head2x.y(), 1e-9);
    }

    @Test
    @DisplayName("用户缩放兜底：非正 / 非法按 1（与渲染端把 scale 直接交给缩放器一致）")
    void safeImageScaleFallsBack() {
        assertEquals(1d, EmotionAnimPlacement.safeImageScale(0d), 1e-9);
        assertEquals(1d, EmotionAnimPlacement.safeImageScale(-2d), 1e-9);
        assertEquals(1d, EmotionAnimPlacement.safeImageScale(Double.NaN), 1e-9);
        assertEquals(0.5d, EmotionAnimPlacement.safeImageScale(0.5d), 1e-9);
    }
}
