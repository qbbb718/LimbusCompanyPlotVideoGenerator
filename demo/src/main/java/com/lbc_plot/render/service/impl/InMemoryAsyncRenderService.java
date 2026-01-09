package com.lbc_plot.render.service.impl;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.lbc_plot.config.AppProperties;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.service.AsyncRenderService;
import com.lbc_plot.render.engine.BatchVideoProcessor.RenderResult;
import com.lbc_plot.render.engine.RenderOfVideo;

@Service
public class InMemoryAsyncRenderService implements AsyncRenderService {

    private final ExecutorService executor;

    @Autowired
    public InMemoryAsyncRenderService(AppProperties props) {
        int threads = Math.max(1, props != null ? props.getRenderThreads() : 4);
        this.executor = Executors.newFixedThreadPool(threads);
    }

    @Override
    public CompletableFuture<RenderResult> submitRenderTask(Record record, boolean plot, int width, int height,
            String videoPath, int frameRate) {
        return CompletableFuture.supplyAsync(() -> {
            long start = System.currentTimeMillis();
            try {
                RenderResult res = RenderOfVideo.exportRecordVideoStreaming(record, plot, width, height, videoPath,
                        frameRate);
                long dur = System.currentTimeMillis() - start;
                return new RenderResult(res.getFrameCount(), res.getStartTimeMs(), dur);
            } catch (RuntimeException | Error e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }, executor);
    }
}
