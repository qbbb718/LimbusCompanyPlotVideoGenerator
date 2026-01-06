package com.lbc_plot.common.util.json;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.awt.Color;
import java.io.IOException;
import java.util.logging.Logger;

/**
 * 自定义JSON反序列化器，用于将JSON字符串转换为Color对象
 * 支持RGB和RGBA两种格式的颜色值，格式为"R,G,B"或"R,G,B,A"
 * 也支持十六进制格式，格式为"#RRGGBB"或"RRGGBB"
 */
public class ColorDeserializer extends JsonDeserializer<Color> {
    private static final Logger logger = Logger.getLogger(ColorDeserializer.class.getName());

    @Override
    public Color deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        String colorStr = p.getText();
        logger.info("开始解析颜色字符串: " + colorStr);

        if (colorStr == null || colorStr.isEmpty()) {
            logger.warning("颜色字符串为空或null");
            return null;
        }

        try {
            // 处理十六进制格式
            if (colorStr.startsWith("#")) {
                logger.info("检测到十六进制颜色格式");
                return hexToColor(colorStr);
            }

            // 处理逗号分隔的RGB/RGBA格式
            String[] rgb = colorStr.split(",");
            if (rgb.length == 3) {
                logger.info("检测到RGB格式颜色");
                return new Color(
                        Integer.parseInt(rgb[0]),
                        Integer.parseInt(rgb[1]),
                        Integer.parseInt(rgb[2]));
            } else if (rgb.length == 4) {
                logger.info("检测到RGBA格式颜色");
                return new Color(
                        Integer.parseInt(rgb[0]),
                        Integer.parseInt(rgb[1]),
                        Integer.parseInt(rgb[2]),
                        Integer.parseInt(rgb[3]));
            }

            logger.warning("未识别的颜色格式: " + colorStr);
            return null;
        } catch (Exception e) {
            logger.severe("颜色解析异常: " + e.getMessage());
            return null;
        }
    }

    /**
     * 将十六进制颜色字符串转换为Color对象
     * 
     * @param hex 十六进制颜色字符串，可以是#RRGGBB或RRGGBB格式
     * @return Color对象
     */
    private Color hexToColor(String hex) {
        try {
            // 移除可能的#前缀
            hex = hex.startsWith("#") ? hex.substring(1) : hex;

            // 确保十六进制字符串长度正确
            if (hex.length() != 6) {
                logger.warning("十六进制颜色字符串长度不正确: " + hex);
                return null;
            }

            // 解析十六进制颜色
            int red = Integer.parseInt(hex.substring(0, 2), 16);
            int green = Integer.parseInt(hex.substring(2, 4), 16);
            int blue = Integer.parseInt(hex.substring(4, 6), 16);

            logger.info("成功解析十六进制颜色 - R:" + red + ", G:" + green + ", B:" + blue);
            return new Color(red, green, blue);
        } catch (Exception e) {
            logger.severe("十六进制颜色解析失败: " + hex + ", 错误: " + e.getMessage());
            return null;
        }
    }
}