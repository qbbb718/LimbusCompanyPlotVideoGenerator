package com.lbc_plot.resource.character;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.logging.Logger;

import javax.imageio.ImageIO;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.lbc_plot.config.AppConfig;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.render.engine.RenderOfImage;
import com.lbc_plot.render.video.CharacterRef;
import com.lbc_plot.resource.model.MyCharacter;

/**
 * 角色名片图片缓存工具类
 * 负责生成、缓存和管理角色名片图片
 *
 * 重构说明：目录名直接用 characterId（不再用拼音），
 * 名片缓存保存到 {characters}/{characterId}/{characterThumbnailsSubdir}/{characterId}.png，
 * 删除角色目录时会一并清理。
 *
 * <p><b>为什么名片生成必须异步</b>：渲染一张名片是 1s 量级的 AWT 合成，以前
 * {@code CharacterController.updateCharacter} / {@code PortraitController.setDefaultPortrait}
 * 直接在请求线程里调 {@link #getCharacterCardImage}，于是一次"保存角色"要 1s 以上才返回
 * （{@code setDefaultPortrait} 里那次甚至是<b>在数据库事务内部</b>渲染的，一直占着连接）。
 * 保存按钮点下去迟迟没有响应，用户只能反复点，前端界面看起来就是"卡死、输入框打不了字"。
 *
 * <p>现在改为：保存动作只调用 {@link #requestRefresh(MyCharacter)} —— 立刻作废旧缓存并
 * 排一个后台任务，接口立即返回；前端 {@code <img src="/api/character-card/{id}">} 请求
 * 时由 {@link com.lbc_plot.resource.character.CharacterCardController} 用
 * {@link #awaitRefresh(String, long)} 等一下这张图（最多几秒），拿不到才退回同步渲染。
 *
 * <p>刷新还带 200ms 的合并窗口：连续保存同一个角色只会渲染一次；渲染线程只有一个，
 * 多张名片排队生成，不会把 CPU 抢满。
 */
@Component
public class CharacterCardImageCache {
    private static final Logger logger = Logger.getLogger(CharacterCardImageCache.class.getName());

    /** 阵营为空时的兜底文案，与 {@code MyCharacter.DEFAULT_FACTION} 保持一致。 */
    private static final String DEFAULT_FACTION = "无阵营";

    /**
     * 名片刷新合并窗口（毫秒）。
     *
     * <p>一次保存往往伴随多次刷新（保存角色、设默认立绘、批量导入立绘后自动保存），
     * 窗口内的刷新只渲染最后一次，避免同一张名片被反复重画。
     */
    private static final long REFRESH_DEBOUNCE_MS = 200L;

    /** 允许调用方等名片生成的最长时间（毫秒）。名片渲染本身约 1s，留少量排队余量。 */
    public static final long REFRESH_WAIT_DEFAULT_MS = 5_000L;

    // 内存缓存（与磁盘路径解耦，按 characterId 索引，保留 static）
    private static final ConcurrentHashMap<String, BufferedImage> imageCache = new ConcurrentHashMap<>();

    /**
     * 后台名片渲染线程。
     *
     * <p>只用 2 条线程：名片渲染是纯 CPU 的 AWT 合成，线程再多也只会互相抢核，
     * 反而把请求线程和前端拖慢。串行度这么高还能接受，是因为刷新已经按角色合并过，
     * 正常使用下队列里同时只有一两张。
     */
    private static final ScheduledExecutorService REFRESH_EXECUTOR = Executors.newScheduledThreadPool(2, r -> {
        Thread thread = new Thread(r, "character-card-refresh");
        thread.setDaemon(true);
        return thread;
    });

    /** 每个角色最多一个刷新状态；没有待渲染内容时会被移除。 */
    private static final ConcurrentHashMap<String, RefreshState> REFRESH_STATES = new ConcurrentHashMap<>();

    /**
     * 同步渲染的在途表：同一角色的并发 GET（名片 <img> 被多次请求）只真正渲染一次。
     */
    private static final ConcurrentHashMap<String, CompletableFuture<BufferedImage>> RENDERING = new ConcurrentHashMap<>();

    @Autowired
    private AppConfig appConfig;

