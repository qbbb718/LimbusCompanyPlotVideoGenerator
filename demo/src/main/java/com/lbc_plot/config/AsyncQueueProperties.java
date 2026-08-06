package com.lbc_plot.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 异步队列配置属性类
 *
 * 配置异步渲染任务队列的参数，包括：
 * - 队列文件存储目录
 * - 重试策略和退避算法
 * - 线程池配置
 * - 可见性超时设置
 *
 * 配置属性通过 application.yml 中的 async.queue.* 前缀进行绑定。
 *
 * @author 项目维护者
 * @since 1.0
 */
@Component
@ConfigurationProperties(prefix = "async.queue")
public class AsyncQueueProperties {

    /**
     * 队列基础目录
     * 相对于项目根目录的路径
     * 默认值为 "target"
     */
    private String baseDir = "target";

    /**
     * 队列子目录名
     * 存储待处理任务的目录
     * 默认值为 "async_render_jobs"
     */
    private String queueSubDir = "async_render_jobs";

    /**
     * 失败任务子目录名
     * 存储失败任务的目录
     * 默认值为 "async_render_jobs_failed"
     */
    private String failedSubDir = "async_render_jobs_failed";

    /**
     * 最大重试次数（已弃用，由 maxAttempts 替代）
     * 默认值为 2
     */
    private int maxRetries = 2;

    /**
     * 重试延迟时间（毫秒）
     * 默认值为 500ms
     */
    private long retryDelayMs = 500L;

    /**
     * 处理线程数量
     * 默认值为 1
     */
    private int threadCount = 1;

    /**
     * 退避算法初始延迟（毫秒）
     * 默认值为 500ms
     */
    private long backoffInitialMs = 500L;

    /**
     * 退避倍数
     * 默认值为 2.0
     */
    private double backoffMultiplier = 2.0;

    /**
     * 最大退避延迟（毫秒）
     * 默认值为 30秒
     */
    private long backoffMaxMs = 30_000L;

    /**
     * 最大总重试时长（毫秒）
     * 从首次尝试开始计算，超过此时间视为永久失败
     * 默认值为 5分钟
     */
    private long maxTotalRetryMs = 5 * 60 * 1000L; // 5 minutes

    /**
     * 最大尝试次数（包含首次尝试）
     * 默认值为 10
     */
    private int maxAttempts = 10;

    /**
     * 可见性超时（毫秒）
     * 处理节点取走任务后未确认的最长时长，超过后重入队列
     * 默认值为 1分钟
     */
    private long visibilityTimeoutMs = 60_000L; // 1 minute

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

    public long getVisibilityTimeoutMs() {
        return visibilityTimeoutMs;
    }

    public void setVisibilityTimeoutMs(long visibilityTimeoutMs) {
        this.visibilityTimeoutMs = visibilityTimeoutMs;
    }
}
