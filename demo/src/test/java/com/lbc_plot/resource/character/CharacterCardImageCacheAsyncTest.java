package com.lbc_plot.resource.character;

import com.lbc_plot.config.AppConfig;
import com.lbc_plot.resource.model.MyCharacter;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 名片生成异步化的契约测试。
 *
 * <p>背景：保存角色 / 设置默认立绘以前都在<b>请求线程</b>里同步渲染名片（一次 1s 量级的
 * AWT 合成，{@code setDefaultPortrait} 里那次甚至是在数据库事务内部）。保存按钮点下去
 * 迟迟没反应，用户只能反复点，前端看起来就是"卡死、输入框打不了字"。
 *
 * <p>这里用"渲染故意很慢"的桩验证三件事：
 * <ol>
 *   <li>{@code requestRefresh()} 立刻返回，不被渲染拖住；</li>
 *   <li>{@code awaitRefresh()} 能等到后台画好的图（供 GET /api/character-card 用）；</li>
 *   <li>合并窗口内的多次刷新只渲染一次。</li>
 * </ol>
 */
class CharacterCardImageCacheAsyncTest {

    /** 桩渲染耗时：远大于 requestRefresh 应花费的时间 */
    private static final long RENDER_DELAY_MS = 500L;

    private Path tempCharactersDir;
    private CountingCache cache;

    /** 渲染计数 + 可配置耗时的缓存实现（只替换"画图"这一步） */
    private static final class CountingCache extends CharacterCardImageCache {
        final AtomicInteger renders = new AtomicInteger();

        @Override
        public BufferedImage renderCardImage(MyCharacter character) {
            renders.incrementAndGet();
            try {
                Thread.sleep(RENDER_DELAY_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return new BufferedImage(40, 20, BufferedImage.TYPE_INT_ARGB);
        }
    }

    @BeforeEach
    void setUp() throws Exception {
        tempCharactersDir = Files.createTempDirectory("lbc-card-async-test");
        AppConfig appConfig = new AppConfig();
        appConfig.getAssets().setCharacters(tempCharactersDir.toAbsolutePath().toString());

        cache = new CountingCache();
        ReflectionTestUtils.setField(cache, "appConfig", appConfig);
    }

    @AfterEach
    void tearDown() {
        deleteRecursively(tempCharactersDir == null ? null : tempCharactersDir.toFile());
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) {
            return;
        }
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) {
                deleteRecursively(child);
            }
        }
        file.delete();
    }

    private static MyCharacter character(String id) {
        return MyCharacter.builder()
                .characterID(id)
                .characterName("异步名片测试")
                .faction("测试阵营")
                .build();
    }

    @Test
    @DisplayName("requestRefresh 立即返回，不等名片渲染完")
    void requestRefreshReturnsImmediately() {
        long start = System.currentTimeMillis();
        cache.requestRefresh(character("char_async_immediate"));
        long elapsed = System.currentTimeMillis() - start;

        assertTrue(elapsed < RENDER_DELAY_MS / 2,
                "requestRefresh 必须立刻返回（实测 " + elapsed + "ms，渲染要 " + RENDER_DELAY_MS + "ms）");
        // 清理：等后台那一轮跑完，避免影响后续用例
        assertNotNull(cache.awaitRefresh("char_async_immediate", 10_000),
                "后台渲染完成后应当能通过 awaitRefresh 拿到结果");
    }

    @Test
    @DisplayName("awaitRefresh 能等到后台渲染好的名片")
    void awaitRefreshWaitsForBackgroundRender() {
        String id = "char_async_await";
        cache.requestRefresh(character(id));

        BufferedImage image = cache.awaitRefresh(id, 10_000);

        assertNotNull(image, "保存角色后前端请求名片时应直接拿到后台画好的图");
        assertTrue(cache.renders.get() >= 1, "应当真的渲染过一次");
    }

    @Test
    @DisplayName("合并窗口内的多次刷新只渲染一次名片")
    void rapidRefreshesAreMerged() throws Exception {
        String id = "char_async_merged";

        cache.requestRefresh(character(id));
        Thread.sleep(30);
        cache.requestRefresh(character(id));
        Thread.sleep(30);
        cache.requestRefresh(character(id));

        assertNotNull(cache.awaitRefresh(id, 10_000), "合并后仍应产出名片");
        // 再等一会儿，确认没有后续的重复渲染
        Thread.sleep(RENDER_DELAY_MS + 300);

        assertTrue(cache.renders.get() <= 2,
                "3 次连续刷新最多渲染 2 次（合并窗口内应为 1 次），实际 " + cache.renders.get() + " 次");
    }

    @Test
    @DisplayName("没有待刷新的任务时，awaitRefresh 立即返回 null（不阻塞请求线程）")
    void awaitRefreshReturnsNullWhenNothingPending() {
        long start = System.currentTimeMillis();
        assertNull(cache.awaitRefresh("char_async_none", 5_000));
        long elapsed = System.currentTimeMillis() - start;

        assertTrue(elapsed < 200, "没有待刷新任务时必须立即返回，实测 " + elapsed + "ms");
    }
}
