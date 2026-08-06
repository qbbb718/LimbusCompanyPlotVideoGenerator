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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * 简易的 JDBC 持久化队列原型，支持多实例竞争消费（乐观更新）
 * 设计说明：
 * - 使用一张简单表存储 job JSON、status、attempts、first_attempt_ms、next_attempt_ms
 * - 定期轮询符合条件的待处理 job，尝试通过 UPDATE 尝试抢占（status='QUEUED' -> 'IN_PROGRESS')
 * - 失败时更新 attempts 与 next_attempt_ms，达到上限则标记为 FAILED
 */
@Component
public class JdbcPersistentAsyncRenderService implements AsyncRenderService {
    private static final Logger logger = LoggerFactory.getLogger(JdbcPersistentAsyncRenderService.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper = new ObjectMapper();
    private final AsyncQueueProperties qprops;
    private final AppProperties props;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> new Thread(r, "jdbc-async-processor"));

    public JdbcPersistentAsyncRenderService(JdbcTemplate jdbc, AsyncQueueProperties qprops, AppProperties props) {
        this.jdbc = jdbc;
        this.qprops = qprops;
        this.props = props;
    }

    @PostConstruct
    public void init() {
        try {
            jdbc.execute("CREATE TABLE IF NOT EXISTS render_jobs (id VARCHAR(64) PRIMARY KEY, payload CLOB, status VARCHAR(20), attempts INT, first_attempt_ms BIGINT, next_attempt_ms BIGINT, created_at BIGINT)");
        } catch (Exception e) {
            logger.warn("无法创建 render_jobs 表（可能已存在或 JDBC 驱动不支持该语句）", e);
        }
        scheduler.scheduleWithFixedDelay(this::pollOnce, 0, 1, TimeUnit.SECONDS);
    }

    @Override
    public java.util.concurrent.CompletableFuture<RenderResult> submitRenderTask(Record record, boolean plot, int width, int height, String videoPath, int frameRate) {
        String id = UUID.randomUUID().toString();
        RenderJob job = new RenderJob(id, record, plot, width, height, videoPath, frameRate);
        try {
            String json = mapper.writeValueAsString(job);
            long now = Instant.now().toEpochMilli();
            jdbc.update("INSERT INTO render_jobs(id,payload,status,attempts,first_attempt_ms,next_attempt_ms,created_at) VALUES (?,?,?,?,?,?,?)",
                    id, json, "QUEUED", 0, 0L, 0L, now);
        } catch (Exception e) {
            java.util.concurrent.CompletableFuture<RenderResult> failed = new java.util.concurrent.CompletableFuture<>();
            failed.completeExceptionally(e);
            return failed;
        }
        // simple future: we don't track completion to caller in this prototype
        java.util.concurrent.CompletableFuture<RenderResult> f = new java.util.concurrent.CompletableFuture<>();
        f.completeExceptionally(new UnsupportedOperationException("JdbcPersistentAsyncRenderService prototype does not return results to caller"));
        return f;
    }

    private void pollOnce() {
        try {
            long now = Instant.now().toEpochMilli();
            // 查找一个待处理的 job
            String sql = "SELECT id, payload, attempts, first_attempt_ms FROM render_jobs WHERE status='QUEUED' AND (next_attempt_ms IS NULL OR next_attempt_ms<=?) ORDER BY created_at LIMIT 1";
            jdbc.query(sql, new Object[]{now}, rs -> {
                if (rs.next()) {
                    String id = rs.getString("id");
                    // 尝试抢占
                    int updated = jdbc.update("UPDATE render_jobs SET status='IN_PROGRESS' WHERE id=? AND status='QUEUED'", id);
                    if (updated == 1) {
                        // 成功抢占，处理
                        processRow(id);
                    }
                }
            });
        } catch (Exception e) {
            logger.warn("pollOnce 异常", e);
        }
    }

    private void processRow(String id) {
        try {
            jdbc.query("SELECT payload, attempts, first_attempt_ms FROM render_jobs WHERE id=?", new Object[]{id}, (ResultSet rs) -> {
                if (!rs.next()) return;
                String payload = rs.getString("payload");
                int attempts = rs.getInt("attempts");
                long first = rs.getLong("first_attempt_ms");
                try {
                    RenderJob job = mapper.readValue(payload, RenderJob.class);
                    // 处理
                    RenderResult res = RenderOfVideo.exportRecordVideoStreaming(job.getRecord(), job.isPlot(), job.getWidth(), job.getHeight(), job.getVideoPath(), job.getFrameRate());
                    // 标记完成（或删除）
                    jdbc.update("UPDATE render_jobs SET status='COMPLETED' WHERE id=?", id);
                    logger.info("JDBC 持久化任务完成: {} (frames={})", id, res.getFrameCount());
                } catch (Exception e) {
                    // 失败处理：更新 attempts、计算 backoff
                    int attemptsNow = attempts + 1;
                    long now = Instant.now().toEpochMilli();
                    if (first == 0L) first = now;
                    double pow = Math.pow(qprops.getBackoffMultiplier(), Math.max(0, attemptsNow - 1));
                    long delay = (long) Math.min(qprops.getBackoffMaxMs(), Math.max(qprops.getBackoffInitialMs(), qprops.getBackoffInitialMs() * pow));
                    long next = now + delay;
                    long elapsed = now - first;
                    if (attemptsNow >= qprops.getMaxAttempts() || elapsed > qprops.getMaxTotalRetryMs()) {
                        jdbc.update("UPDATE render_jobs SET status='FAILED', attempts=? WHERE id=?", attemptsNow, id);
                        logger.info("JDBC 任务 {} 标记为 FAILED", id);
                    } else {
                        // 更新 attempts 和 next_attempt_ms，状态回到 QUEUED
                        jdbc.update("UPDATE render_jobs SET attempts=?, first_attempt_ms=?, next_attempt_ms=?, status='QUEUED' WHERE id=?",
                                attemptsNow, first, next, id);
                        logger.info("JDBC 任务 {} 重试 (attempt={} delay={}ms)", id, attemptsNow, delay);
                    }
                }
            });
        } catch (Exception e) {
            logger.warn("处理 JDBC 行出错: {}", id, e);
            try {
                jdbc.update("UPDATE render_jobs SET status='FAILED' WHERE id=?", id);
            } catch (Exception ex) {
                logger.warn("无法标记失败 job: {}", id, ex);
            }
        }
    }
}
