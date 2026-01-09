package com.lbc_plot.render.service.impl;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Map;
import java.util.HashMap;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.annotation.PostConstruct;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Service;
import com.lbc_plot.config.AsyncQueueProperties;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lbc_plot.config.AppProperties;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.engine.BatchVideoProcessor.RenderResult;
import com.lbc_plot.render.engine.RenderOfVideo;
import com.lbc_plot.render.service.AsyncRenderService;

@Service
public class PersistentFileAsyncRenderService implements AsyncRenderService {
    private static final Logger logger = LoggerFactory.getLogger(PersistentFileAsyncRenderService.class);

    private final Path queueDir;
    private final Path failedDir;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ScheduledExecutorService executor;
    private final Map<String, CompletableFuture<RenderResult>> futures = new ConcurrentHashMap<>();
    // 简单失败计数与重试策略
    private final Map<String, Integer> failCounts = new ConcurrentHashMap<>();
    private int maxRetries = 2;
    private long retryDelayMs = 500L;
    // backoff & retry window
    private long backoffInitialMs = 500L;
    private double backoffMultiplier = 2.0;
    private long backoffMaxMs = 30_000L;
    private long maxTotalRetryMs = 5 * 60 * 1000L;
    private int maxAttempts = 10;

    private final AtomicLong processedCount = new AtomicLong(0);
    private final AtomicLong failedCount = new AtomicLong(0);
    private final AtomicLong totalAttempts = new AtomicLong(0);

    // Micrometer metrics
    private final MeterRegistry meterRegistry;
    private Counter processedCounter;
    private Counter failedCounter;
    private Counter attemptsCounter;

    @Autowired
    public PersistentFileAsyncRenderService(AppProperties props, AsyncQueueProperties qprops, @Autowired(required = false) MeterRegistry meterRegistry) {
        String base = qprops != null && qprops.getBaseDir() != null ? qprops.getBaseDir()
                : (props != null && props.getStorageLocation() != null ? props.getStorageLocation() : "target");
        this.queueDir = Path.of(base).resolve(qprops.getQueueSubDir());
        this.failedDir = Path.of(base).resolve(qprops.getFailedSubDir());
        this.maxRetries = qprops.getMaxRetries();
        this.executor = Executors.newScheduledThreadPool(Math.max(1, qprops.getThreadCount()), r -> new Thread(r, "persistent-render-processor"));
        this.retryDelayMs = qprops.getRetryDelayMs();
        this.backoffInitialMs = qprops.getBackoffInitialMs();
        this.backoffMultiplier = qprops.getBackoffMultiplier();
        this.backoffMaxMs = qprops.getBackoffMaxMs();
        this.maxTotalRetryMs = qprops.getMaxTotalRetryMs();
        this.maxAttempts = qprops.getMaxAttempts();
        this.meterRegistry = meterRegistry;
        if (this.meterRegistry != null) {
            this.processedCounter = this.meterRegistry.counter("async_queue_processed_total");
            this.failedCounter = this.meterRegistry.counter("async_queue_failed_total");
            this.attemptsCounter = this.meterRegistry.counter("async_queue_total_attempts");
            Gauge.builder("async_queue_in_progress", this, s -> s.getInProgressCount()).register(this.meterRegistry);
            Gauge.builder("async_queue_queued", this, s -> s.getQueuedCount()).register(this.meterRegistry);
        }
        try {
            Files.createDirectories(queueDir);
            Files.createDirectories(failedDir);
        } catch (IOException e) {
            throw new RuntimeException("无法创建队列目录", e);
        }
    }

    // 保留兼容旧构造器，测试或手动实例化时使用
    public PersistentFileAsyncRenderService(AppProperties props, AsyncQueueProperties qprops) {
        this(props, qprops, null);
    }

    @PostConstruct
    public void startup() {
        // 在启动时扫描未处理的 job 文件并调度处理
        executor.submit(() -> {
            try {
                Files.list(queueDir).filter(p -> p.toString().endsWith(".json")).forEach(p -> scheduleProcessJobFile(p, 0L));
            } catch (IOException e) {
                logger.warn("扫描队列目录失败", e);
            }
        });
    }

