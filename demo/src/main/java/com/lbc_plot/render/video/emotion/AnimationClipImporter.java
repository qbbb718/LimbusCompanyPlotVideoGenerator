package com.lbc_plot.render.video.emotion;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.lbc_plot.common.util.io.ImageReader;
import com.lbc_plot.render.video.anim.AnimationClipAsset;

/**
 * @module 情绪动画素材导入器
 * 把「一批图片 / 一个 zip」变成 {@code assets/animation-clips/<id>/} 下的一套素材。
 *
 * <h2>为什么导入时要重编码成 PNG 并统一画布</h2>
 * <ul>
 *   <li><b>统一画布</b>：各帧尺寸不一致时，若按各自尺寸绘制，元素会逐帧跳大小/跳位置。
 *       导入时把每帧**居中贴到"最大宽×最大高"的透明画布**上，之后渲染端就能假设
 *       "所有帧同尺寸"，几何永远稳定。</li>
 *   <li><b>统一 PNG</b>：JPG 没有 alpha 通道，混在一起会让"有些帧能透出背景、有些不透"；
 *       统一重编码后格式一致，也顺手把"用户把 WebP 改名成 .png"这类情况解掉
 *       （解码走 {@link ImageReader}，WebP 有 FFmpeg 兜底）。</li>
 * </ul>
 *
 * <h2>原子落盘</h2>
 * 先写 {@code .importing-<uuid>/}，全部校验通过后才改名成正式 id 目录。
 * 直接写目标目录的话，中途失败会在素材库里留半个素材，而列表逻辑只看目录存在 ——
 * 那个坏素材会被永远列出来，用户删了还会"又出现"。
 *
 * <h2>为什么"per-frame hold"在这一层落地</h2>
 * 导入只负责把帧排好序、各给 1 帧；"第 i 张停几帧"是用户在面板上调的。
 * 这样导入器不需要理解 fps / 时长，也就不会出现"导入时按 12fps 重采样、后来用户又改成 3 帧一张"的错乱。
 *
 * <h2>一个 zip 里装多套 {@code .lcaf}（整包导入）</h2>
 * 用户之间分享动画时，常见做法是把好几套 {@code .lcaf} 放进一个 zip 再发出来。
 * {@link #importZipAuto} 会先扫条目名判断这是"单套图片序列"还是"整包"，
 * 整包走 {@link #importBundle}：每个 {@code .lcaf} 各导成一套素材，坏的那几套只记失败、不影响其它。
 *
 * <h2>条目名的编码要容错</h2>
 * zip 里的文件名只是字节串，UTF-8 是可选标记；中文 Windows 打出来的包往往是 GBK 且不带标记，
 * 而 {@link ZipInputStream} 默认按 UTF-8 解码会直接抛异常。所以一切读取都先经 {@link #scanZip}
 * 定下字符集（UTF-8 → GBK → Cp437，见 {@link #ZIP_NAME_CHARSETS}）——否则用户拿到的整包
 * 只会得到一个"malformed input off : 0, length : 1"。
 */
@Service
public class AnimationClipImporter {

    private static final Logger logger = LoggerFactory.getLogger(AnimationClipImporter.class);

    /** 帧数上限（240 帧 = 8 秒 @1 帧/张，已远超"贴脸特效"的实际需要） */
    public static final int MAX_FRAMES = 240;

    /** 总时长上限（帧）。判定在面板上改 frameHolds 之后也成立 */
    public static final int MAX_TOTAL_FRAMES = 900;

    /** 画布单边上限（4K 导出时素材会被放大 2 倍，2048 已够） */
    public static final int MAX_CANVAS_SIDE = 2048;

    /** 允许的输入图片后缀（决策：v1 只收图片序列，不收 GIF/MP4） */
    private static final List<String> IMAGE_EXTENSIONS = List.of("png", "jpg", "jpeg", "webp", "bmp");

    /** 动画包后缀（本功能导出的单套动画文件；本质是 zip） */
    public static final String CLIP_PACK_EXTENSION = ".lcaf";

    /** 一个"整包"（zip 里装多套 {@code .lcaf}）最多几套（防呆：误选一个几十 GB 的包不至于把磁盘塞满） */
    public static final int MAX_BUNDLE_CLIPS = 200;

    /** 一个 zip 最多扫多少条目（帧数上限的 4 倍，与单套导入的守卫同一个尺度） */
    private static final int MAX_ZIP_ENTRIES = MAX_FRAMES * 4;

    /**
     * 条目名按哪些字符集去试（顺序有意义）。
     *
     * <p>zip 规范里文件名只是一串字节，UTF-8 是**可选标记**（EFS / 0x0800）：
     * 中文 Windows 的「压缩文件夹」与不少打包工具不打这个标记，直接按系统 OEM 代码页写（GBK）。
     * 所以先按标准的 UTF-8 试，解不出来再按 GBK，最后 Cp437（单字节字符集，对任意字节都能解，
     * 兜底保证不会因为一个怪名字让整包导不进来——名字只是提示文案，素材名来自包里的 clip.json）。
     */
    private static final List<Charset> ZIP_NAME_CHARSETS = buildNameCharsets();

