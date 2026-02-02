package com.lbc_plot.render.controller;

import com.lbc_plot.render.service.AsyncRenderServiceAdmin;
import com.lbc_plot.render.service.impl.RenderJob;
import com.lbc_plot.plot.model.Record;
import org.junit.jupiter.api.Test;

import java.util.Collection;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

public class AsyncQueueControllerTest {

    @Test
    public void testStatus() {
        AsyncRenderServiceAdmin admin = mock(AsyncRenderServiceAdmin.class);
        when(admin.getQueuedCount()).thenReturn(5L);
        when(admin.getInProgressCount()).thenReturn(1L);
        when(admin.getProcessedCount()).thenReturn(10L);
        when(admin.getFailedCount()).thenReturn(2L);
        when(admin.getTotalAttempts()).thenReturn(15L);
        when(admin.getFailCountsSnapshot()).thenReturn(Map.of("a", 2, "b", 1));

        AsyncQueueController c = new AsyncQueueController(admin);
        var resp = c.status();
        assertEquals(200, resp.getStatusCodeValue());
        Map body = (Map) resp.getBody();
        assertEquals(5, ((Number) body.get("queued")).longValue());
        assertEquals(1, ((Number) body.get("inProgress")).longValue());
        assertEquals(10, ((Number) body.get("processedTotal")).longValue());
    }

    @Test
    public void testGetTaskNotFound() {
        AsyncRenderServiceAdmin admin = mock(AsyncRenderServiceAdmin.class);
        when(admin.getJob("x")).thenReturn(null);
        AsyncQueueController c = new AsyncQueueController(admin);
        var resp = c.getTask("x");
        assertEquals(404, resp.getStatusCodeValue());
    }

    @Test
    public void testGetTaskFound() {
        AsyncRenderServiceAdmin admin = mock(AsyncRenderServiceAdmin.class);
        Record r = new Record.Builder().build();
        RenderJob job = new RenderJob("id1", r, false, 1280, 720, "out.mp4", 30);
        when(admin.getJob("id1")).thenReturn(job);
        AsyncQueueController c = new AsyncQueueController(admin);
        var resp = c.getTask("id1");
        assertEquals(200, resp.getStatusCodeValue());
        assertEquals(job, resp.getBody());
    }
}