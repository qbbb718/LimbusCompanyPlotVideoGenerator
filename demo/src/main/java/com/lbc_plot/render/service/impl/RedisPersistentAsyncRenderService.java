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
public class RedisPersistentAsyncRenderService implements AsyncRenderService {
    private static final Logger logger = LoggerFactory.getLogger(RedisPersistentAsyncRenderService.class);

    private final RedisTemplate<String, String> redisTemplate;
    private final AsyncQueueProperties qprops;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor(r -> new Thread(r, "redis-async-poller"));
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2, r -> new Thread(r, "redis-async-scheduler"));

    private final ConcurrentMap<String, CompletableFuture<RenderResult>> futures = new ConcurrentHashMap<>();

    public RedisPersistentAsyncRenderService(RedisTemplate<String, String> redisTemplate, AsyncQueueProperties qprops, AppProperties props) {
        this.redisTemplate = redisTemplate;
        this.qprops = qprops;
    }

    @PostConstruct
    public void init() {
        poller.submit(this::runLoop);
    }

    @Override
    public CompletableFuture<RenderResult> submitRenderTask(Record record, boolean plot, int width, int height, String videoPath, int frameRate) {
        String id = UUID.randomUUID().toString();
        RenderJob job = new RenderJob(id, record, plot, width, height, videoPath, frameRate);
        try {
            String json = mapper.writeValueAsString(job);
            String key = "async_render_queue";
            redisTemplate.opsForList().leftPush(key, json);
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
                RenderJob job = mapper.readValue(json, RenderJob.class);
                String id = job.getId();
                try {
                    RenderResult res = RenderOfVideo.exportRecordVideoStreaming(job.getRecord(), job.isPlot(), job.getWidth(), job.getHeight(), job.getVideoPath(), job.getFrameRate());
                    CompletableFuture<RenderResult> f = futures.remove(id);
                    if (f != null) f.complete(res);
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
                        // 生产者可另行查询失败集合；此原型不做额外保存
                    } else {
                        // 延迟重新入队
                        String newJson = mapper.writeValueAsString(job);
                        scheduler.schedule(() -> {
                            try {
                                redisTemplate.opsForList().leftPush(key, newJson);
                            } catch (Exception ex) {
                                logger.warn("重新入队失败: {}", id, ex);
                            }
                        }, delay, TimeUnit.MILLISECONDS);
                        logger.info("Redis 任务 {} 计划在 {} ms 后重试", id, delay);
                    }
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
        }
    }
}