    /** 临时导入目录前缀（以 . 开头 → 不会被 {@link AnimationClipStore#list} 当成素材） */
    private static final String TEMP_PREFIX = ".importing-";

    /**
     * 导入结果。
     *
     * @param asset    落盘后的素材元数据
     * @param warnings 非致命的提示（如"帧尺寸不一致，已统一到 600×600"），界面可以直接显示
     */
    public record ImportResult(AnimationClipAsset asset, List<String> warnings) {
    }

    /** 等价于 {@code importImages(files, name, true, 0)}：开启自动推算、用默认上限 */
    public ImportResult importImages(List<MultipartFile> files, String name) throws IOException {
        return importImages(files, name, true, FrameHoldInference.DEFAULT_MAX_GAP_FRAMES);
    }

    /**
     * 从一批图片导入。
     *
     * @param files        上传的图片（顺序不重要，内部按文件名**自然排序**）
     * @param name         素材名；空则从文件名推导
     * @param inferHolds   是否按文件名编号自动推算每帧持续帧数（缺省开）
     * @param maxGapFrames 单张时长上限（≤0 用默认 {@link FrameHoldInference#DEFAULT_MAX_GAP_FRAMES}）
     * @throws IllegalArgumentException 校验不通过（消息是给用户看的中文原因）
     */
    public ImportResult importImages(List<MultipartFile> files, String name, boolean inferHolds,
            int maxGapFrames) throws IOException {
        if (files == null || files.isEmpty()) {
            throw new IllegalArgumentException("没有选择任何图片");
        }
        if (files.size() > MAX_FRAMES) {
            throw new IllegalArgumentException(
                    "帧数超过上限：当前 " + files.size() + " 张，最多 " + MAX_FRAMES + " 张");
        }

        // 按文件名自然排序：xxx_9.png 要排在 xxx_10.png 前面（字典序会反过来）
        List<MultipartFile> ordered = new ArrayList<>(files);
        ordered.sort(Comparator.comparing(file -> naturalKey(file.getOriginalFilename())));

        String resolvedName = resolveName(name, ordered.get(0).getOriginalFilename());
        Path temp = createTempDir();

        try {
            // 1) 逐个解码（一次性只留两张图在内存里：源图 + 画布）
            List<BufferedImage> frames = new ArrayList<>(ordered.size());
            try {
                for (int i = 0; i < ordered.size(); i++) {
                    MultipartFile file = ordered.get(i);
                    BufferedImage decoded = decode(file, i);
                    if (decoded == null) {
                        throw new IllegalArgumentException(
                                "第 " + (i + 1) + " 张图解不出画面：" + safeName(file));
                    }
                    frames.add(decoded);
                }

                // 2) 公共画布
                int canvasWidth = 0;
                int canvasHeight = 0;
                boolean mixedSizes = false;
                for (BufferedImage frame : frames) {
                    canvasWidth = Math.max(canvasWidth, frame.getWidth());
                    canvasHeight = Math.max(canvasHeight, frame.getHeight());
                }
                for (BufferedImage frame : frames) {
                    if (frame.getWidth() != canvasWidth || frame.getHeight() != canvasHeight) {
                        mixedSizes = true;
                        break;
                    }
                }
                if (canvasWidth > MAX_CANVAS_SIDE || canvasHeight > MAX_CANVAS_SIDE) {
                    throw new IllegalArgumentException(
                            "单边像素超过上限：当前 " + canvasWidth + "×" + canvasHeight
                                    + "，最多 " + MAX_CANVAS_SIDE + "×" + MAX_CANVAS_SIDE);
                }

                List<String> warnings = new ArrayList<>();
                if (mixedSizes) {
                    warnings.add("各帧尺寸不一致，已统一居中贴到 " + canvasWidth + "×" + canvasHeight + " 的透明画布上");
                }

                // 每帧持续帧数：能从文件名编号推出来就推（用户可在面板上逐张改）
                List<Integer> holds = resolveHolds(
                        ordered.stream().map(MultipartFile::getOriginalFilename).toList(),
                        frames.size(), inferHolds, maxGapFrames, warnings);

                // 3) 重编码进临时目录
                writeFrames(temp, frames, canvasWidth, canvasHeight);
                return finish(temp, resolvedName, canvasWidth, canvasHeight,
                        holds, frames.size(), warnings, null);
            } finally {
                // 尽早释放解码结果（240 张 600×600 是 ~340MB，不能留到 GC 才回收）
                frames.clear();
            }
        } catch (IOException | RuntimeException e) {
            deleteQuietly(temp);
            throw e;
        }
    }

    /** 等价于 {@code importZip(file, name, true, 0)}：开启自动推算、用默认上限 */
    public ImportResult importZip(MultipartFile zipFile, String name) throws IOException {
        return importZip(zipFile, name, true, FrameHoldInference.DEFAULT_MAX_GAP_FRAMES);
    }