    /**
     * 获取角色名片图片
     * 优先从缓存读取，如果不存在则生成并缓存
     *
     * <p>注意：这是<b>同步</b>路径，只应该在"读取图片"的请求里用（例如
     * {@code GET /api/character-card/{id}}），不要在"保存角色"这类接口里调用，
     * 否则请求线程又会被渲染拖住；保存请改用 {@link #requestRefresh(MyCharacter)}。
     *
     * @param character 角色对象
     * @return 名片图片
     */
    public BufferedImage getCharacterCardImage(MyCharacter character) {
        if (character == null) {
            logger.warning("角色对象为null，无法获取名片图片");
            return null;
        }

        String characterId = character.getCharacterID();
        if (characterId == null || characterId.isEmpty()) {
            logger.warning("角色ID为空，无法获取名片图片");
            return null;
        }

        // 1. 先检查内存缓存
        BufferedImage cachedImage = imageCache.get(characterId);
        if (cachedImage != null) {
            return cachedImage;
        }

        // 2. 检查磁盘缓存
        File cacheFile = getCacheFile(characterId);
        if (cacheFile.exists()) {
            try {
                BufferedImage image = ImageIO.read(cacheFile);
                if (image != null) {
                    imageCache.put(characterId, image);
                    logger.info("从磁盘缓存加载名片图片，角色ID: " + characterId);
                    return image;
                }
                logger.warning("从磁盘缓存读取的名片图片为null，角色ID: " + characterId);
            } catch (IOException e) {
                logger.warning("读取名片缓存文件失败: " + e.getMessage());
            }
        }

        // 3. 生成新的名片图片（同一角色的并发请求只渲染一次）
        return generateCoalesced(characterId, character);
    }

