package com.lbc_plot.common.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 全局异常处理器
 * 统一处理控制器层抛出的异常，返回结构化错误信息。
 */
@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * 处理文件上传大小超限异常
     * 此异常在请求到达 Controller 之前由 Spring 的 MultipartResolver 抛出，
     * 通常是因为 spring.servlet.multipart.max-file-size 设置过小。
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleMaxUploadSizeExceeded(
            MaxUploadSizeExceededException ex, WebRequest request) {

        long maxSize = ex.getMaxUploadSize();
        String maxSizeStr = formatFileSize(maxSize);

        logger.error("=== 文件上传大小超限 ===");
        logger.error("允许的最大文件大小: {} ({} bytes)", maxSizeStr, maxSize);
        logger.error("请求路径: {}", request.getDescription(false));
        logger.error("异常信息: {}", ex.getMessage());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now().toString());
        body.put("status", HttpStatus.PAYLOAD_TOO_LARGE.value());
        body.put("error", "文件大小超过限制");
        body.put("message", String.format(
                "上传文件大小超过服务器限制（最大 %s）。请压缩图片后重试，或联系管理员调整服务器配置。",
                maxSizeStr));
        body.put("maxUploadSize", maxSize);
        body.put("maxUploadSizeFormatted", maxSizeStr);

        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(body);
    }

    /**
     * 处理非法参数异常
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(
            IllegalArgumentException ex, WebRequest request) {

        logger.error("=== 参数校验失败 ===");
        logger.error("请求路径: {}", request.getDescription(false));
        logger.error("异常信息: {}", ex.getMessage());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now().toString());
        body.put("status", HttpStatus.BAD_REQUEST.value());
        body.put("error", "参数校验失败");
        body.put("message", ex.getMessage());

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    /**
     * 处理通用运行时异常
     */
    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, Object>> handleRuntimeException(
            RuntimeException ex, WebRequest request) {

        logger.error("=== 运行时异常 ===");
        logger.error("请求路径: {}", request.getDescription(false));
        logger.error("异常类型: {}", ex.getClass().getName());
        logger.error("异常信息: {}", ex.getMessage());
        logger.error("堆栈跟踪:", ex);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now().toString());
        body.put("status", HttpStatus.INTERNAL_SERVER_ERROR.value());
        body.put("error", "服务器内部错误");
        body.put("message", ex.getMessage() != null ? ex.getMessage() : "未知错误");
        body.put("exceptionType", ex.getClass().getSimpleName());

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    /**
     * 处理所有其他未捕获异常
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAllUncaughtException(
            Exception ex, WebRequest request) {

        logger.error("=== 未捕获异常 ===");
        logger.error("请求路径: {}", request.getDescription(false));
        logger.error("异常类型: {}", ex.getClass().getName());
        logger.error("异常信息: {}", ex.getMessage());
        logger.error("堆栈跟踪:", ex);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now().toString());
        body.put("status", HttpStatus.INTERNAL_SERVER_ERROR.value());
        body.put("error", "服务器内部错误");
        body.put("message", ex.getMessage() != null ? ex.getMessage() : "未知错误");
        body.put("exceptionType", ex.getClass().getSimpleName());

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    /**
     * 格式化文件大小为人类可读的字符串
     */
    private String formatFileSize(long bytes) {
        if (bytes < 0) return "未知";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024.0);
        if (bytes < 1024 * 1024 * 1024) return String.format("%.1f MB", bytes / (1024.0 * 1024));
        return String.format("%.2f GB", bytes / (1024.0 * 1024 * 1024));
    }
}
