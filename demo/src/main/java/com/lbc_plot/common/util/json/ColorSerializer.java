package com.lbc_plot.common.util.json;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;
import java.awt.Color;
import java.io.IOException;
import java.util.logging.Logger;

public class ColorSerializer extends StdSerializer<Color> {
    private static final Logger logger = Logger.getLogger(ColorSerializer.class.getName());

    public ColorSerializer() {
        super(Color.class);
    }

    @Override
    public void serialize(Color color, JsonGenerator gen, SerializerProvider provider)
            throws IOException {
        if (color == null) {
            gen.writeNull();
            return;
        }

        // 将颜色转换为十六进制格式，前端期望的格式
        String hex = String.format("#%02X%02X%02X",
                color.getRed(),
                color.getGreen(),
                color.getBlue());

        logger.info("序列化颜色: R=" + color.getRed() +
                ", G=" + color.getGreen() +
                ", B=" + color.getBlue() +
                ", A=" + color.getAlpha() +
                " -> " + hex);

        gen.writeString(hex);
    }
}
