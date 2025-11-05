package com.lbc_plot.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.config.AppConfig;
import com.lbc_plot.core.Composer.FrameComposerService;

/**
 * REST控制器
 */
@RestController
@RequestMapping("/api")
public class PlotVideoController {

    @Autowired
    private FrameComposerService frameComposerService;

    /**
     * 健康检查接口
     */
    @GetMapping("/plot-video/health")
    public String health() {
        return "LimbusCompany Plot Video Generator is running!";
    }

    /**
     * 初始化音频系统
     */
    @GetMapping("/plot-video/init-audio")
    public String initAudio() {
        try {
            AppConfig.initializeAudioSystem();
            return "音频系统初始化成功";
        } catch (Exception e) {
            return "音频系统初始化失败: " + e.getMessage();
        }
    }
}