    /**
     * 从 zip 导入（内含 PNG/JPG 序列；也能直接吃"导出的 .lcaf 包"）。
     *
     * @param inferHolds   包里没带时序时，是否按文件名编号自动推算（带时序的包以包里的为准）
     * @param maxGapFrames 单张时长上限（≤0 用默认值）
     * @throws IllegalArgumentException 校验不通过
     */
    public ImportResult importZip(MultipartFile zipFile, String name, boolean inferHolds,
            int maxGapFrames) throws IOException {
        if (zipFile == null || zipFile.isEmpty()) {
            throw new IllegalArgumentException("压缩包是空的");
        }
        Charset charset = scanZip(zipFile::getInputStream).charset();
        return importZipStream(zipFile::getInputStream, charset, name, inferHolds, maxGapFrames);
    }

    /**
     * @function 从磁盘上的 zip / {@code .lcaf} 导入
     *
     * <p>给两类调用方用：① "全部资源"包里的 {@code animation-clips/*.lcaf}（已经在磁盘上，
     * 没必要再包一层 MultipartFile）；② 想把导入做在服务端、不想把字节流搬过 HTTP 的场景。
     * 语义与 {@link #importZip(MultipartFile, String, boolean, int)} **完全一致**。
     */
    public ImportResult importZip(Path zipFile, String name, boolean inferHolds, int maxGapFrames)
            throws IOException {
        if (zipFile == null || !Files.isRegularFile(zipFile)) {
            throw new IllegalArgumentException("找不到压缩包文件：" + zipFile);
        }
        Charset charset = scanZip(() -> Files.newInputStream(zipFile)).charset();
        return importZipStream(() -> Files.newInputStream(zipFile), charset, name, inferHolds,
                maxGapFrames);
    }

    /**
     * 一次 zip 导入的结果。
     *
     * @param imported 成功进来的每一套（单套 zip 就是长度 1；顺序 = 包里的顺序）
     * @param failures 逐条失败原因，形如 {@code 动画「坏的.lcaf」导入失败：…}；
     *                 单套包失败会直接抛异常，只有整包才会把坏的那几套收在这里
     * @param warnings 整包层面的提示（包里被忽略的图片、还有其它资源、以及每套自己的导入提示）
     */
    public record ZipImportOutcome(List<ImportResult> imported, List<String> failures,
            List<String> warnings) {

        /** 最后导入的那套（界面默认选中它；一套都没进来时为 {@code null}） */
        public ImportResult last() {
            return imported == null || imported.isEmpty() ? null : imported.get(imported.size() - 1);
        }

        /** 本次一共进来几套 */
        public int count() {
            return imported == null ? 0 : imported.size();
        }
    }

    /**
     * @function 导入一个 zip：可能是"一套图片序列"，也可能是"整包多套动画"
     *
     * <p>为什么入口要自动判断，而不是让用户先选"导入单套 / 导入整包"：{@code .lcaf} 本身就是
     * zip，用户手里那个文件到底装的是帧图还是好几套 {@code .lcaf}，只有打开看才知道。判断规则
     * 只有一条：**包里只要有一个 {@code .lcaf} 条目，它就是"整包"**——导出的单套动画里只有
     * {@code clip.json} 与 {@code frames/*.png}，绝不会再套一个 {@code .lcaf}；而普通图片序列
     * zip 里不会出现 {@code .lcaf}。
     *
     * @param name 素材名：只在"单套"时有意义；整包里每套的名字来自它自己的 {@code clip.json}
     * @return 成功导入的每一套 + 逐条失败原因（整包里有坏的几套不影响其它）
     */
    public ZipImportOutcome importZipAuto(MultipartFile zipFile, String name, boolean inferHolds,
            int maxGapFrames) throws IOException {
        if (zipFile == null || zipFile.isEmpty()) {
            throw new IllegalArgumentException("压缩包是空的");
        }
        // 先扫一遍条目名（只读条目名，不解码图片）：这一步同时定下"单套还是整包"与名字的字符集
        ZipScan scan = scanZip(zipFile::getInputStream);
        if (scan.clipEntries().isEmpty()) {
            return new ZipImportOutcome(
                    List.of(importZipStream(zipFile::getInputStream, scan.charset(), name, inferHolds,
                            maxGapFrames)),
                    List.of(), List.of());
        }
        return importBundle(zipFile, scan, inferHolds, maxGapFrames);
    }

