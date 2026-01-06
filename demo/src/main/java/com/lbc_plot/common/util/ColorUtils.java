package com.lbc_plot.common.util;

import java.awt.Color;

/**
 * 颜色与字符串转换工具
 */
public class ColorUtils {

    public static String colorToString(Color color) {
        if (color == null)
            return null;
        return color.getRed() + "," + color.getGreen() + "," + color.getBlue() + "," + color.getAlpha();
    }

    public static Color stringToColor(String colorStr) {
        if (colorStr == null || colorStr.isEmpty())
            return null;

        try {
            String[] parts = colorStr.split(",");
            if (parts.length == 3) {
                return new Color(
                        Integer.parseInt(parts[0]),
                        Integer.parseInt(parts[1]),
                        Integer.parseInt(parts[2]));
            } else if (parts.length == 4) {
                return new Color(
                        Integer.parseInt(parts[0]),
                        Integer.parseInt(parts[1]),
                        Integer.parseInt(parts[2]),
                        Integer.parseInt(parts[3]));
            }
        } catch (Exception e) {
            System.err.println("颜色转换失败: " + colorStr);
        }
        return null;
    }

    /**
     * 将十六进制颜色字符串转换为Color对象
     * 
     * @param hex 十六进制颜色字符串，可以是#RRGGBB或RRGGBB格式
     * @return Color对象，转换失败返回null
     */
    public static Color hexToColor(String hex) {
        if (hex == null || hex.isEmpty())
            return null;

        try {
            // 移除可能的#前缀
            hex = hex.startsWith("#") ? hex.substring(1) : hex;

            // 解析十六进制颜色
            return new Color(
                    Integer.parseInt(hex.substring(0, 2), 16),
                    Integer.parseInt(hex.substring(2, 4), 16),
                    Integer.parseInt(hex.substring(4, 6), 16));
        } catch (Exception e) {
            System.err.println("十六进制颜色转换失败: " + hex);
            return null;
        }
    }
}