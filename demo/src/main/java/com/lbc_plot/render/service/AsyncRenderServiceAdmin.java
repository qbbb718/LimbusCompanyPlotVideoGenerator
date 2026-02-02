package com.lbc_plot.render.service;

import com.lbc_plot.render.service.impl.RenderJob;

import java.util.Collection;
import java.util.Map;

/**
 * Optional admin/status interface for AsyncRenderService implementations.
 */
public interface AsyncRenderServiceAdmin {
    long getQueuedCount();
    long getInProgressCount();
    long getProcessedCount();
    long getFailedCount();
    long getTotalAttempts();
    Map<String, Integer> getFailCountsSnapshot();

    RenderJob getJob(String id);
    Collection<RenderJob> listFailedJobs(int limit);
    Collection<RenderJob> listQueuedJobs(int limit);
}