    /**
     * @function 整包导入：zip 里装着多个 {@code .lcaf}，每套各成一个素材
     *
     * <p>做法与"全部资源"包里的 {@code animation-clips/*.lcaf} 完全一致：每个 {@code .lcaf}
     * 解到临时文件，再交给 {@link #importZip(Path, String, boolean, int)}——同一条导入链路，
     * 所以每帧时长、播放参数、缩略图摆放都会原样还原。
     *
     * <p>两件必须做对的事：
     * <ul>
     *   <li><b>先全解出来再逐套导入</b>：边读外层 zip 边导入，两套 zip 流会互相干扰；</li>
     *   <li><b>单套失败不打断整包</b>：坏的那套进 {@code failures}（带上包里的文件名），
     *       其余照常进库——用户拿到的"整包"来自别人的机器，有一套坏了很正常。</li>
     * </ul>
     */
    private ZipImportOutcome importBundle(MultipartFile zipFile, ZipScan scan, boolean inferHolds,
            int maxGapFrames) throws IOException {
        List<String> entries = scan.clipEntries();
        Path temp = createTempDir();
        List<Path> extracted = new ArrayList<>(entries.size());
        List<String> warnings = new ArrayList<>();
        boolean ignoredImages = false;
        boolean otherResources = false;

        try {
            try (InputStream raw = zipFile.getInputStream();
                    ZipInputStream zip = new ZipInputStream(raw, scan.charset())) {
                ZipEntry entry;
                int guard = 0;
                while ((entry = zip.getNextEntry()) != null) {
                    if (++guard > MAX_ZIP_ENTRIES) {
                        throw new IllegalArgumentException("压缩包里文件太多，疑似不是动画素材包");
                    }
                    if (entry.isDirectory()) {
                        continue;
                    }
                    String entryName = entry.getName();
                    if (isClipPackEntry(entryName)) {
                        // 文件名只用于临时落盘（序号，不含用户输入），避免同名条目互相覆盖
                        Path target = temp.resolve(
                                "pack-" + (extracted.size() + 1) + CLIP_PACK_EXTENSION);
                        Files.copy(zip, target, StandardCopyOption.REPLACE_EXISTING);
                        extracted.add(target);
                        continue;
                    }
                    // 顺带看看包里还装了什么：用户选错文件时下面好给一句"该用哪个按钮"
                    ignoredImages |= isImageName(entryName);
                    otherResources |= isOtherResourceEntry(entryName);
                }
            }

            List<ImportResult> imported = new ArrayList<>(extracted.size());
            List<String> failures = new ArrayList<>();
            for (int i = 0; i < extracted.size(); i++) {
                String label = baseName(entries.get(i));
                try {
                    ImportResult result = importZip(extracted.get(i), null, inferHolds, maxGapFrames);
                    imported.add(result);
                    // 多套时提示必须说清是哪一套：否则"各帧尺寸不一致"根本不知道指谁
                    for (String warning : result.warnings()) {
                        warnings.add("「" + result.asset().getName() + "」" + warning);
                    }
                } catch (IOException | RuntimeException e) {
                    String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                    logger.warn("整包导入动画失败: {} ({})", label, reason);
                    failures.add("动画「" + label + "」导入失败：" + reason);
                }
            }
            if (ignoredImages) {
                warnings.add("包里还有图片，已忽略（整包按 .lcaf 逐套导入）");
            }
            if (otherResources) {
                warnings.add("包里还有角色 / 背景 / 音频，本次只导入了动画；"
                        + "要一次迁移整库请用页面顶部的「导入全部资源」");
            }
            logger.info("整包导入动画完成: {} 套成功 / {} 套失败（包内 {} 个 .lcaf）",
                    imported.size(), failures.size(), entries.size());
            return new ZipImportOutcome(imported, failures, warnings);
        } finally {
            // 解出来的 .lcaf 只是中间产物：素材已经落到正式目录，这里必须全部清掉
            deleteQuietly(temp);
        }
    }

    /** 一个 zip 的"条目名扫描"结果：名字用什么字符集解得开 + 包里那些 {@code .lcaf} 条目 */
    private record ZipScan(Charset charset, List<String> clipEntries) {
    }

    /**
     * @function 扫一遍条目名：猜出名字用的是什么字符集，并收集所有 {@code .lcaf} 条目
     *
     * <p>为什么要猜字符集：见 {@link #ZIP_NAME_CHARSETS}。这一步只读条目名、不碰内容，
     * 所以试错是**无副作用**的：先定下字符集，后面的导入/解包就只剩一种解码方式，
     * 不会出现"导到一半才发现名字解不出来、前面几套已经落盘"的烂摊子。
     *
     * @return 字符集 + 包内的 {@code .lcaf} 条目（顺序沿用 zip 里的顺序，保证结果可复现）
     */
    private static ZipScan scanZip(ZipStreamSource source) throws IOException {
        for (Charset charset : ZIP_NAME_CHARSETS) {
            List<String> entries = new ArrayList<>();
            try (InputStream raw = source.open();
                    ZipInputStream zip = new ZipInputStream(raw, charset)) {
                ZipEntry entry;
                int guard = 0;
                while ((entry = zip.getNextEntry()) != null) {
                    if (++guard > MAX_ZIP_ENTRIES) {
                        throw new IllegalArgumentException("压缩包里文件太多，疑似不是动画素材包");
                    }
                    if (entry.isDirectory()) {
                        continue;
                    }
                    if (isClipPackEntry(entry.getName())) {
                        if (entries.size() >= MAX_BUNDLE_CLIPS) {
                            throw new IllegalArgumentException(
                                    "压缩包里的动画太多：一次最多导入 " + MAX_BUNDLE_CLIPS + " 套");
                        }
                        entries.add(entry.getName());
                    }
                }
                return new ZipScan(charset, entries);
            } catch (IllegalArgumentException e) {
                // 只有"条目名解码不出来"才值得换下一个字符集；其它校验错误（文件太多等）直接抛
                if (!isMalformedEntryName(e)) {
                    throw e;
                }
                logger.debug("压缩包条目名按 {} 解不出来，换下一个字符集：{}", charset, e.getMessage());
            }
        }
        // 最后一个候选是 Cp437（对任意字节都能解），正常走不到这里
        throw new IllegalArgumentException("压缩包里的文件名解不出来（编码不受支持）");
    }

