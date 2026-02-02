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

import com.lbc_plot.render.service.AsyncRenderServiceAdmin;
import com.lbc_plot.render.service.impl.RenderJob;

@RestController
@RequestMapping("/admin/async-jobs")
public class AsyncQueueController {

    private final AsyncRenderServiceAdmin svc;

    @Autowired
    public AsyncQueueController(AsyncRenderServiceAdmin svc) {
        this.svc = svc;
    }

    @GetMapping("/status")
    public ResponseEntity<?> status() {
        Map<String, Object> out = new HashMap<>();
        out.put("queued", svc.getQueuedCount());
        out.put("inProgress", svc.getInProgressCount());
        out.put("processedTotal", svc.getProcessedCount());
        out.put("failedTotal", svc.getFailedCount());
        out.put("totalAttempts", svc.getTotalAttempts());
        out.put("failedCounts", svc.getFailCountsSnapshot());
        return ResponseEntity.ok(out);
    }

    @GetMapping("/task/{id}")
    public ResponseEntity<?> getTask(@org.springframework.web.bind.annotation.PathVariable String id) {
        RenderJob job = svc.getJob(id);
        if (job == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(job);
    }

    @GetMapping("/failed")
    public ResponseEntity<?> failed(@org.springframework.web.bind.annotation.RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(svc.listFailedJobs(limit));
    }
}
