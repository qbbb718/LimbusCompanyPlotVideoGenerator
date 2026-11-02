package com.lbc_plot.plot.preview;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.LongSupplier;

/**
 * 预览图渲染合并器：把"同一条记录"的并发渲染请求折叠成尽量少的一次渲染。
 *
 * <p><b>为什么需要它</b>：运行日志里出现过同一条记录在 60 秒内被渲染 101 次、
 * 单个 uuid 在整份日志里被渲染 114 次的情况（97% 是完全重复的重复渲染）。
 * 每次渲染要 120~350ms 的 CPU，几个请求叠在一起就会把机器的 CPU 占满，
 * 前端的主线程跟着卡住——表现为"输入框打字没反应、焦点丢失"。
 *
 * <p><b>行为</b>：
 * <ol>
 *   <li><b>合并窗口</b>：第一个请求成为 leader，先等 {@code coalesceWindowMs}，
 *       这段时间里到达的同一 key 请求都会被合并进来，只由 leader 渲染一次。</li>
 *   <li><b>边渲染边收</b>：leader 渲染期间新到的请求不会另起一次渲染，而是把内容
 *       塞给 leader；leader 渲染完发现内容变了就再来一轮（最多 {@code maxBatchMs}）。
 *       因此等待者拿到的图<b>不会比它自己提交的内容更旧</b>。</li>
 *   <li><b>全局并发上限</b>：所有渲染共享 {@code maxConcurrentRenders} 个许可，
 *       渲染风暴不会无限抢占 CPU / HTTP 线程。</li>
 * </ol>
 *
 * <p>注意：这是"最后一次赢"的合并，同一批次里的请求可能拿到<b>比它自己的请求更新</b>的
 * 画面（批次里最后一个人提交的内容）。预览图只是给用户看当前编辑效果，画面略"超前"
 * 比"落后"安全，且最后一个请求一定是按最新内容渲染的。
 *
 * <p>本类不依赖 Spring，可直接对 {@link Renderer} 打桩做单元测试。
 *
 * @param <P> 渲染入参（例如一条 Record）
 */
public final class PreviewRenderCoalescer<P> {

    /** 真正做渲染的回调；实现方负责磁盘缓存与日志。 */
    public interface Renderer<P> {
        byte[] render(String key, P payload) throws Exception;
    }

    /** 合并窗口默认值：一次编辑（打字/拖滑杆）通常几十毫秒一次，200ms 足够合并。 */
    public static final long DEFAULT_COALESCE_WINDOW_MS = 200L;

    /** 一个批次最长合并多久：防止用户持续编辑时等待者永远拿不到结果。 */
    public static final long DEFAULT_MAX_BATCH_MS = 5_000L;

    /** 等待渲染结果的上限：渲染本身是 100~400ms 量级，留足余量。 */
    public static final long DEFAULT_WAIT_TIMEOUT_MS = 60_000L;

    private final long coalesceWindowMs;
    private final long maxBatchMs;
    private final long waitTimeoutMs;
    private final int maxConcurrentRenders;
    private final Renderer<P> renderer;
    private final LongSupplier clock;

    private final ConcurrentHashMap<String, Batch<P>> batches = new ConcurrentHashMap<>();
    private final Semaphore renderPermits;

    public PreviewRenderCoalescer(int maxConcurrentRenders, Renderer<P> renderer) {
        this(DEFAULT_COALESCE_WINDOW_MS, DEFAULT_MAX_BATCH_MS, DEFAULT_WAIT_TIMEOUT_MS,
                maxConcurrentRenders, renderer, System::currentTimeMillis);
    }

    /**
     * @param coalesceWindowMs     合并窗口（毫秒）
     * @param maxBatchMs           一个批次最长合并时长（毫秒）
     * @param waitTimeoutMs        单个调用等待结果的上限（毫秒）
     * @param maxConcurrentRenders 同时进行的渲染数上限（至少 1）
     * @param renderer             渲染回调
     * @param clock                毫秒时钟（测试可注入，便于跳过真实等待）
     */
    public PreviewRenderCoalescer(long coalesceWindowMs,
            long maxBatchMs,
            long waitTimeoutMs,
            int maxConcurrentRenders,
            Renderer<P> renderer,
            LongSupplier clock) {
        if (renderer == null) {
            throw new IllegalArgumentException("renderer 不能为 null");
        }
        this.coalesceWindowMs = Math.max(0L, coalesceWindowMs);
        this.maxBatchMs = Math.max(0L, maxBatchMs);
        this.waitTimeoutMs = Math.max(1L, waitTimeoutMs);
        this.maxConcurrentRenders = Math.max(1, maxConcurrentRenders);
        this.renderer = renderer;
        this.clock = clock != null ? clock : System::currentTimeMillis;
        this.renderPermits = new Semaphore(this.maxConcurrentRenders, true);
    }

