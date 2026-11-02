package com.lbc_plot.plot.preview;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link PreviewRenderCoalescer} 的回归测试。
 *
 * <p>对应用户反馈的现象：资源管理里改完角色/背景后，前端主线程卡住、输入框打不了字。
 * 运行日志显示同一条记录 60 秒内被渲染 101 次、单个 uuid 整份日志渲染 114 次，
 * 其中 97% 是完全重复的渲染——每次 120~350ms 的 CPU，叠起来就把机器占满了。
 *
 * <p>这里用打桩的 {@link PreviewRenderCoalescer.Renderer} 验证三条承诺：
 * 同一 key 的并发请求只渲染极少次、不同 key 互不影响、任何失败都能传回所有等待者。
 */
class PreviewRenderCoalescerTest {

    /** 渲染器打桩：记录调用次数、并发峰值与最后一次入参。 */
    private static final class StubRenderer implements PreviewRenderCoalescer.Renderer<String> {
        final AtomicInteger calls = new AtomicInteger();
        final AtomicInteger inFlight = new AtomicInteger();
        final AtomicInteger maxInFlight = new AtomicInteger();
        final AtomicReference<String> lastPayload = new AtomicReference<>();
        final List<String> renderedPayloads = Collections.synchronizedList(new ArrayList<>());
        volatile RuntimeException failure;

        @Override
        public byte[] render(String key, String payload) {
            calls.incrementAndGet();
            int now = inFlight.incrementAndGet();
            maxInFlight.accumulateAndGet(now, Math::max);
            lastPayload.set(payload);
            renderedPayloads.add(payload);
            try {
                Thread.sleep(30);
                if (failure != null) {
                    throw failure;
                }
                return (key + "|" + payload).getBytes(StandardCharsets.UTF_8);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            } finally {
                inFlight.decrementAndGet();
            }
        }
    }

    @Test
    @DisplayName("同一 key 的并发请求被合并成一次渲染，所有调用拿到同一份结果")
    void mergesConcurrentRequestsForSameKey() throws Exception {
        StubRenderer renderer = new StubRenderer();
        PreviewRenderCoalescer<String> coalescer =
                new PreviewRenderCoalescer<>(400L, 5_000L, 30_000L, 2, renderer, System::currentTimeMillis);

        int callers = 8;
        CyclicBarrier barrier = new CyclicBarrier(callers);
        CountDownLatch done = new CountDownLatch(callers);
        List<byte[]> results = Collections.synchronizedList(new ArrayList<>());
        List<Throwable> errors = Collections.synchronizedList(new ArrayList<>());

        for (int i = 0; i < callers; i++) {
            final String payload = "payload-" + i;
            Thread thread = new Thread(() -> {
                try {
                    barrier.await(5, TimeUnit.SECONDS);
                    results.add(coalescer.render("preview_uuid_a", payload));
                } catch (Throwable t) {
                    errors.add(t);
                } finally {
                    done.countDown();
                }
            });
            thread.start();
        }

        assertTrue(done.await(30, TimeUnit.SECONDS), "8 个并发请求应在超时前全部返回");
        assertTrue(errors.isEmpty(), "并发请求不应报错: " + errors);

        // 合并窗口 400ms 远大于 8 个线程的启动抖动，理论上只渲染一次。
        // 允许 2 次是给"极端调度抖动"留余量——重点是远小于 8 次。
        assertTrue(renderer.calls.get() <= 2,
                "8 个并发请求应被合并成 1~2 次渲染，实际渲染了 " + renderer.calls.get() + " 次");
        assertEquals(callers, results.size());
        for (byte[] result : results) {
            assertNotNull(result);
            assertArrayEquals(results.get(0), result, "合并批次里的所有调用应拿到同一份结果");
        }
    }

