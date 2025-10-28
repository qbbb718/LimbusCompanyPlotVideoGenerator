package com.lbc_plot.util.json;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;
import java.awt.Color;
import java.io.IOException;

public class ColorSerializer extends StdSerializer<Color> {
    public ColorSerializer() {
        super(Color.class);
    }

    @Override
    public void serialize(Color color, JsonGenerator gen, SerializerProvider provider) 
        throws IOException {
        // 格式：R,G,B 或 R,G,B,A（如果有透明度）
        String rgb = color.getRed() + "," + color.getGreen() + "," + color.getBlue();
        if (color.getAlpha() != 255) {
            rgb += "," + color.getAlpha();
        }
        gen.writeString(rgb);
    }
}