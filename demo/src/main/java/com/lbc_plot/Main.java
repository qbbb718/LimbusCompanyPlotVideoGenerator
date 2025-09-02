package com.lbc_plot;

import javax.imageio.ImageIO;

import com.lbc_plot.project.tool.HSLTextureColorizer;
import com.lbc_plot.project.tool.ImageExporter;
import com.lbc_plot.project.tool.ImageReader;

import java.awt.image.BufferedImage;
import java.io.File;
import java.net.URL;
import java.util.Objects;


public class Main {
    public static void main(String[] args) throws Exception {
        // 正式加载方式
        BufferedImage bg = ImageReader("");
        bg = HSLTextureColorizer.colorize(bg, 256, 42, 32);
        ImageExporter();
    }
}