    /** 按候选顺序挑能用的字符集（个别 JRE 没有 GBK / Cp437 时跳过，不让类加载失败） */
    private static List<Charset> buildNameCharsets() {
        List<Charset> candidates = new ArrayList<>();
        candidates.add(StandardCharsets.UTF_8);
        for (String name : new String[] { "GBK", "Cp437" }) {
            try {
                candidates.add(Charset.forName(name));
            } catch (RuntimeException ignored) {
                // 该 JRE 不带这个字符集：跳过，靠后面的兜底
            }
        }
        return List.copyOf(candidates);
    }

    /**
     * 这个异常是不是"条目名按当前字符集解不出来"。
     *
     * <p>{@code ZipCoder} 在解码失败时扔的是 `new IllegalArgumentException(coderResult.toString())`，
     * 消息形如 {@code malformed input off : 0, length : 1}、{@code unmappable character …}，
     * **没有 cause**（JDK 9 起），所以只能看消息里的这两个词。
     */
    private static boolean isMalformedEntryName(IllegalArgumentException error) {
        String message = error.getMessage();
        if (message == null) {
            return false;
        }
        String lower = message.toLowerCase(Locale.ROOT);
        return lower.contains("malformed input") || lower.contains("unmappable character");
    }

    /** 条目名是不是一个动画包（后缀 {@code .lcaf}，大小写不敏感；放在子目录里也算） */
    private static boolean isClipPackEntry(String entryName) {
        return entryName != null
                && entryName.toLowerCase(Locale.ROOT).endsWith(CLIP_PACK_EXTENSION);
    }

    /** 条目是不是"其它资源"（用户可能选成了「全部资源」包，给一句该用哪个按钮的提示） */
    private static boolean isOtherResourceEntry(String entryName) {
        String lower = entryName.replace('\\', '/').toLowerCase(Locale.ROOT);
        return lower.equals("characters.json") || lower.equals("backgrounds.json")
                || lower.equals("audios.json")
                || lower.startsWith("characters/") || lower.startsWith("backgrounds/")
                || lower.startsWith("audios/");
    }

    /**
     * 打开 zip 字节流的来源（MultipartFile 与磁盘文件各一个实现）。
     *
     * <p>每次调用要返回一个**新的**输入流：同一个包会被读两遍（第一遍只解条目名，
     * 见 {@link #scanZip}；第二遍才真读内容），所以这里不能是"一次性"的流。
     */
    @FunctionalInterface
    private interface ZipStreamSource {
        InputStream open() throws IOException;
    }