    /**
     * 同一角色的并发"渲染并缓存"只做一次：后到的请求直接等前一个的结果。
     *
     * <p>前端的角色列表里同一个角色可能同时有几处 {@code <img>}（卡片头像 + 名片预览），
     * 以前每个请求都会各渲染一张 1s 的图。
     */
    private BufferedImage generateCoalesced(String characterId, MyCharacter character) {
        CompletableFuture<BufferedImage> mine = new CompletableFuture<>();
        CompletableFuture<BufferedImage> running = RENDERING.putIfAbsent(characterId, mine);
        if (running != null) {
            try {
                BufferedImage shared = running.get(REFRESH_WAIT_DEFAULT_MS, TimeUnit.MILLISECONDS);
                if (shared != null) {
                    return shared;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return null;
            } catch (ExecutionException | TimeoutException e) {
                // 抢先渲染的那个失败了/太慢：退化为本请求自己渲染一次
                logger.warning("等待并发名片渲染失败，改为独立渲染，角色ID: " + characterId
                        + ", 原因: " + e.getMessage());
            }
        }

        boolean leader = running == null;
        try {
            BufferedImage newImage = renderAndStore(character);
            if (leader) {
                mine.complete(newImage);
            }
            return newImage;
        } catch (RuntimeException | Error e) {
            if (leader) {
                mine.completeExceptionally(e);
            }
            throw e;
        } finally {
            if (leader) {
                RENDERING.remove(characterId, mine);
            }
        }
    }

    /** 渲染一张名片写进内存 + 磁盘缓存。 */
    private BufferedImage renderAndStore(MyCharacter character) {
        String characterId = character.getCharacterID();
        logger.info("生成新的名片图片，角色ID: " + characterId);
        BufferedImage newImage = generateCharacterCardImage(character);
        if (newImage == null) {
            logger.warning("生成名片图片失败，角色ID: " + characterId);
            return null;
        }
        saveToCache(characterId, newImage);
        imageCache.put(characterId, newImage);
        logger.info("名片图片已缓存: " + characterId);
        return newImage;
    }

    /**
     * 请求在后台刷新某个角色的名片（<b>立即返回</b>）。
     *
     * <p>调用时机：角色被保存/更新、默认立绘被切换。旧缓存会马上作废（内存 + 磁盘），
     * 这样紧接着的 {@code GET /api/character-card/{id}} 不会拿到旧图；真正的渲染在
     * 后台线程里做，合并窗口内的多次请求只渲染一次。
     *
     * <p>为什么要传完整的 {@code character}：渲染需要名称/阵营/颜色，而保存接口手里
     * 正好有这份"刚存进去的数据"。后台线程不再回查数据库，避免多开一条连接
     * （本项目用的是 {@code DriverManagerDataSource}，每次开连接都有可观开销）。
     *
     * @param character 角色数据；为空或 ID 为空时什么都不做
     */
    public void requestRefresh(MyCharacter character) {
        if (character == null) {
            return;
        }
        String characterId = character.getCharacterID();
        if (characterId == null || characterId.isEmpty()) {
            return;
        }

        // 先作废旧图：即使后台渲染还没开始，读路径也不会把旧名片当成新名片返回
        clearCache(characterId);

        RefreshState state = REFRESH_STATES.computeIfAbsent(characterId, key -> new RefreshState());
        synchronized (state) {
            state.pending = character;
            if (state.scheduled || state.rendering) {
                // 已经在排队或正在渲染：它会把最新数据一起渲掉
                return;
            }
            state.scheduled = true;
        }

        try {
            state.scheduledFuture = REFRESH_EXECUTOR.schedule(
                    () -> runRefresh(characterId, state), REFRESH_DEBOUNCE_MS, TimeUnit.MILLISECONDS);
            logger.info("已排队后台刷新名片，角色ID: " + characterId);
        } catch (java.util.concurrent.RejectedExecutionException e) {
            // 执行器已关闭（应用正在退出）：不阻塞调用方，下次启动会重新生成
            logger.warning("名片刷新任务提交失败（执行器已关闭），角色ID: " + characterId);
            synchronized (state) {
                state.scheduled = false;
            }
            state.result.complete(null);
            REFRESH_STATES.remove(characterId, state);
        }
    }

    /**
     * 等 {@link #requestRefresh(MyCharacter)} 排下的那张名片渲染完。
     *
     * <p>供 {@code GET /api/character-card/{id}} 使用：保存角色后前端会立刻请求名片，
     * 这里等后台渲染结果，就不用再同步渲染一遍（也就不会重复渲染）。
     *
     * @param characterId 角色ID
     * @param timeoutMs   最多等多久（毫秒）
     * @return 渲染好的名片；没有待刷新的任务、超时或渲染失败时返回 null（调用方回退到同步渲染）
     */
    public BufferedImage awaitRefresh(String characterId, long timeoutMs) {
        if (characterId == null || characterId.isEmpty()) {
            return null;
        }
        RefreshState state = REFRESH_STATES.get(characterId);
        if (state == null) {
            return null;
        }
        try {
            return state.result.get(Math.max(1L, timeoutMs), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (ExecutionException e) {
            logger.warning("后台刷新名片失败，角色ID: " + characterId + ", 原因: " + e.getMessage());
            return null;
        } catch (TimeoutException e) {
            logger.warning("等待后台刷新名片超时（" + timeoutMs + "ms），角色ID: " + characterId);
            return null;
        }
    }

    /** 后台刷新循环：把 pending 里的最新数据渲掉；渲染期间又来的新数据再渲一轮。 */
    private void runRefresh(String characterId, RefreshState state) {
        try {
            while (true) {
                MyCharacter character;
                synchronized (state) {
                    character = state.pending;
                    state.pending = null;
                    state.scheduled = false;
                    if (character == null) {
                        break;
                    }
                    state.rendering = true;
                }

                try {
                    BufferedImage image = renderAndStore(character);
                    if (image != null) {
                        // 只完成一次：等待者拿到的是第一张成功渲染的图。
                        // 之后的轮次只是把更新的图写进缓存，不影响已经返回的响应。
                        state.result.complete(image);
                    }
                } finally {
                    synchronized (state) {
                        state.rendering = false;
                    }
                }
            }
        } catch (RuntimeException | Error e) {
            logger.severe("后台刷新名片失败，角色ID: " + characterId + ", 错误: " + e.getMessage());
            state.result.completeExceptionally(e);
        } finally {
            boolean reschedule = false;
            synchronized (state) {
                state.rendering = false;
                if (state.pending != null && !state.scheduled) {
                    // 收尾瞬间刚好又来了新数据：再排一轮，不要把它丢了
                    state.scheduled = true;
                    reschedule = true;
                } else if (state.pending == null) {
                    REFRESH_STATES.remove(characterId, state);
                }
            }
            // 没渲染出图（渲染返回 null / 被跳过）也要给等待者一个结果，
            // 否则 awaitRefresh 会一直等到超时，名片请求白等 5 秒。
            state.result.complete(null);
            if (reschedule) {
                try {
                    state.scheduledFuture = REFRESH_EXECUTOR.schedule(
                            () -> runRefresh(characterId, state), REFRESH_DEBOUNCE_MS, TimeUnit.MILLISECONDS);
                } catch (java.util.concurrent.RejectedExecutionException e) {
                    REFRESH_STATES.remove(characterId, state);
                }
            }
        }
    }

    /**
     * 用传入的参数渲染一张名片图片，<b>不读也不写任何缓存</b>。
     *
     * <p>供「名片预览」的刷新按钮使用：用户在弹窗里改了名称/阵营/颜色但还没保存时，
     * 也能立刻拿到用当前参数渲染的名片。因为完全不碰内存/磁盘缓存，
     * 预览不会污染数据库里已保存角色的名片缓存。
     *
     * @param character 角色参数（颜色/阵营/身高缺失时用默认值补齐，名称不能为空）
     * @return 名片图片；名称为空或渲染失败时返回 null
     */
    public BufferedImage renderCardImage(MyCharacter character) {
        if (character == null) {
            logger.warning("角色对象为null，无法渲染名片图片");
            return null;
        }

        String characterName = character.getCharacterName();
        if (characterName == null || characterName.trim().isEmpty()) {
            logger.warning("角色名称为空，无法渲染名片图片，角色ID: " + character.getCharacterID());
            return null;
        }

        try {
            // 前端颜色输入框是自由文本，解析失败会得到 null；阵营也可能为空。
            // 这里统一补默认值，否则渲染层会在 stringWidth(null) 处抛异常。
            String faction = character.getFaction();
            if (faction == null || faction.trim().isEmpty()) {
                faction = DEFAULT_FACTION;
            }

            CharacterRef characterRef = new CharacterRef(
                    character.getCharacterID(),
                    characterName,
                    character.getHeight(),
                    faction,
                    character.getColorBg() != null ? character.getColorBg() : ProjectConfig.DEFAULT_BG_COLOR,
                    character.getColorText() != null ? character.getColorText() : ProjectConfig.DEFAULT_TEXT_COLOR);

            return RenderOfImage.renderCharaNameUI(characterRef);
        } catch (Exception e) {
            logger.severe("渲染名片图片失败: " + e.getMessage());
            return null;
        }
    }

    /**
     * 生成角色名片图片（缓存未命中时调用）
     */
    private BufferedImage generateCharacterCardImage(MyCharacter character) {
        return renderCardImage(character);
    }

    /**
     * 保存名片图片到磁盘缓存
     *
     * @param characterId 角色ID（即目录名）
     * @param image       名片图片
     */
    private void saveToCache(String characterId, BufferedImage image) {
        try {
            File cacheFile = getCacheFile(characterId);
            Path cacheDir = cacheFile.getParentFile().toPath();
            if (!Files.exists(cacheDir)) {
                Files.createDirectories(cacheDir);
            }
            ImageIO.write(image, "PNG", cacheFile);
            logger.info("名片图片已缓存: " + cacheFile.getAbsolutePath());
        } catch (IOException e) {
            logger.severe("保存名片缓存失败: " + e.getMessage());
        }
    }

    /**
     * 获取缓存文件路径
     * 动态计算：{characters}/{characterId}/{characterThumbnailsSubdir}/{characterId}.png
     *
     * @param characterId 角色ID（即目录名）
     * @return 缓存文件
     */
    private File getCacheFile(String characterId) {
        File dir = new File(
                new File(appConfig.getAssets().getCharacters(), characterId),
                appConfig.getAssets().getCharacterThumbnailsSubdir());
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return new File(dir, characterId + ".png");
    }

    /**
     * 清除指定角色的名片缓存（内存 + 磁盘）
     *
     * @param characterId 角色ID
     */
    public void clearCache(String characterId) {
        if (characterId == null || characterId.isEmpty()) {
            return;
        }
        // 从内存缓存中移除
        imageCache.remove(characterId);

        // 删除磁盘缓存文件
        try {
            File cacheFile = getCacheFile(characterId);
            if (cacheFile.exists() && cacheFile.delete()) {
                logger.info("已删除名片缓存文件: " + cacheFile.getAbsolutePath());
            }
        } catch (Exception e) {
            logger.warning("清除名片磁盘缓存失败，角色ID: " + characterId + ", 错误: " + e.getMessage());
        }
    }

    /**
     * 清除所有名片缓存
     */
    public void clearAllCache() {
        // 清空内存缓存
        imageCache.clear();
        logger.info("已清空名片内存缓存");
        // 磁盘缓存随角色目录管理，不在此单独清理
    }

    /**
     * 获取名片图片的相对路径（用于前端访问）
     *
     * @param characterId 角色ID
     * @return 相对路径（URL 形式）
     */
    public String getCharacterCardImagePath(String characterId) {
        // 返回API路径，而不是文件系统路径
        return "/api/character-card/" + characterId;
    }

    /**
     * 某个角色的后台刷新状态。
     *
     * <p>所有字段都在 {@code synchronized(state)} 里读写，避免"渲染收尾"与"新请求到来"
     * 交错时把新数据丢掉。
     */
    private static final class RefreshState {
        /** 已经完成（或将要完成）的那次渲染结果；所有等待者共享。 */
        final CompletableFuture<BufferedImage> result = new CompletableFuture<>();
        /** 最新一次请求要渲染的角色数据 */
        MyCharacter pending;
        /** 是否已经排了一个延迟任务 */
        boolean scheduled;
        /** 是否正在渲染 */
        boolean rendering;
        /** 已排的延迟任务句柄（仅用于诊断/取消，可能为 null） */
        ScheduledFuture<?> scheduledFuture;
    }
}