    @Override
    public CompletableFuture<RenderResult> submitRenderTask(Record record, boolean plot, int width, int height,
            String videoPath, int frameRate) {
        String id = UUID.randomUUID().toString();
        RenderJob job = new RenderJob(id, record, plot, width, height, videoPath, frameRate);
        Path jobFile = queueDir.resolve(id + ".json");
        try {
            String json = mapper.writeValueAsString(job);
            Files.writeString(jobFile, json, StandardOpenOption.CREATE_NEW);
        } catch (IOException e) {
            CompletableFuture<RenderResult> failed = new CompletableFuture<>();
            failed.completeExceptionally(e);
            return failed;
        }

        CompletableFuture<RenderResult> future = new CompletableFuture<>();
        futures.put(id, future);
        // 写入文件后立即调度处理
        scheduleProcessJobFile(jobFile, 0L);
        return future;
    }

    // 辅助监控方法
    public Path getQueueDir() {
        return queueDir;
    }

    public Path getFailedDir() {
        return failedDir;
    }

    public int getInProgressCount() {
        return futures.size();
    }

    public Map<String, Integer> getFailCountsSnapshot() {
        return new HashMap<>(failCounts);
    }

    public long getProcessedCount() {
        return processedCount.get();
    }

    public long getFailedCount() {
        return failedCount.get();
    }

    public long getTotalAttempts() {
        return totalAttempts.get();
    }

    public long getQueuedCount() {
        try {
            return Files.exists(queueDir) ? Files.list(queueDir).filter(p -> p.toString().endsWith(".json")).count() : 0L;
        } catch (IOException e) {
            return 0L;
        }
    }

    public String getMetricsPrometheus() {
        StringBuilder sb = new StringBuilder();
        sb.append("# HELP async_queue_processed_total number of processed jobs\n");
        sb.append("# TYPE async_queue_processed_total counter\n");
        sb.append("async_queue_processed_total " + getProcessedCount() + "\n");
        sb.append("# HELP async_queue_failed_total number of permanently failed jobs\n");
        sb.append("# TYPE async_queue_failed_total counter\n");
        sb.append("async_queue_failed_total " + getFailedCount() + "\n");
        sb.append("# HELP async_queue_in_progress current in-progress jobs\n");
        sb.append("# TYPE async_queue_in_progress gauge\n");
        sb.append("async_queue_in_progress " + getInProgressCount() + "\n");
        sb.append("# HELP async_queue_queued current queued jobs (files)\n");
        sb.append("# TYPE async_queue_queued gauge\n");
        sb.append("async_queue_queued " + getQueuedCount() + "\n");
        sb.append("# HELP async_queue_total_attempts total attempt count\n");
        sb.append("# TYPE async_queue_total_attempts counter\n");
        sb.append("async_queue_total_attempts " + getTotalAttempts() + "\n");
        return sb.toString();
    }

    private void scheduleProcessJobFile(Path jobFile, long delayMs) {
        if (delayMs <= 0) {
            executor.submit(() -> processJobFile(jobFile));
        } else {
            executor.schedule(() -> processJobFile(jobFile), delayMs, TimeUnit.MILLISECONDS);
        }
    }

