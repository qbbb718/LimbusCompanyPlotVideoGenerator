package com.lbc_plot.project.tool;

import java.awt.Color;

/**
 * RGB与HSL颜色空间转换工具类
 * 提供RGB和HSL颜色空间的相互转换功能
 */ 
public class ColorSpaceConverter {

    /**
     * RGB颜色转HSL颜色空间
     * @param r 红色分量 (0-255)
     * @param g 绿色分量 (0-255)
     * @param b 蓝色分量 (0-255)
     * @return HSL数组 [色相(0-360), 饱和度(0-1), 亮度(0-1)]
     */
    public static float[] rgbToHsl(int r, int g, int b) {
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

    /**
     * HSL颜色空间转RGB颜色
     * @param h 色相 (0-360)
     * @param s 饱和度 (0-1)
     * @param l 亮度 (0-1)
     * @return RGB颜色对象
     */
    public static Color hslToRgb(float h, float s, float l) {
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

    /**
     * Color对象转HSL
     * @param color 颜色对象
     * @return HSL数组 [色相(0-360), 饱和度(0-1), 亮度(0-1)]
     */
    public static float[] colorToHsl(Color color) {
        return rgbToHsl(color.getRed(), color.getGreen(), color.getBlue());
    }
}