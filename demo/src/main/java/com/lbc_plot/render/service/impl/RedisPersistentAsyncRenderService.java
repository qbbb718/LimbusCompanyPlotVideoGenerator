package com.lbc_plot.render.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lbc_plot.config.AsyncQueueProperties;
import com.lbc_plot.config.AppProperties;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.engine.BatchVideoProcessor.RenderResult;
import com.lbc_plot.render.engine.RenderOfVideo;
import com.lbc_plot.render.service.AsyncRenderService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.*;

/**
 * Redis-backed prototype queue. 使用 Redis List 作为主队列，失败时通过调度器延迟重新入队。
 * 注意：这是一个原型，适用于 single-writer 或低并发场景；生产可考虑使用 Redis Streams 或 visibility-timeout 模式。
 */
@Component
@Profile("redis")
public class RedisPersistentAsyncRenderService implements AsyncRenderService, com.lbc_plot.render.service.AsyncRenderServiceAdmin {
    private static final Logger logger = LoggerFactory.getLogger(RedisPersistentAsyncRenderService.class);

    private final RedisTemplate<String, String> redisTemplate;
    private final AsyncQueueProperties qprops;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor(r -> new Thread(r, "redis-async-poller"));
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2, r -> new Thread(r, "redis-async-scheduler"));

    private final ConcurrentMap<String, CompletableFuture<RenderResult>> futures = new ConcurrentHashMap<>();

    // Keys and helper
    private final String mainKey = "async_render_queue";
    private final String processingKey = mainKey + ":processing";
    private final String failedKey = mainKey + ":failed";
    private final String processingMeta = mainKey + ":processing_meta"; // hash jobId -> timestamp
    private final String jobStoreKey = mainKey + ":store"; // hash jobId -> jobJson

    private final io.micrometer.core.instrument.MeterRegistry meterRegistry;
    private io.micrometer.core.instrument.Counter processedCounter;
    private io.micrometer.core.instrument.Counter failedCounter;
    private io.micrometer.core.instrument.Counter attemptsCounter;

    public RedisPersistentAsyncRenderService(RedisTemplate<String, String> redisTemplate, AsyncQueueProperties qprops, AppProperties props, @org.springframework.beans.factory.annotation.Autowired(required = false) io.micrometer.core.instrument.MeterRegistry meterRegistry) {
        this.redisTemplate = redisTemplate;
        this.qprops = qprops;
        this.meterRegistry = meterRegistry;
        if (this.meterRegistry != null) {
            this.processedCounter = this.meterRegistry.counter("async_queue_processed_total");
            this.failedCounter = this.meterRegistry.counter("async_queue_failed_total");
            this.attemptsCounter = this.meterRegistry.counter("async_queue_total_attempts");
            io.micrometer.core.instrument.Gauge.builder("async_queue_in_progress", this, s -> s.getInProgressCount()).register(this.meterRegistry);
            io.micrometer.core.instrument.Gauge.builder("async_queue_queued", this, s -> s.getQueuedCount()).register(this.meterRegistry);
        }
    }

    @PostConstruct
    public void init() {
        poller.submit(this::runLoop);
        // Reaper: 检查 processing_meta 中超时的 job 并重入队列
        scheduler.scheduleAtFixedRate(() -> {
            try {
                java.util.Map<Object, Object> map = redisTemplate.opsForHash().entries(processingMeta);
                long now = System.currentTimeMillis();
                for (java.util.Map.Entry<Object, Object> e : map.entrySet()) {
                    String id = String.valueOf(e.getKey());
                    long ts = Long.parseLong(String.valueOf(e.getValue()));
                    if (now - ts > qprops.getVisibilityTimeoutMs()) {
                        // 尝试将 job 恢复到队列
                        Object j = redisTemplate.opsForHash().get(jobStoreKey, id);
                        if (j != null) {
                            String json = String.valueOf(j);
                            redisTemplate.opsForList().leftPush(mainKey, json);
                            redisTemplate.opsForHash().delete(processingMeta, id);
                            redisTemplate.opsForList().remove(processingKey, 1, json);
                            logger.info("Redis 任务 {} 超过可见性超时，已重入队列", id);
                        }
                    }
                }
            } catch (Exception ex) {
                logger.warn("Redis reaper 异常", ex);
            }
        }, qprops.getVisibilityTimeoutMs(), qprops.getVisibilityTimeoutMs(), java.util.concurrent.TimeUnit.MILLISECONDS);
    }

    @Override
    public CompletableFuture<RenderResult> submitRenderTask(Record record, boolean plot, int width, int height, String videoPath, int frameRate) {
        String id = UUID.randomUUID().toString();
        RenderJob job = new RenderJob(id, record, plot, width, height, videoPath, frameRate);
        try {
            String json = mapper.writeValueAsString(job);
            redisTemplate.opsForList().leftPush(mainKey, json);
            // store for lookup and requeue
            redisTemplate.opsForHash().put(jobStoreKey, job.getId(), json);
        } catch (Exception e) {
            CompletableFuture<RenderResult> failed = new CompletableFuture<>();
            failed.completeExceptionally(e);
            return failed;
        }
        CompletableFuture<RenderResult> future = new CompletableFuture<>();
        futures.put(id, future);
        return future;
    }

    private void runLoop() {
        String key = "async_render_queue";
        while (!Thread.currentThread().isInterrupted()) {
            try {
                // 阻塞弹出（超时 2 秒）
                String json = redisTemplate.opsForList().rightPop(key, 2, TimeUnit.SECONDS);
                if (json == null) continue;
                // 移到 processing 列表并记录可见性元数据
                redisTemplate.opsForList().leftPush(processingKey, json);
                RenderJob job = mapper.readValue(json, RenderJob.class);
                String id = job.getId();
                redisTemplate.opsForHash().put(processingMeta, id, String.valueOf(System.currentTimeMillis()));

                try {
                    RenderResult res = RenderOfVideo.exportRecordVideoStreaming(job.getRecord(), job.isPlot(), job.getWidth(), job.getHeight(), job.getVideoPath(), job.getFrameRate());
                    CompletableFuture<RenderResult> f = futures.remove(id);
                    if (f != null) f.complete(res);
                    // 成功后从 processing 列表移除，并清理元数据与存储
                    redisTemplate.opsForList().remove(processingKey, 1, json);
                    redisTemplate.opsForHash().delete(processingMeta, id);
                    redisTemplate.opsForHash().delete(jobStoreKey, id);
                    if (processedCounter != null) processedCounter.increment();
                    logger.info("Redis 持久化任务完成: {} (frames={})", id, res.getFrameCount());
                } catch (Exception e) {
                    logger.warn("处理 Redis 任务失败: {}，将重试", id, e);
                    int attemptsNow = job.getAttempts() + 1;
                    job.setAttempts(attemptsNow);
                    long now = System.currentTimeMillis();
                    if (job.getFirstAttemptTimeMs() == 0L) job.setFirstAttemptTimeMs(now);
                    double pow = Math.pow(qprops.getBackoffMultiplier(), Math.max(0, attemptsNow - 1));
                    long delay = Math.min(qprops.getBackoffMaxMs(), Math.max(qprops.getBackoffInitialMs(), (long)(qprops.getBackoffInitialMs() * pow)));
                    long elapsed = now - job.getFirstAttemptTimeMs();
                    if (attemptsNow >= qprops.getMaxAttempts() || elapsed > qprops.getMaxTotalRetryMs()) {
                        logger.info("Redis 任务 {} 达到重试上限，标记失败", id);
                        CompletableFuture<RenderResult> f = futures.remove(id);
                        if (f != null) f.completeExceptionally(e);
                        // 保存失败信息以供查询
                        try {
                            String failedJson = mapper.writeValueAsString(job);
                            redisTemplate.opsForList().leftPush(failedKey, failedJson);
                            redisTemplate.opsForHash().put(failedKey + ":meta", id, e.toString());
                            redisTemplate.opsForHash().delete(jobStoreKey, id);
                            if (failedCounter != null) failedCounter.increment();
                        } catch (Exception ex) {
                            logger.warn("保存失败任务失败: {}", id, ex);
                        }
                    } else {
                        // 延迟重新入队（非阻塞）
                        String newJson = mapper.writeValueAsString(job);
                        scheduler.schedule(() -> {
                            try {
                                redisTemplate.opsForList().leftPush(key, newJson);
                            } catch (Exception ex) {
                                logger.warn("重新入队失败: {}", id, ex);
                            }
                        }, delay, TimeUnit.MILLISECONDS);
                        if (attemptsCounter != null) attemptsCounter.increment();
                        logger.info("Redis 任务 {} 计划在 {} ms 后重试", id, delay);
                    }
                    // 清理 processing 元数据（项仍在 processing 列表直到 reaper 或被 remove）
                    redisTemplate.opsForHash().delete(processingMeta, id);
                    redisTemplate.opsForList().remove(processingKey, 1, json);
                }
            } catch (Exception e) {
                logger.warn("Redis 队列轮询异常", e);
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }    }

    // ---- Admin impl ----
    @Override
    public long getQueuedCount() {
        Long s = redisTemplate.opsForList().size(mainKey);
        return s == null ? 0L : s;
    }

    @Override
    public long getInProgressCount() {
        Long s = redisTemplate.opsForList().size(processingKey);
        return s == null ? 0L : s;
    }

    @Override
    public long getProcessedCount() {
        // Not tracked centrally; return 0 as placeholder (or you can enable metrics)
        return 0L;
    }

    @Override
    public long getFailedCount() {
        Long s = redisTemplate.opsForList().size(failedKey);
        return s == null ? 0L : s;
    }

    @Override
    public long getTotalAttempts() {
        // Not persisted centrally; return 0 as placeholder
        return 0L;
    }

    @Override
    public java.util.Map<String, Integer> getFailCountsSnapshot() {
        // Redis prototype uses failed list and meta; this is a best-effort snapshot
        java.util.Map<String, Integer> out = new java.util.HashMap<>();
        java.util.List<String> list = redisTemplate.opsForList().range(failedKey, 0, 100);
        if (list != null) {
            for (String json : list) {
                try {
                    RenderJob job = mapper.readValue(json, RenderJob.class);
                    out.put(job.getId(), job.getAttempts());
                } catch (Exception ex) {
                    // ignore
                }
            }
        }
        return out;
    }

    @Override
    public RenderJob getJob(String id) {
        try {
            Object j = redisTemplate.opsForHash().get(jobStoreKey, id);
            if (j != null) return mapper.readValue(String.valueOf(j), RenderJob.class);
            java.util.List<String> f = redisTemplate.opsForList().range(failedKey, 0, -1);
            if (f != null) {
                for (String json : f) {
                    RenderJob job = mapper.readValue(json, RenderJob.class);
                    if (id.equals(job.getId())) return job;
                }
            }
        } catch (Exception ex) {
            // ignore
        }
        return null;
    }

    @Override
    public java.util.Collection<RenderJob> listFailedJobs(int limit) {
        java.util.List<RenderJob> out = new java.util.ArrayList<>();
        java.util.List<String> list = redisTemplate.opsForList().range(failedKey, 0, Math.max(0, limit - 1));
        if (list != null) {
            for (String json : list) {
                try {
                    out.add(mapper.readValue(json, RenderJob.class));
                } catch (Exception ex) {
                    // ignore
                }
            }
        }
        return out;
    }

    @Override
    public java.util.Collection<RenderJob> listQueuedJobs(int limit) {
        java.util.List<RenderJob> out = new java.util.ArrayList<>();
        java.util.List<String> list = redisTemplate.opsForList().range(mainKey, 0, Math.max(0, limit - 1));
        if (list != null) {
            for (String json : list) {
                try {
                    out.add(mapper.readValue(json, RenderJob.class));
                } catch (Exception ex) {
                    // ignore
                }
            }
        }
        return out;
    }
}