    private void processJobFile(Path jobFile) {
        String fileName = jobFile.getFileName().toString();
        String id = fileName.replaceAll("\\.json$", "");
        try {
            String content = Files.readString(jobFile);
            RenderJob job = mapper.readValue(content, RenderJob.class);
            long now = System.currentTimeMillis();
            // 如果设置了下一次尝试时间并且尚未到达，则重新调度
            if (job.getNextAttemptTimeMs() > 0 && job.getNextAttemptTimeMs() > now) {
                long delay = job.getNextAttemptTimeMs() - now;
                logger.debug("任务 {} 尚未到达下次尝试时间，延迟 {} ms 再次调度", id, delay);
                scheduleProcessJobFile(jobFile, delay);
                return;
            }
            logger.info("开始处理持久化渲染任务: {}", id);
            long start = System.currentTimeMillis();
            // 直接调用底层导出工具（与 InMemory 实现一致）
            RenderResult res = RenderOfVideo.exportRecordVideoStreaming(job.getRecord(), job.isPlot(), job.getWidth(), job.getHeight(), job.getVideoPath(), job.getFrameRate());
            long dur = System.currentTimeMillis() - start;
            RenderResult finalRes = new RenderResult(res.getFrameCount(), res.getStartTimeMs(), dur);
            CompletableFuture<RenderResult> f = futures.remove(id);
            if (f != null) {
                f.complete(finalRes);
            }
            Files.deleteIfExists(jobFile);
            failCounts.remove(id);
            processedCount.incrementAndGet();
            if (processedCounter != null) processedCounter.increment();
            logger.info("持久化渲染任务完成: {} (frames={}, dur={}ms)", id, finalRes.getFrameCount(), dur);
        } catch (Exception e) {
            logger.error("处理渲染任务失败: {}", id, e);
            int cnt = failCounts.getOrDefault(id, 0) + 1;
            failCounts.put(id, cnt);
            // 读取 job，更新尝试计数与 nextAttemptTime
            try {
                String content = Files.readString(jobFile);
                RenderJob job = mapper.readValue(content, RenderJob.class);
                int attemptsNow = job.getAttempts() + 1;
                job.setAttempts(attemptsNow);
                totalAttempts.incrementAndGet();
                if (attemptsCounter != null) attemptsCounter.increment();
                long now = System.currentTimeMillis();
                if (job.getFirstAttemptTimeMs() == 0L) {
                    job.setFirstAttemptTimeMs(now);
                }
                long elapsedSinceFirst = now - job.getFirstAttemptTimeMs();
                // 计算指数退避
                double pow = Math.pow(backoffMultiplier, Math.max(0, attemptsNow - 1));
                long delay = (long) Math.min(backoffMaxMs, Math.max(backoffInitialMs, backoffInitialMs * pow));
                job.setNextAttemptTimeMs(now + delay);
                // 持久化 job 元数据
                try {
                    String newJson = mapper.writeValueAsString(job);
                    Files.writeString(jobFile, newJson, StandardOpenOption.TRUNCATE_EXISTING);
                } catch (IOException ex) {
                    logger.warn("无法更新 job 文件元数据: {}", jobFile, ex);
                }

                // 检查是否超过重试限制
                if (attemptsNow >= maxAttempts || elapsedSinceFirst > maxTotalRetryMs) {
                    logger.info("任务 {} 达到最大尝试/超出最大重试时长，移动到失败目录 (attempt={}, elapsedMs={})", id, attemptsNow, elapsedSinceFirst);
                    try {
                        Files.move(jobFile, failedDir.resolve(jobFile.getFileName()));
                    } catch (IOException ex) {
                        logger.warn("移动失败文件失败: {}", jobFile, ex);
                    }
                    failedCount.incrementAndGet();
                    if (failedCounter != null) failedCounter.increment();
                    CompletableFuture<RenderResult> f = futures.remove(id);
                    if (f != null) f.completeExceptionally(e);
                    return;
                }

                logger.info("任务 {} 将重试 (attempt {}), 延迟 {} ms", id, attemptsNow, delay);
                // 延迟调度
                scheduleProcessJobFile(jobFile, delay);
                return;
            } catch (IOException ioe) {
                logger.warn("无法读取或更新失败的 job 文件: {}", jobFile, ioe);
            }

            try {
                // 兜底：移动到 failed 目录以便人工检查
                Files.move(jobFile, failedDir.resolve(jobFile.getFileName()));
            } catch (IOException ex) {
                logger.warn("移动失败文件失败: {}", jobFile, ex);
            }
            CompletableFuture<RenderResult> f = futures.remove(id);
            if (f != null) f.completeExceptionally(e);
        }
    }
}
