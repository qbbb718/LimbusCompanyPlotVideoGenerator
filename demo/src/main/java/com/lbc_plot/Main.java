package com.lbc_plot;

import javax.imageio.ImageIO;


import com.lbc_plot.project.tool.ImageExporter;
import com.lbc_plot.project.tool.ImageReader;
import com.lbc_plot.project.tool.TextureColorizer;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.File;
import java.net.URL;
import java.util.Objects;


public class Main {
    public static void main(String[] args) throws Exception {
        // 正式加载方式
        BufferedImage bg = ImageReader.readResourceImage("assets/ui/speaker-name.png");
        BufferedImage bg1 = bg;
        bg1 = TextureColorizer.colorizeToRGB (bg, new Color(0x4e3076));
        ImageExporter.exportImage(bg1, "demo/src/main/resources/assets/ui/image3.png");
    }
}