package com.lbc_plot.config;

import org.junit.jupiter.api.Test;
import java.awt.Color;

import static org.junit.jupiter.api.Assertions.*;

public class ProjectConfigColorParsingTest {

    @Test
    public void parseSixDigitHex() {
        ProjectConfig cfg = new ProjectConfig();
        cfg.setDefaultTextColor("#FBDBB3");
        Color c = cfg.getDefaultTextColor();
        assertEquals(0xFB, c.getRed());
        assertEquals(0xDB, c.getGreen());
        assertEquals(0xB3, c.getBlue());
    }

    @Test
    public void parseShortHex() {
        ProjectConfig cfg = new ProjectConfig();
        cfg.setDefaultTextColor("FDB");
        Color c = cfg.getDefaultTextColor();
        assertEquals(0xFF, c.getRed());
        assertEquals(0xDD, c.getGreen());
        assertEquals(0xBB, c.getBlue());
    }

    @Test
    public void parseEightDigitHexWithAlpha() {
        ProjectConfig cfg = new ProjectConfig();
        cfg.setDefaultTextColor("FFFBDBB3");
        Color c = cfg.getDefaultTextColor();
        assertEquals(0xFB, c.getRed());
        assertEquals(0xDB, c.getGreen());
        assertEquals(0xB3, c.getBlue());
        // alpha expected 0xFF -> 255
        assertEquals(255, c.getAlpha());
    }
}
