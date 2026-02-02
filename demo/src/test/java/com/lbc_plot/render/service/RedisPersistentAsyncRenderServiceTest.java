package com.lbc_plot.render.service;

import com.lbc_plot.config.AsyncQueueProperties;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.render.service.impl.RedisPersistentAsyncRenderService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.RedisTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

public class RedisPersistentAsyncRenderServiceTest {

    @Test
    public void testSubmitStoresJob() throws Exception {
        @SuppressWarnings("unchecked")
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        ListOperations<String, String> lists = mock(ListOperations.class);
        HashOperations<String, Object, Object> hashes = mock(HashOperations.class);
        when(redis.opsForList()).thenReturn(lists);
        when(redis.opsForHash()).thenReturn(hashes);

        AsyncQueueProperties props = new AsyncQueueProperties();
        RedisPersistentAsyncRenderService svc = new RedisPersistentAsyncRenderService(redis, props, null, null);

        var future = svc.submitRenderTask(new Record.Builder().build(), false, 1280, 720, "out.mp4", 30);
        // Verify that a push to the main queue and a job store put occurred
        verify(lists, times(1)).leftPush(eq("async_render_queue"), anyString());
        verify(hashes, times(1)).put(eq("async_render_queue:store"), anyString(), anyString());
        assertNotNull(future);
    }

    @Test
    public void testGetQueuedCountDelegatesToRedis() {
        @SuppressWarnings("unchecked")
        RedisTemplate<String, String> redis = mock(RedisTemplate.class);
        ListOperations<String, String> lists = mock(ListOperations.class);
        when(redis.opsForList()).thenReturn(lists);
        when(lists.size("async_render_queue")).thenReturn(7L);

        AsyncQueueProperties props = new AsyncQueueProperties();
        RedisPersistentAsyncRenderService svc = new RedisPersistentAsyncRenderService(redis, props, null, null);

        assertEquals(7L, svc.getQueuedCount());
        verify(lists, times(1)).size("async_render_queue");
    }
}