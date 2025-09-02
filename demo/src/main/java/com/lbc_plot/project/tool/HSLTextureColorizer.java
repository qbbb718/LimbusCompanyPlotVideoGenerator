package com.lbc_plot.project.tool;

import java.awt.*;
import java.awt.image.BufferedImage;

public class HSLTextureColorizer {

    /**
     * 将白色纹理调整为目标HSL值
     * @param texture 白色纹理（RGB）
     * @param hue 目标色相（0-360）
     * @param saturation 目标饱和度（0-100）
     * @param lightnessAdjust 亮度调整（-100到+100）
     * @return 着色后的图像
     */
    public static BufferedImage colorize(BufferedImage texture, float hue, float saturation, float lightnessAdjust) {
        BufferedImage result = new BufferedImage(
            texture.getWidth(), texture.getHeight(), BufferedImage.TYPE_INT_ARGB
        );

        for (int y = 0; y < texture.getHeight(); y++) {
            for (int x = 0; x < texture.getWidth(); x++) {
                int rgb = texture.getRGB(x, y);
                Color color = new Color(rgb);

                // 1. 将原色转换为HSL（范围：H[0,360], S[0,1], L[0,1]）
                float[] hsl = rgbToHsl(color.getRed(), color.getGreen(), color.getBlue());

                // 2. 应用调整（白色原HSL为[0,0,1]）
                hsl[0] = hue;                          // 色相覆盖
                hsl[1] = saturation / 100f;            // 饱和度设为40%
                hsl[2] = (hsl[2] * (1 + lightnessAdjust / 100f)); // 亮度调整-65%
                hsl[2] = Math.max(0, Math.min(1, hsl[2])); // 限制范围

                // 3. 转回RGB
                Color newColor = hslToRgb(hsl[0], hsl[1], hsl[2]);
                result.setRGB(x, y, newColor.getRGB());
            }
        }
        return result;
    }

    // RGB转HSL（公式实现）
    private static float[] rgbToHsl(int r, int g, int b) {
        float[] hsl = new float[3];
        float rf = r / 255f, gf = g / 255f, bf = b / 255f;
        float max = Math.max(rf, Math.max(gf, bf));
        float min = Math.min(rf, Math.min(gf, bf));
        float delta = max - min;

        // 计算亮度（Lightness）
        hsl[2] = (max + min) / 2f;

        // 计算饱和度（Saturation）
        if (delta == 0) {
            hsl[1] = 0;
        } else {
            hsl[1] = delta / (1 - Math.abs(2 * hsl[2] - 1));
        }

        // 计算色相（Hue）
        if (delta == 0) {
            hsl[0] = 0;
        } else if (max == rf) {
            hsl[0] = ((gf - bf) / delta) % 6;
        } else if (max == gf) {
            hsl[0] = (bf - rf) / delta + 2;
        } else {
            hsl[0] = (rf - gf) / delta + 4;
        }
        hsl[0] *= 60;
        if (hsl[0] < 0) hsl[0] += 360;

        return hsl;
    }

    // HSL转RGB（公式实现）
    private static Color hslToRgb(float h, float s, float l) {
        float c = (1 - Math.abs(2 * l - 1)) * s;
        float x = c * (1 - Math.abs((h / 60) % 2 - 1));
        float m = l - c / 2;

        float r, g, b;
        if (h < 60) {
            r = c; g = x; b = 0;
        } else if (h < 120) {
            r = x; g = c; b = 0;
        } else if (h < 180) {
            r = 0; g = c; b = x;
        } else if (h < 240) {
            r = 0; g = x; b = c;
        } else if (h < 300) {
            r = x; g = 0; b = c;
        } else {
            r = c; g = 0; b = x;
        }

        return new Color(
            (int) ((r + m) * 255),
            (int) ((g + m) * 255),
            (int) ((b + m) * 255)
        );
    }
}