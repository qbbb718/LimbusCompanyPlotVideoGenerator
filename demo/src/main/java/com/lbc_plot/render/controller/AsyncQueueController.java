package com.lbc_plot.render.controller;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lbc_plot.render.service.impl.PersistentFileAsyncRenderService;

@RestController
@RequestMapping("/admin/async-jobs")
public class AsyncQueueController {

    private final PersistentFileAsyncRenderService svc;

    @Autowired
    public AsyncQueueController(PersistentFileAsyncRenderService svc) {
        this.svc = svc;
    }

    @GetMapping("/status")
    public ResponseEntity<?> status() throws IOException {
        Map<String, Object> out = new HashMap<>();
        out.put("queued", svc.getQueuedCount());
        out.put("failedFiles", Files.exists(svc.getFailedDir()) ? Files.list(svc.getFailedDir()).count() : 0);
        out.put("inProgress", svc.getInProgressCount());
        out.put("processedTotal", svc.getProcessedCount());
        out.put("failedTotal", svc.getFailedCount());
        out.put("totalAttempts", svc.getTotalAttempts());
        out.put("failedCounts", svc.getFailCountsSnapshot());
        return ResponseEntity.ok(out);
    }

    @GetMapping(value = "/metrics", produces = "text/plain; charset=utf-8")
    public ResponseEntity<String> metrics() {
        return ResponseEntity.ok(svc.getMetricsPrometheus());
    }
}
