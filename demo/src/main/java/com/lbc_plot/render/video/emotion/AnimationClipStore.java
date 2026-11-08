package com.lbc_plot.render.video.emotion;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.common.util.io.ImageReader;
import com.lbc_plot.render.video.anim.AnimationClipAsset;

/**
 * @module 情绪动画素材库（磁盘访问）
 * {@code {dataRoot}/assets/animation-clips/<id>/} 的唯一读写入口：
 * 目录约定、帧文件命名、clip.json 读写、帧图解码。
 *
 * <h2>为什么是静态工具类而不是 Spring bean</h2>
 * 帧图要被 {@code RenderOfImage} 的**静态**渲染路径读取（逐帧、每帧一次），
 * 那条路径没有 Spring 容器可用（它是纯静态方法链，见 {@code RenderOfImage.renderCharacters}）。
 * 把"素材在哪、第几帧叫什么"做成静态的，渲染端、导出端、控制器端就只有一份实现，
 * 不会出现"控制器能列出、渲染器找不到"这种分裂。
 *
 * <h2>目录约定（不要改）</h2>
 * <pre>
 * {dataRoot}/assets/animation-clips/&lt;id&gt;/
 * ├── clip.json      # 元数据
 * └── frames/
 *     ├── 0001.png    # 第 0 张（文件名从 1 开始，便于人工按名字排序阅读）
 *     └── 0002.png
 * </pre>
 * 帧图**一律重编码成 PNG**：① JPG 没有 alpha，重编码后统一；② 单一命名规则让 URL
 * 与前端播放器只认一种后缀；③ 导入时顺手把不一致的帧尺寸统一贴到公共画布上。
 *
 * <h2>id 校验是安全边界</h2>
 * {@link #ID_PATTERN} 不只是"好看"：id 会拼进文件路径，放任 {@code ../} 就是任意文件读写。
 * 所以凡是公开方法接收 id，一律先 {@link #isValidId} 校验。
 */
public final class AnimationClipStore {

    /** 素材 id 白名单：字母/数字/下划线/短横线，1~64 位（同时也是 URL 段与目录名） */
    public static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    /** 元数据文件名 */
    public static final String INDEX_FILE = "clip.json";

    /** 帧目录名 */
    public static final String FRAMES_DIR = "frames";

    /** 帧格式（导入时统一重编码；读取时也只用它） */
    public static final String FRAME_EXTENSION = ".png";

    /** 单帧文件名的 4 位补零宽度（上限 9999 帧，实际由导入器卡在 240） */
    private static final String FRAME_NAME_FORMAT = "%04d" + FRAME_EXTENSION;

    /** 扫盘时最多数这么多帧（防呆：目录被塞了一堆无关文件时不至于空转） */
    private static final int MAX_FRAMES_ON_DISK = 1000;

    /** 读 clip.json 要宽容（旧文件可能带新字段/注释），写出去要好看（便于人工 review 与版本管理） */
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
            .enable(SerializationFeature.INDENT_OUTPUT);

    /**
     * 测试用的根目录覆盖。生产路径永远是 {@link RuntimePaths#getAnimationClipsDir()}。
     * 非测试代码不要碰它。
     */
    private static volatile Path rootOverride;

    private AnimationClipStore() {
    }

    /* ==================== 路径 ==================== */

    /** 素材库根目录 */
    public static Path root() {
        Path override = rootOverride;
        return override != null ? override : RuntimePaths.getAnimationClipsDir();
    }

    /** 仅供测试：把素材库根目录指到临时目录（传 null 恢复默认） */
    public static void setRootForTesting(Path root) {
        rootOverride = root;
    }

    /** id 是否合法（合法才能安全地拼进路径） */
    public static boolean isValidId(String clipId) {
        return clipId != null && ID_PATTERN.matcher(clipId).matches();
    }

    /**
     * 素材目录。
     *
     * @throws IllegalArgumentException id 非法（调用方应先校验；走到这里说明是编程错误）
     */
    public static Path clipDir(String clipId) {
        if (!isValidId(clipId)) {
            throw new IllegalArgumentException("非法的动画素材 id: " + clipId);
        }
        return root().resolve(clipId);
    }

    /** 帧目录 */
    public static Path framesDir(String clipId) {
        return clipDir(clipId).resolve(FRAMES_DIR);
    }

    /** clip.json 路径 */
    public static Path indexPath(String clipId) {
        return clipDir(clipId).resolve(INDEX_FILE);
    }

    /**
     * 第 {@code index} 帧（0 起）的文件路径。
     *
     * <p>文件名是 {@code index+1} 补零：{@code 0001.png} 是第 0 帧。之所以文件名从 1 开始，
     * 是为了让用户在资源管理器里对着 AE 导出的 {@code xxx_00000.png} 数得清；
     * **内部一律 0 起**，只在拼文件名这一处 +1。
     */
    public static Path frameFile(String clipId, int index) {
        return framesDir(clipId).resolve(String.format(FRAME_NAME_FORMAT, Math.max(0, index) + 1));
    }

    /** 帧图的 HTTP 路径（{@code /assets/**} 已静态映射，无需新代码） */
    public static String frameUrl(String clipId, int index) {
        int fileNumber = Math.max(0, index) + 1;
        return "/assets/animation-clips/" + clipId + "/" + FRAMES_DIR + "/"
                + String.format(FRAME_NAME_FORMAT, fileNumber);
    }

    /* ==================== 帧 ==================== */

