package com.lbc_plot;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.net.URL;
import java.util.Objects;

public class Main {
    public static void main(String[] args) throws Exception {
        // 正式加载方式
        BufferedImage bg = ImageIO.read(
            Objects.requireNonNull(
                Main.class.getResource("/assets/backgrounds/test_bg.png")
            )
        );
        System.out.println("图片加载成功，尺寸: " + bg.getWidth() + "x" + bg.getHeight());
    }
}