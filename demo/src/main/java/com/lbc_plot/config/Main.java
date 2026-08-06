package com.lbc_plot.config;

import javax.imageio.ImageIO;

import org.slf4j.Logger;

import com.lbc_plot.common.util.io.ImageExporter;
import com.lbc_plot.common.util.io.ImageReader;
import com.lbc_plot.render.engine.FrameComposerService;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.File;
import java.net.URL;
import java.util.Objects;

public class Main {
    /**
     * 主应用程序
     */
    public class MainApplication {

        public static void main(String[] args) {
            try {
                // 初始化音频系统
                AudioAppConfig.initializeAudioSystem();

                // 启动GUI或处理逻辑
                startApplication();

            } catch (Exception e) {
            }
        }

        private static void startApplication() {
            // 你的应用程序逻辑
        }
    }
}