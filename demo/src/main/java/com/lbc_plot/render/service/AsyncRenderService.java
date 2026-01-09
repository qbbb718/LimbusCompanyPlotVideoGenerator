package com.lbc_plot.render.service;

import java.util.concurrent.CompletableFuture;

import com.lbc_plot.plot.model.Record;

/**
 * 异步渲染服务接口
 */
public interface AsyncRenderService {
    CompletableFuture<com.lbc_plot.render.engine.BatchVideoProcessor.RenderResult> submitRenderTask(
            Record record,
            boolean plot,
            int width,
            int height,
            String videoPath,
            int frameRate);
}