    /**
     * 磁盘上真的有几张帧图（**从第 0 帧起连续**计数）。
     *
     * <p>和 clip.json 里的 {@code frameHolds.size()} 可能不一致（用户手动删了图 / 拷包拷漏了）。
     * 渲染时以**这个数**为上限：多出来的配置当没有，少了的图当不存在，绝不越界。
     *
     * <p>只认"从 0001 开始连续"的帧：帧序列是一条连续时间轴，中间缺一张就说明素材坏了，
     * 后面即使有孤立文件也不再算进来（否则时间轴会整体错位）。
     */
    public static int frameFileCount(String clipId) {
        if (!isValidId(clipId)) {
            return 0;
        }
        if (!Files.isDirectory(framesDir(clipId))) {
            return 0;
        }
        int count = 0;
        while (count < MAX_FRAMES_ON_DISK && Files.isRegularFile(frameFile(clipId, count))) {
            count++;
        }
        return count;
    }

    /**
     * 解码第 {@code index} 帧（0 起）。
     *
     * @return 解码失败返回 {@code null}（调用方跳过这一帧，不要让一张坏图毁掉整条视频）
     */
    public static BufferedImage frameImage(String clipId, int index) {
        if (!isValidId(clipId) || index < 0) {
            return null;
        }
        File file = frameFile(clipId, index).toFile();
        if (!file.isFile()) {
            return null;
        }
        try {
            return ImageReader.readImageFile(file);
        } catch (IOException e) {
            return null;
        }
    }

    /* ==================== 元数据 ==================== */

    /**
     * 列出全部素材（按创建时间倒序，新的在前）。
     *
     * <p>坏文件（clip.json 解析失败 / id 非法 / 结构不自洽）**跳过而不抛**：
     * 一个手抖改坏的 clip.json 不该让整个素材库打不开。
     */
    public static List<AnimationClipAsset> list() {
        Path rootDir = root();
        List<AnimationClipAsset> assets = new ArrayList<>();
        if (!Files.isDirectory(rootDir)) {
            return assets;
        }
        try (Stream<Path> entries = Files.list(rootDir)) {
            entries.filter(Files::isDirectory)
                    .map(path -> path.getFileName().toString())
                    .filter(AnimationClipStore::isValidId)
                    // 以 . 开头的临时目录（.importing-xxx）天然被 ID_PATTERN 挡住
                    .forEach(id -> find(id).ifPresent(assets::add));
        } catch (IOException e) {
            return assets;
        }
        assets.sort(Comparator.comparingLong(AnimationClipAsset::getCreatedAt).reversed()
                .thenComparing(AnimationClipAsset::getId));
        return assets;
    }

    /** 读一个素材；不存在/坏文件 → empty */
    public static Optional<AnimationClipAsset> find(String clipId) {
        if (!isValidId(clipId)) {
            return Optional.empty();
        }
        Path index = indexPath(clipId);
        if (!Files.isRegularFile(index)) {
            return Optional.empty();
        }
        try (InputStream in = Files.newInputStream(index)) {
            AnimationClipAsset asset = MAPPER.readValue(in, AnimationClipAsset.class);
            if (asset == null || !asset.isValid()) {
                return Optional.empty();
            }
            // 目录名是唯一权威：clip.json 里的 id 与目录名不一致时以目录名为准
            asset.setId(clipId);
            return Optional.of(asset);
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    /** 写 clip.json（目录不存在时创建） */
    public static void save(AnimationClipAsset asset) throws IOException {
        if (asset == null || !asset.isValid()) {
            throw new IllegalArgumentException("动画素材元数据不完整");
        }
        Path dir = clipDir(asset.getId());
        Files.createDirectories(dir);
        writeIndex(dir, asset);
    }

    /**
     * 把元数据写进指定目录（导入时先写临时目录，改名后才算生效）。
     *
     * @param dir 目标目录（调用方负责存在）
     */
    public static void writeIndex(Path dir, AnimationClipAsset asset) throws IOException {
        if (asset == null || !asset.isValid()) {
            throw new IllegalArgumentException("动画素材元数据不完整");
        }
        Files.createDirectories(dir);
        MAPPER.writeValue(dir.resolve(INDEX_FILE).toFile(), asset);
    }

    /** 删除整个素材目录；返回是否真的删掉了东西 */
    public static boolean delete(String clipId) {
        if (!isValidId(clipId)) {
            return false;
        }
        Path dir = clipDir(clipId);
        if (!Files.isDirectory(dir)) {
            return false;
        }
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // 单个文件删不掉（被占用）时尽量继续删其它，最后目录可能残留
                }
            });
        } catch (IOException e) {
            return false;
        }
        return !Files.exists(dir);
    }

    /**
     * 生成新 id：{@code <名字里的 ASCII 片段>_<8 位随机十六进制>}。
     *
     * <p>每次都新生成（不复用旧 id）：{@code /assets/**} 有 1 小时浏览器缓存，
     * 复用旧 id 会让编辑器一直播到上一版帧图。
     */
    public static String newId(String name) {
        String slug = (name == null ? "" : name)
                .toLowerCase()
                .replaceAll("[^a-z0-9_-]+", "-")
                .replaceAll("^-+|-+$", "");
        if (slug.length() > 40) {
            slug = slug.substring(0, 40);
        }
        if (slug.isEmpty()) {
            slug = "clip";
        }
        String suffix = Long.toHexString(System.nanoTime() & 0xFFFFFFFFL);
        // 补足 8 位，保证形状稳定（便于人眼识别与 grep）
        while (suffix.length() < 8) {
            suffix = "0" + suffix;
        }
        String id = slug + "_" + suffix;
        // 极端情况下撞名：再加一层随机，绝不覆盖已有素材
        while (Files.exists(root().resolve(id))) {
            id = slug + "_" + Long.toHexString(System.nanoTime() & 0xFFFFFFFFL);
        }
        return id;
    }
}