    /**
     * 请求渲染 {@code key} 对应的图。
     *
     * <p>同一 key 的并发调用会被合并：实际渲染次数远小于调用次数，所有调用都返回
     * 同一张（最新一次的）结果。
     *
     * @param key     合并键（调用方负责把尺寸/模式等会影响画面的参数拼进去）
     * @param payload 渲染入参；同一批次以最后提交的为准
     * @return 渲染出的字节
     * @throws Exception 渲染失败；同一批次的所有等待者都会收到同一个异常
     */
    public byte[] render(String key, P payload) throws Exception {
        if (key == null) {
            throw new IllegalArgumentException("key 不能为 null");
        }

        Batch<P> batch = null;
        boolean leader = false;

        // 拿到"一个还没收尾的批次"或"自己新建一个当作 leader"。
        // 循环次数很小（竞争只发生在批次刚好收尾的瞬间），上限只是防御。
        for (int attempt = 0; attempt < 32 && batch == null; attempt++) {
            Batch<P> existing = batches.get(key);
            if (existing != null) {
                if (existing.register(payload)) {
                    batch = existing;
                } else {
                    // 批次的 result 已经完成：摘掉它，下一轮自己当 leader
                    batches.remove(key, existing);
                }
                continue;
            }

            Batch<P> fresh = new Batch<>();
            fresh.register(payload);
            if (batches.putIfAbsent(key, fresh) == null) {
                batch = fresh;
                leader = true;
            }
        }

        if (batch == null) {
            // 极端竞争下拿不到批次：退化成"自己渲染一次"，正确性优先
            return renderOnce(key, payload);
        }

        if (leader) {
            runBatch(key, batch);
        }

        try {
            return batch.result.get(waitTimeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            throw new IllegalStateException("预览图渲染超时（" + waitTimeoutMs + "ms）: " + key, e);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception) {
                throw (Exception) cause;
            }
            throw new IllegalStateException("预览图渲染失败: " + key, cause);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("等待预览图渲染时被中断: " + key, e);
        }
    }

    /** 批次收尾（只有 leader 调用，且只调用一次）。 */
    private void runBatch(String key, Batch<P> batch) {
        byte[] lastBytes = null;
        Throwable failure = null;
        try {
            sleepQuietly(coalesceWindowMs);

            long deadline = clock.getAsLong() + maxBatchMs;
            while (true) {
                Snapshot<P> snapshot = batch.take();
                if (snapshot == null) {
                    break;
                }
                lastBytes = renderOnce(key, snapshot.payload);
                // 渲染期间若又来了新内容，take() 会拿到它并再渲染一轮；
                // 超过 maxBatchMs 就收手，让等待者先拿到画面。
                if (clock.getAsLong() >= deadline) {
                    break;
                }
            }
        } catch (Throwable t) {
            failure = t;
        } finally {
            if (failure != null) {
                batch.fail(failure);
            } else if (lastBytes != null) {
                batch.finish(lastBytes);
            } else {
                batch.fail(new IllegalStateException("预览图渲染没有产出结果: " + key));
            }
            batches.remove(key, batch);
        }
    }

    /** 真正渲染一次：受全局并发许可限制。 */
    private byte[] renderOnce(String key, P payload) throws Exception {
        boolean acquired = false;
        try {
            renderPermits.acquire();
            acquired = true;
            return renderer.render(key, payload);
        } finally {
            if (acquired) {
                renderPermits.release();
            }
        }
    }

    /** 当前未收尾的批次数（测试/诊断用）。 */
    public int pendingBatchCount() {
        return batches.size();
    }

    private static void sleepQuietly(long millis) {
        if (millis <= 0) {
            return;
        }
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("预览图渲染合并窗口被中断", e);
        }
    }

    /** 批次快照：某一轮要渲染的内容。 */
    private static final class Snapshot<P> {
        final P payload;

        Snapshot(P payload) {
            this.payload = payload;
        }
    }

    /**
     * 一个合并批次。
     *
     * <p>所有状态都在 {@code synchronized} 里改：注册（register）与取快照（take）/
     * 收尾（finish/fail）之间不能有中间态，否则 leader 可能在"刚取完快照"时
     * 漏掉一个已经注册进来的请求。
     */
    private static final class Batch<P> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private P latest;
        private boolean finished;

        /** @return false 表示批次已经收尾，调用方应换一个新批次 */
        synchronized boolean register(P payload) {
            if (finished) {
                return false;
            }
            latest = payload;
            return true;
        }

        /** 取走当前最新内容（还没有新内容时返回 null）。 */
        synchronized Snapshot<P> take() {
            if (latest == null) {
                return null;
            }
            Snapshot<P> snapshot = new Snapshot<>(latest);
            latest = null;
            return snapshot;
        }

        synchronized void finish(byte[] bytes) {
            finished = true;
            result.complete(bytes);
        }

        synchronized void fail(Throwable error) {
            finished = true;
            result.completeExceptionally(error);
        }
    }
}
