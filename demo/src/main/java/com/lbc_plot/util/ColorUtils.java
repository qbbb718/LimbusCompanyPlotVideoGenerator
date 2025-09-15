package com.lbc_plot.util;

import java.awt.Color;

/**
 * 颜色与字符串转换工具
 */
public class ColorUtils {
    
    public static String colorToString(Color color) {
        if (color == null) return null;
        return color.getRed() + "," + color.getGreen() + "," + color.getBlue() + "," + color.getAlpha();
    }
    
    
    public static Color stringToColor(String colorStr) {
        if (colorStr == null || colorStr.isEmpty()) return null;
        
        try {
            String[] parts = colorStr.split(",");
            if (parts.length == 3) {
                return new Color(
                    Integer.parseInt(parts[0]),
                    Integer.parseInt(parts[1]),
                    Integer.parseInt(parts[2])
                );
            } else if (parts.length == 4) {
                return new Color(
                    Integer.parseInt(parts[0]),
                    Integer.parseInt(parts[1]),
                    Integer.parseInt(parts[2]),
                    Integer.parseInt(parts[3])
                );
            }
        } catch (Exception e) {
            System.err.println("颜色转换失败: " + colorStr);
        }
        return null;
    }
}