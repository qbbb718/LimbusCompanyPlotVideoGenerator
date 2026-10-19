package com.lbc_plot.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.awt.Color;
import java.awt.image.BufferedImage;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link ImageDarkener} 的像素级测试：压暗是纯函数，混合公式与透明度处理都必须保持稳定，
 * 因为预览图与成片的"非说话人压暗"全靠它。
 */
class ImageDarkenerTest {

    @Test
    @DisplayName("半透明黑压暗：RGB 按比例混合，alpha 原样保留")
    void blendsRgbAndKeepsAlpha() {
        BufferedImage source = new BufferedImage(4, 1, BufferedImage.TYPE_INT_ARGB);
        source.setRGB(0, 0, 0xFFC8A064); // alpha=255, RGB(200,160,100)
        source.setRGB(1, 0, 0x80FF0000); // alpha=128, 红
        source.setRGB(2, 0, 0x00000000); // 全透明
        source.setRGB(3, 0, 0xFF000000); // 纯黑

        BufferedImage darkened = ImageDarkener.darkenImage(source, 0.5f); // alpha=127 → w≈0.498

        assertNotNull(darkened);
        assertNotSame(source, darkened, "不应原地修改入参");

        // w = 127/255 ≈ 0.49803922；keep = 0.5019608
        int expectedR = (int) (200 * (1 - 127 / 255.0f));
        int expectedG = (int) (160 * (1 - 127 / 255.0f));
        int expectedB = (int) (100 * (1 - 127 / 255.0f));
        assertEquals(0xFF000000 | (expectedR << 16) | (expectedG << 8) | expectedB, darkened.getRGB(0, 0));

        // alpha 必须原样保留（压暗不能改变透明度）
        assertEquals(0x80, darkened.getRGB(1, 0) >>> 24);
        assertEquals(0, darkened.getRGB(2, 0) >>> 24, "全透明像素压暗后仍应全透明");

        // 原图不应被改动
        assertEquals(0xFFC8A064, source.getRGB(0, 0));
    }

    @Test
    @DisplayName("快路径（TYPE_INT_ARGB）与通用路径（其它类型）结果一致")
    void fastPathMatchesGenericPath() {
        BufferedImage argb = sampleImage(BufferedImage.TYPE_INT_ARGB);
        // 用 setRGB 逐像素转成通用类型（4BYTE_ABGR）：与 drawImage 不同，它不做预乘合成，
        // 半透明像素的 RGB 能原样保留，这样比较的才是"压暗公式"而不是"类型转换精度"
        BufferedImage abgr = new BufferedImage(argb.getWidth(), argb.getHeight(), BufferedImage.TYPE_4BYTE_ABGR);
        for (int y = 0; y < argb.getHeight(); y++) {
            for (int x = 0; x < argb.getWidth(); x++) {
                abgr.setRGB(x, y, argb.getRGB(x, y));
            }
        }

        BufferedImage fast = ImageDarkener.darkenImage(argb, 0.5f);
        BufferedImage generic = ImageDarkener.darkenImage(abgr, 0.5f);

        for (int y = 0; y < argb.getHeight(); y++) {
            for (int x = 0; x < argb.getWidth(); x++) {
                assertEquals(generic.getRGB(x, y), fast.getRGB(x, y),
                        String.format("(%d,%d) 两种类型的压暗结果必须一致", x, y));
            }
        }
    }

    @Test
    @DisplayName("压暗颜色不透明时变成纯色，但仍保留原 alpha")
    void opaqueDarkColor() {
        BufferedImage source = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
        source.setRGB(0, 0, 0x40FFFFFF);
        BufferedImage darkened = ImageDarkener.darkenImage(source, new Color(0, 0, 0, 255));
        assertEquals(0x40000000, darkened.getRGB(0, 0));
    }

    @Test
    @DisplayName("空图像/空颜色应报错而不是静默返回")
    void nullArgumentsThrow() {
        assertThrows(IllegalArgumentException.class, () -> ImageDarkener.darkenImage(null, 0.5f));
        assertThrows(IllegalArgumentException.class,
                () -> ImageDarkener.darkenImage(new BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB), null));
    }

    private static BufferedImage sampleImage(int type) {
        BufferedImage image = new BufferedImage(16, 12, type);
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int a = (x * 17) & 0xFF;
                int r = (x * 11 + y * 3) & 0xFF;
                int g = (x * 5 + y * 23) & 0xFF;
                int b = (x * 31 + y * 7) & 0xFF;
                image.setRGB(x, y, (a << 24) | (r << 16) | (g << 8) | b);
            }
        }
        return image;
    }
}