    /**
     * 从 zip 导入：真正干活的地方（上面几个入口只负责把"字节从哪来、名字按什么字符集解"给我）。
     *
     * @param source  每次调用返回一个**新的**输入流（只会被调用一次）
     * @param charset 条目名的字符集（由 {@link #scanZip} 定好，见 {@link #ZIP_NAME_CHARSETS}）
     */
    private ImportResult importZipStream(ZipStreamSource source, Charset charset, String name,
            boolean inferHolds, int maxGapFrames) throws IOException {
        Path temp = createTempDir();
        Path extractDir = temp.resolve("extract");
        Files.createDirectories(extractDir);

        try {
            List<Path> extracted = new ArrayList<>();
            /** 包里若带 clip.json（就是本功能导出的 .lcaf），用它还原"每张图持续几帧" */
            AnimationClipAsset packaged = null;
            try (InputStream raw = source.open();
                    ZipInputStream zip = new ZipInputStream(raw, charset)) {
                ZipEntry entry;
                int guard = 0;
                while ((entry = zip.getNextEntry()) != null) {
                    if (++guard > MAX_ZIP_ENTRIES) {
                        throw new IllegalArgumentException("压缩包里文件太多，疑似不是动画素材包");
                    }
                    if (entry.isDirectory()) {
                        continue;
                    }
                    String entryName = entry.getName();
                    if (AnimationClipStore.INDEX_FILE.equalsIgnoreCase(baseName(entryName))) {
                        // 元数据先记下来；读不出来就当没有（不阻断导入）
                        packaged = readPackagedIndex(zip);
                        continue;
                    }
                    if (!isImageName(entryName)) {
                        // 说明文件等一律忽略：帧的顺序以文件名自然排序为准
                        continue;
                    }
                    // 只取文件名，丢掉目录层级：防止 ../ 穿越
                    String fileName = baseName(entryName);
                    validateFrameFileName(fileName);
                    Path target = extractDir.resolve(fileName);
                    Files.copy(zip, target, StandardCopyOption.REPLACE_EXISTING);
                    extracted.add(target);
                }
            }
            if (extracted.isEmpty()) {
                throw new IllegalArgumentException("压缩包里没有找到图片（需要 PNG/JPG 序列）");
            }
            if (extracted.size() > MAX_FRAMES) {
                throw new IllegalArgumentException(
                        "帧数超过上限：当前 " + extracted.size() + " 张，最多 " + MAX_FRAMES + " 张");
            }

            extracted.sort(Comparator.comparing(path -> naturalKey(path.getFileName().toString())));

            List<BufferedImage> frames = new ArrayList<>(extracted.size());
            for (int i = 0; i < extracted.size(); i++) {
                BufferedImage decoded;
                try {
                    decoded = ImageReader.readImageFile(extracted.get(i).toFile());
                } catch (IOException e) {
                    decoded = null;
                }
                if (decoded == null) {
                    throw new IllegalArgumentException(
                            "第 " + (i + 1) + " 张图解不出画面：" + extracted.get(i).getFileName());
                }
                frames.add(decoded);
            }

            int canvasWidth = 0;
            int canvasHeight = 0;
            boolean mixedSizes = false;
            for (BufferedImage frame : frames) {
                canvasWidth = Math.max(canvasWidth, frame.getWidth());
                canvasHeight = Math.max(canvasHeight, frame.getHeight());
            }
            for (BufferedImage frame : frames) {
                if (frame.getWidth() != canvasWidth || frame.getHeight() != canvasHeight) {
                    mixedSizes = true;
                    break;
                }
            }
            if (canvasWidth > MAX_CANVAS_SIDE || canvasHeight > MAX_CANVAS_SIDE) {
                throw new IllegalArgumentException(
                        "单边像素超过上限：当前 " + canvasWidth + "×" + canvasHeight
                                + "，最多 " + MAX_CANVAS_SIDE + "×" + MAX_CANVAS_SIDE);
            }

            String resolvedName = resolveName(
                    name != null && !name.trim().isEmpty() ? name
                            : (packaged != null ? packaged.getName() : null),
                    extracted.get(0).getFileName().toString());
            List<String> warnings = new ArrayList<>();
            if (mixedSizes) {
                warnings.add("各帧尺寸不一致，已统一居中贴到 " + canvasWidth + "×" + canvasHeight + " 的透明画布上");
            }
            List<Integer> holds = packagedHoldsOrDefault(packaged, frames.size(), warnings);
            // 包里没带时序（普通图片序列 zip）时才按文件名编号推算；包自带时序时以包为准
            if (holds == null) {
                holds = resolveHolds(
                        extracted.stream().map(path -> path.getFileName().toString()).toList(),
                        frames.size(), inferHolds, maxGapFrames, warnings);
            }
            writeFrames(temp, frames, canvasWidth, canvasHeight);
            int frameCount = frames.size();
            frames.clear();
            return finish(temp, resolvedName, canvasWidth, canvasHeight, holds, frameCount, warnings,
                    packaged);
        } catch (IOException | RuntimeException e) {
            deleteQuietly(temp);
            throw e;
        }
    }

    /* ==================== 内部实现 ==================== */

