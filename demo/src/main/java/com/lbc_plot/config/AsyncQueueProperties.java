package com.lbc_plot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "async.queue")
public class AsyncQueueProperties {
    private String baseDir = "target";
    private String queueSubDir = "async_render_jobs";
    private String failedSubDir = "async_render_jobs_failed";
    private int maxRetries = 2;
    private long retryDelayMs = 500L;
    private int threadCount = 1;
    // Exponential backoff / retry window
    private long backoffInitialMs = 500L;
    private double backoffMultiplier = 2.0;
    private long backoffMaxMs = 30_000L;
    // 最大从首次尝试起的重试总时长（ms），超过则视为永久失败
    private long maxTotalRetryMs = 5 * 60 * 1000L; // 5 minutes
    // 最大尝试次数（包含首次尝试）
    private int maxAttempts = 10;

    public String getBaseDir() {
        return baseDir;
    }

    public void setBaseDir(String baseDir) {
        this.baseDir = baseDir;
    }

    public String getQueueSubDir() {
        return queueSubDir;
    }

    public void setQueueSubDir(String queueSubDir) {
        this.queueSubDir = queueSubDir;
    }

    public String getFailedSubDir() {
        return failedSubDir;
    }

    public void setFailedSubDir(String failedSubDir) {
        this.failedSubDir = failedSubDir;
    }

    public int getMaxRetries() {
        return maxRetries;
    }

    public void setMaxRetries(int maxRetries) {
        this.maxRetries = maxRetries;
    }

    public long getRetryDelayMs() {
        return retryDelayMs;
    }

    public void setRetryDelayMs(long retryDelayMs) {
        this.retryDelayMs = retryDelayMs;
    }

    public int getThreadCount() {
        return threadCount;
    }

    public void setThreadCount(int threadCount) {
        this.threadCount = threadCount;
    }

    public long getBackoffInitialMs() {
        return backoffInitialMs;
    }

    public void setBackoffInitialMs(long backoffInitialMs) {
        this.backoffInitialMs = backoffInitialMs;
    }

    public double getBackoffMultiplier() {
        return backoffMultiplier;
    }

    public void setBackoffMultiplier(double backoffMultiplier) {
        this.backoffMultiplier = backoffMultiplier;
    }

    public long getBackoffMaxMs() {
        return backoffMaxMs;
    }

    public void setBackoffMaxMs(long backoffMaxMs) {
        this.backoffMaxMs = backoffMaxMs;
    }

    public long getMaxTotalRetryMs() {
        return maxTotalRetryMs;
    }

    public void setMaxTotalRetryMs(long maxTotalRetryMs) {
        this.maxTotalRetryMs = maxTotalRetryMs;
    }

    public int getMaxAttempts() {
        return maxAttempts;
    }

    public void setMaxAttempts(int maxAttempts) {
        this.maxAttempts = maxAttempts;
    }
}