    @Test
    @DisplayName("不同 key 各自渲染，不会被误合并")
    void differentKeysRenderIndependently() throws Exception {
        StubRenderer renderer = new StubRenderer();
        PreviewRenderCoalescer<String> coalescer =
                new PreviewRenderCoalescer<>(100L, 5_000L, 30_000L, 2, renderer, System::currentTimeMillis);

        byte[] first = coalescer.render("preview_uuid_a", "a");
        byte[] second = coalescer.render("preview_uuid_b", "b");

        assertEquals(2, renderer.calls.get(), "两个不同 key 应各渲染一次");
        assertEquals("preview_uuid_a|a", new String(first, StandardCharsets.UTF_8));
        assertEquals("preview_uuid_b|b", new String(second, StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("渲染失败时，同批次的所有等待者都收到异常，不会挂住")
    void propagatesRendererFailure() {
        StubRenderer renderer = new StubRenderer();
        renderer.failure = new IllegalStateException("模拟渲染失败");
        PreviewRenderCoalescer<String> coalescer =
                new PreviewRenderCoalescer<>(50L, 5_000L, 10_000L, 1, renderer, System::currentTimeMillis);

        RuntimeException error = assertThrows(RuntimeException.class,
                () -> coalescer.render("preview_uuid_a", "boom"));

        assertTrue(error.getMessage().contains("模拟渲染失败"),
                "异常信息应透传渲染错误，实际为: " + error.getMessage());
        assertEquals(0, coalescer.pendingBatchCount(), "失败的批次应从在途表里移除");
    }

    @Test
    @DisplayName("批次收尾后的新请求会重新渲染（不会永远返回旧图）")
    void newRequestAfterBatchFinishedRendersAgain() throws Exception {
        StubRenderer renderer = new StubRenderer();
        PreviewRenderCoalescer<String> coalescer =
                new PreviewRenderCoalescer<>(0L, 5_000L, 30_000L, 1, renderer, System::currentTimeMillis);

        byte[] first = coalescer.render("preview_uuid_a", "v1");
        byte[] second = coalescer.render("preview_uuid_a", "v2");

        assertEquals(2, renderer.calls.get(), "两次先后请求应各自渲染");
        assertEquals("preview_uuid_a|v1", new String(first, StandardCharsets.UTF_8));
        assertEquals("preview_uuid_a|v2", new String(second, StandardCharsets.UTF_8),
                "第二次请求必须拿到按新内容渲染的图，不能复用上一批次的旧结果");
    }

    @Test
    @DisplayName("同时渲染的数量不超过配置上限，不会把 CPU 全占满")
    void respectsConcurrencyLimit() throws Exception {
        StubRenderer renderer = new StubRenderer();
        PreviewRenderCoalescer<String> coalescer =
                new PreviewRenderCoalescer<>(0L, 5_000L, 30_000L, 1, renderer, System::currentTimeMillis);

        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            final String key = "preview_uuid_" + i;
            Thread thread = new Thread(() -> {
                try {
                    coalescer.render(key, key);
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            });
            threads.add(thread);
            thread.start();
        }
        for (Thread thread : threads) {
            thread.join(30_000);
        }

        assertEquals(4, renderer.calls.get(), "4 个不同 key 应各渲染一次");
        assertEquals(1, renderer.maxInFlight.get(),
                "并发上限为 1 时同一时刻只能有一张图在渲染，实际峰值 " + renderer.maxInFlight.get());
    }

    @Test
    @DisplayName("合并窗口内以最后一次提交的内容为准（最后一次赢）")
    void lastPayloadWinsInsideBatch() throws Exception {
        StubRenderer renderer = new StubRenderer();
        PreviewRenderCoalescer<String> coalescer =
                new PreviewRenderCoalescer<>(300L, 5_000L, 30_000L, 1, renderer, System::currentTimeMillis);

        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            final String payload = "edit-" + i;
            Thread thread = new Thread(() -> {
                try {
                    coalescer.render("preview_uuid_a", payload);
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            });
            threads.add(thread);
            thread.start();
            // 依次稍晚启动，模拟用户连续编辑
            Thread.sleep(20);
        }
        for (Thread thread : threads) {
            thread.join(30_000);
        }

        assertTrue(renderer.calls.get() <= 2,
                "连续编辑应被合并成 1~2 次渲染，实际 " + renderer.calls.get() + " 次");
        assertTrue(renderer.renderedPayloads.contains("edit-3") || renderer.renderedPayloads.contains("edit-2"),
                "应渲染到最后提交的内容，实际渲染了: " + renderer.renderedPayloads);
    }
}
