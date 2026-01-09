package com.lbc_plot.render.service;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import com.lbc_plot.config.AppProperties;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.engine.BatchVideoProcessor.RenderResult;
import com.lbc_plot.render.service.impl.PersistentFileAsyncRenderService;

public class PersistentAsyncRenderServiceTest {

    private Path base = Path.of("target/test-async");

    @AfterEach
    public void cleanup() throws Exception {
        if (Files.exists(base)) {
            Files.walk(base).map(Path::toFile).forEach(f -> f.delete());
            Files.deleteIfExists(base);
        }
    }

    @Test
    public void submitAndProcess_shortRecord() throws Exception {
        AppProperties props = new AppProperties();
        props.setStorageLocation(base.toString());
        com.lbc_plot.config.AsyncQueueProperties qprops = new com.lbc_plot.config.AsyncQueueProperties();
        qprops.setBaseDir(base.toString());
        qprops.setQueueSubDir("async_render_jobs");
        qprops.setFailedSubDir("async_render_jobs_failed");
        qprops.setMaxRetries(2);
        qprops.setRetryDelayMs(200L);
        qprops.setThreadCount(1);
        PersistentFileAsyncRenderService svc = new PersistentFileAsyncRenderService(props, qprops);
        // create a minimal Record using Builder
        com.lbc_plot.plot.model.Dialogue dlg = new com.lbc_plot.plot.model.Dialogue.Builder()
            .text("Hello")
            .speakerName("旁白")
            .build();
        Record r = new Record.Builder().uuid("test-record").dialogue(dlg).build();

        var future = svc.submitRenderTask(r, true, 320, 180, base.resolve("out.mp4").toString(), 15);
        RenderResult res = future.get(60, java.util.concurrent.TimeUnit.SECONDS);
        assertNotNull(res);
        assertTrue(res.getFrameCount() > 0);
        // ensure job dir cleaned
        assertTrue(Files.exists(base));
    }
}