    /** 把解码好的帧居中贴到公共画布上并写成 PNG */
    private void writeFrames(Path temp, List<BufferedImage> frames, int canvasWidth, int canvasHeight)
            throws IOException {
        Path framesDir = temp.resolve(AnimationClipStore.FRAMES_DIR);
        Files.createDirectories(framesDir);
        int index = 0;
        for (BufferedImage frame : frames) {
            BufferedImage canvas = new BufferedImage(canvasWidth, canvasHeight, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = canvas.createGraphics();
            try {
                int x = (canvasWidth - frame.getWidth()) / 2;
                int y = (canvasHeight - frame.getHeight()) / 2;
                g.drawImage(frame, x, y, null);
            } finally {
                g.dispose();
            }
            Path out = framesDir.resolve(String.format("%04d" + AnimationClipStore.FRAME_EXTENSION, index + 1));
            if (!ImageIO.write(canvas, "png", out.toFile())) {
                throw new IOException("写不出 PNG 帧：" + out.getFileName());
            }
            index++;
        }
    }

    /**
     * 写 clip.json + 原子改名成正式目录。
     *
     * @param packaged 包里自带的 clip.json（只有 zip 导入时非 null）：
     *                 播放参数与代表帧摆放**必须一并还原**，否则"导出再导入"会静默丢配置
     *                 ——而那段配置恰恰是用户在资源管理里辛辛苦苦拖出来的
     */
    private ImportResult finish(Path temp, String name, int canvasWidth, int canvasHeight,
            List<Integer> holds, int frameCount, List<String> warnings, AnimationClipAsset packaged)
            throws IOException {
        AnimationClipAsset asset = new AnimationClipAsset();
        asset.setId(AnimationClipStore.newId(name));
        asset.setName(name);
        asset.setCanvasWidth(canvasWidth);
        asset.setCanvasHeight(canvasHeight);
        asset.setFps(30);
        asset.setCreatedAt(System.currentTimeMillis());
        asset.setFrameHolds(holds);
        if (packaged != null) {
            copyPresentation(packaged, asset, frameCount);
        }

        AnimationClipStore.writeIndex(temp, asset);

        Path target = AnimationClipStore.clipDir(asset.getId());
        Files.createDirectories(target.getParent());
        try {
            Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException atomicFailed) {
            // 跨卷 / 文件系统不支持原子改名时退回普通移动（仍保证"要么整个在、要么整个不在"）
            Files.move(temp, target);
        }
        logger.info("情绪动画素材导入完成: id={}, name={}, frames={}, canvas={}x{}",
                asset.getId(), name, frameCount, canvasWidth, canvasHeight);
        return new ImportResult(asset, warnings);
    }

    /**
     * 把包里带的播放参数与代表帧摆放拷进新素材。
     *
     * <p>代表帧的序号要**重新夹到新素材的帧数范围内**：包里的图可能比配置多/少（用户删过帧），
     * 直接照抄会指向不存在的帧，渲染端拿到 -1 就什么都不画。
     */
    private static void copyPresentation(AnimationClipAsset packaged, AnimationClipAsset target,
            int frameCount) {
        if (packaged.getLoop() != null && !packaged.getLoop().isBlank()) {
            target.setLoop(packaged.getLoop().trim().toLowerCase());
        }
        target.setIterations(packaged.getIterations());
        target.setStartFrame(Math.max(0, packaged.getStartFrame()));
        target.setFadeInFrames(Math.max(0, packaged.getFadeInFrames()));
        target.setFadeOutFrames(Math.max(0, packaged.getFadeOutFrames()));
        float opacity = packaged.getOpacity();
        target.setOpacity(Float.isFinite(opacity) ? Math.min(1f, Math.max(0f, opacity)) : 1f);

        AnimationClipAsset.Poster poster = packaged.getPoster();
        if (poster != null) {
            int maxFrame = Math.max(0, frameCount - 1);
            target.setPoster(new AnimationClipAsset.Poster(
                    Math.min(Math.max(0, poster.getFrame()), maxFrame),
                    poster.safeOffsetX(),
                    poster.safeOffsetY(),
                    poster.safeScale()));
        }
    }

    /** 解析包里的 clip.json；读不出来就当没有（包损坏也不该阻断导入） */
    private static AnimationClipAsset readPackagedIndex(ZipInputStream zip) {
        try {
            // clip.json 很小；限制读取量，避免恶意 zip 用一个超大条目撑爆内存
            byte[] bytes = zip.readNBytes(1024 * 1024);
            AnimationClipAsset asset = new com.fasterxml.jackson.databind.ObjectMapper()
                    .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                            false)
                    .readValue(bytes, AnimationClipAsset.class);
            if (asset == null || asset.getFrameHolds() == null || asset.getFrameHolds().isEmpty()) {
                return null;
            }
            // 只认自己写出去的格式：随便一个 zip 里恰好有个同名 clip.json 时不许影响时序
            if (asset.getKind() != null && !AnimationClipAsset.KIND.equalsIgnoreCase(asset.getKind())) {
                return null;
            }
            return asset;
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /**
     * 包里带时序就用包的。
     *
     * @return 包里的时序（已收敛）；**没有可用的包内时序时返回 {@code null}**，
     *         让调用方决定"按文件名编号推算"还是"全 1 帧"——两条路都要给出提示
     */
    private static List<Integer> packagedHoldsOrDefault(AnimationClipAsset packaged, int frameCount,
            List<String> warnings) {
        if (packaged == null || packaged.getFrameHolds() == null) {
            return null;
        }
        if (packaged.getFrameHolds().size() != frameCount) {
            warnings.add("包里的每帧时长与图片数量不匹配，已按默认时长导入");
            return null;
        }
        List<Integer> holds = new ArrayList<>(frameCount);
        for (Integer hold : packaged.getFrameHolds()) {
            holds.add(hold == null ? 1 : Math.max(1, hold));
        }
        if (!isTotalFramesWithinLimit(holds)) {
            warnings.add("包里的总时长超过上限，已按默认时长导入");
            return null;
        }
        return holds;
    }

    /**
     * 决定每帧的持续帧数：能按文件名编号推就推，否则全用默认值。
     *
     * <p>推算失败/关闭时**不报错、不阻断**，只是保持"每张 1 帧"的老行为。
     * 提示交给 {@link FrameHoldInference} 产生（它只在"本该能推、但数据有问题"时才说话）。
     */
    private static List<Integer> resolveHolds(List<String> fileNames, int frameCount, boolean inferHolds,
            int maxGapFrames, List<String> warnings) {
        if (!inferHolds) {
            return defaultHolds(frameCount);
        }
        FrameHoldInference.Result result = FrameHoldInference.infer(
                fileNames, 1, maxGapFrames, MAX_TOTAL_FRAMES);
        warnings.addAll(result.warnings());
        List<Integer> holds = result.holds();
        // 数量必须与图片数一致，否则说明调用方给的名单不对（防御性回退）
        return holds.size() == frameCount ? holds : defaultHolds(frameCount);
    }

    private static List<Integer> defaultHolds(int frameCount) {
        List<Integer> holds = new ArrayList<>(frameCount);
        for (int i = 0; i < frameCount; i++) {
            holds.add(1);
        }
        return holds;
    }

    private Path createTempDir() throws IOException {
        Path root = AnimationClipStore.root();
        Files.createDirectories(root);
        return Files.createDirectories(root.resolve(TEMP_PREFIX + UUID.randomUUID()));
    }

    private static void deleteQuietly(Path dir) {
        if (dir == null || !Files.exists(dir)) {
            return;
        }
        try (var walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                    // 尽力而为
                }
            });
        } catch (IOException e) {
            logger.warn("清理导入临时目录失败: {}", dir, e);
        }
    }

    private static BufferedImage decode(MultipartFile file, int index) throws IOException {
        // 先落到临时文件再解码：ImageReader 认文件、且 WebP 走 FFmpeg 兜底时需要真实路径
        Path scratch = Files.createTempFile("lbc-anim-frame-" + index + "-", ".img");
        try {
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, scratch, StandardCopyOption.REPLACE_EXISTING);
            }
            try {
                return ImageReader.readImageFile(scratch.toFile());
            } catch (IOException decodeFailed) {
                // 解码失败返回 null，由调用方统一转成"第 N 张图解不出画面"这种能给用户看的话；
                // 直接抛的话会变成 500 + 一长串栈，用户完全不知道该怎么办
                logger.debug("第 {} 张图解码失败: {}", index + 1, decodeFailed.getMessage());
                return null;
            }
        } finally {
            try {
                Files.deleteIfExists(scratch);
            } catch (IOException ignored) {
                // 临时文件删不掉不影响导入
            }
        }
    }

    private static boolean isImageName(String name) {
        int dot = name == null ? -1 : name.lastIndexOf('.');
        if (dot < 0) {
            return false;
        }
        return IMAGE_EXTENSIONS.contains(name.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    /** zip 里的文件名只保留最后一段，并拒绝控制字符等怪东西 */
    private static String baseName(String entryName) {
        String normalized = entryName.replace('\\', '/');
        int slash = normalized.lastIndexOf('/');
        return slash >= 0 ? normalized.substring(slash + 1) : normalized;
    }

    private static void validateFrameFileName(String fileName) {
        if (fileName.isEmpty() || fileName.contains("..") || fileName.contains("/")
                || fileName.contains("\\") || fileName.contains(":")) {
            throw new IllegalArgumentException("压缩包里有非法文件名：" + fileName);
        }
    }

    private static String resolveName(String explicit, String firstFileName) {
        if (explicit != null && !explicit.trim().isEmpty()) {
            return explicit.trim();
        }
        String fileName = firstFileName == null || firstFileName.isBlank() ? "clip" : firstFileName;
        String base = stripExtension(fileName);
        // AE 导出的 xxx_00000 / xxx00000 → 去掉尾部数字，别让素材名变成 "xxx 00000"
        String trimmed = base.replaceAll("[_\\-\\s]*\\d+$", "").trim();
        return trimmed.isEmpty() ? base : trimmed;
    }

    private static String stripExtension(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }

    private static String safeName(MultipartFile file) {
        String name = file == null ? null : file.getOriginalFilename();
        return name == null || name.isBlank() ? "(未命名)" : name;
    }

    /**
     * 自然排序键：把每一段连续数字**左补零到 12 位**，其余转小写。
     *
     * <p>这样得到的仍然是一个可直接比较的字符串（不需要自定义比较器），但排序语义是"按数值"：
     * {@code frame_9.png} → {@code frame_000000000009.png}，必然排在
     * {@code frame_10.png} → {@code frame_000000000010.png} 之前。
     *
     * <p>直接用 {@code String.compareTo} 会让 {@code frame_10.png} 排在 {@code frame_9.png} 前面，
     * 用户的动画就会播到第 9 张后突然跳回第 10 张——最容易忽略、也最难排查的一类错。
     */
    static String naturalKey(String fileName) {
        if (fileName == null) {
            return "";
        }
        String lower = fileName.toLowerCase(Locale.ROOT);
        StringBuilder out = new StringBuilder(lower.length() + 16);
        int runStart = -1;
        for (int i = 0; i <= lower.length(); i++) {
            boolean digit = i < lower.length() && lower.charAt(i) >= '0' && lower.charAt(i) <= '9';
            if (digit) {
                if (runStart < 0) {
                    runStart = i;
                }
            } else if (runStart >= 0) {
                String run = lower.substring(runStart, i);
                for (int pad = run.length(); pad < 12; pad++) {
                    out.append('0');
                }
                out.append(run);
                runStart = -1;
            }
            if (!digit && i < lower.length()) {
                out.append(lower.charAt(i));
            }
        }
        return out.toString();
    }

    /** 校验 frameHolds 的总时长是否越界（面板改值时也用同一套上限） */
    public static boolean isTotalFramesWithinLimit(List<Integer> frameHolds) {
        if (frameHolds == null || frameHolds.isEmpty()) {
            return false;
        }
        int total = 0;
        for (Integer hold : frameHolds) {
            total += hold == null ? 1 : Math.max(1, hold);
            if (total > MAX_TOTAL_FRAMES) {
                return false;
            }
        }
        return true;
    }

    /** 自然排序比较器（导出给测试与调用方用） */
    public static Comparator<String> naturalComparator() {
        return Comparator.comparing(AnimationClipImporter::naturalKey);
    }
}
