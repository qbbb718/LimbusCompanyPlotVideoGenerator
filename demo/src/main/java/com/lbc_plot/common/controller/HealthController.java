package com.lbc_plot.common.controller;

import java.util.HashMap;
import java.util.Map;
import java.util.logging.Logger;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 健康检查控制器
 */
@RestController
@RequestMapping("/api")
public class HealthController {

    private static final Logger logger = Logger.getLogger(HealthController.class.getName());

    /** 与前端版本同源（见 application.yml 的 app.version），可用它核对前后端是否同一个版本。 */
    private final String appVersion;

    public HealthController(@Value("${app.version:unknown}") String appVersion) {
        this.appVersion = appVersion;
    }

    /**
     * 健康检查端点
     */
    @GetMapping("/health")
    public Map<String, Object> health() {
        logger.info("健康检查请求");
        Map<String, Object> response = new HashMap<>();
        response.put("status", "UP");
        response.put("version", appVersion);
        response.put("timestamp", System.currentTimeMillis());
        return response;
    }
}
