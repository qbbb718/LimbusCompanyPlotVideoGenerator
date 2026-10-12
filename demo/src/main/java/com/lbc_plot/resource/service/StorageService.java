package com.lbc_plot.resource.service;

import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.common.util.io.WebpImageDecoder;
import com.lbc_plot.config.AppConfig;
import com.lbc_plot.config.StorageConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import org.springframework.util.DigestUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * 存储服务类
 * 处理文件上传、存储和访问
 */
@Service
public class StorageService implements ResourceService<org.springframework.core.io.Resource> {

    private static final Logger logger = LoggerFactory.getLogger(StorageService.class);

    @Autowired
    private StorageConfig storageConfig;

    @Autowired
    private ResourceLoader resourceLoader;

    @Autowired
    private CharacterFolderService characterFolderService;

    @Autowired
    private AppConfig appConfig;

    /**
     * 上传背景文件
     *
     * @param file     上传的文件
     * @param fileName 可选的文件名，如果不提供则使用原文件名（加时间戳避免冲突）
     * @return 相对文件路径，形如 "{背景名}_{时间戳}.{ext}" （相对于 backgrounds 目录的相对文件名，
     *         拼接 backgrounds/ 或 /assets/backgrounds/ 即可访问）
     */
    public String uploadBackgroundFile(MultipartFile file, String fileName) throws IOException {
        // 记录文件信息便于排查
        long fileSizeBytes = file.getSize();
        logger.info("StorageService 开始处理背景文件上传: 原始文件名={}, 大小={} bytes ({}.{} MB), 指定名称={}",
                file.getOriginalFilename(), fileSizeBytes,
                fileSizeBytes / (1024 * 1024), fileSizeBytes % (1024 * 1024) / 1024, fileName);

        // 验证文件
        validateFile(file);

        // 确保背景目录存在
        Path backgroundsDir = Paths.get(appConfig.getAssets().getBackgrounds());
        if (!Files.exists(backgroundsDir)) {
            Files.createDirectories(backgroundsDir);
            logger.info("创建背景目录: {}", backgroundsDir.toAbsolutePath());
        }

        // 生成文件名
        String originalFilename = file.getOriginalFilename();
        String fileExtension = getFileExtension(originalFilename);

        String uniqueFilename;
        if (fileName != null && !fileName.trim().isEmpty()) {
            // 使用提供的文件名 + 时间戳避免覆盖
            uniqueFilename = fileName + "_" + System.currentTimeMillis() + fileExtension;
        } else {
            // 从原文件名取 stem + 时间戳
            String stem = originalFilename.contains(".")
                    ? originalFilename.substring(0, originalFilename.lastIndexOf('.'))
                    : originalFilename;
            uniqueFilename = stem + "_" + System.currentTimeMillis() + fileExtension;
        }

        // 替换 Windows 非法文件名字符
        uniqueFilename = uniqueFilename.replaceAll("[\\\\/:*?\"<>|]", "_");

        Path filePath = backgroundsDir.resolve(uniqueFilename);

        // 保存文件
        Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);
        logger.info("背景文件已保存: {}", filePath.toAbsolutePath());

        // 同时生成并保存缩略图（后台不报错阻塞用户）
        if (storageConfig.isGenerateThumbnails()) {
            try {
                generateBackgroundThumbnail(file, uniqueFilename);
            } catch (Exception e) {
                logger.warn("生成背景缩略图失败（不阻塞原图上传）: {}", e.getMessage());
            }
        }

        return uniqueFilename;
    }

    /**
     * 上传背景缩略图文件（由前端裁剪/上传）
     * 保存到 backgrounds/thumbnails/ 目录，命名 thumb_{backgroundId}_{timestamp}.{ext}。
     * 删除背景目录下的文件时，可以一并清理。
     *
     * @return 前端可直接使用的 URL 路径，形如 "/assets/backgrounds/thumbnails/thumb_{bgId}_{ts}.jpg"
     */
    public String uploadBackgroundThumbnail(MultipartFile file, String backgroundId) throws IOException {
        // 验证文件
        validateThumbnailFile(file);

        // 背景缩略图目录：{backgrounds}/thumbnails/
        Path backgroundsDir = Paths.get(appConfig.getAssets().getBackgrounds());
        Path thumbnailsDir = backgroundsDir.resolve("thumbnails");
        if (!Files.exists(thumbnailsDir)) {
            Files.createDirectories(thumbnailsDir);
            logger.info("创建背景缩略图目录: {}", thumbnailsDir.toAbsolutePath());
        }

        String fileExtension = getFileExtension(file.getOriginalFilename());
        String uniqueFilename = "thumb_" + backgroundId + "_" + System.currentTimeMillis() + fileExtension;

        Path filePath = thumbnailsDir.resolve(uniqueFilename);
        Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);
        logger.info("背景缩略图已保存: {}", filePath.toAbsolutePath());

        // 返回前端可直接访问的 URL 路径
        return "/assets/backgrounds/thumbnails/" + uniqueFilename;
    }

    /**
     * 上传音频文件。
     *
     * <p>保存到运行时素材目录下的 audios（{@code {dataRoot}/assets/audios}），
     * 命名规则为 {@code {名称}_{时间戳}{扩展名}}，并返回可直接入库的 URL 路径
     * {@code /assets/audios/{文件名}}。
     *
     * <p>此前音频只有元数据接口（{@code POST /api/audios}），没有任何上传入口，
     * 前端只能把"渲染进程里拿不到的本地绝对路径"或 {@code /assets/audios/...} 这种
     * URL 当成文件路径写进数据库，结果是文件从未真正落盘、播放与导出都取不到音频。
     *
     * @param file 上传的音频文件
     * @param name 可选名称（不含扩展名）；为空时取原文件名的主干
     * @return 保存后的文件名（不含目录）
     */
    public String uploadAudioFile(MultipartFile file, String name) throws IOException {
        validateAudioFile(file);

        // 音频目录：运行时素材目录下的 audios（绝对路径，由 RuntimePaths 统一解析）
        Path audiosDir = RuntimePaths.getAudiosDir();
        if (!Files.exists(audiosDir)) {
            Files.createDirectories(audiosDir);
            logger.info("创建音频目录: {}", audiosDir.toAbsolutePath());
        }

        String originalFilename = file.getOriginalFilename();
        String fileExtension = getAudioFileExtension(originalFilename);

        String stem = (name != null && !name.trim().isEmpty())
                ? name.trim()
                : (originalFilename != null && originalFilename.contains(".")
                        ? originalFilename.substring(0, originalFilename.lastIndexOf('.'))
                        : String.valueOf(originalFilename));

        // 去掉用户输入里可能带的扩展名，避免出现 xxx.mp3.mp3
        if (stem.toLowerCase().endsWith(fileExtension.toLowerCase())) {
            stem = stem.substring(0, stem.length() - fileExtension.length());
        }

        String uniqueFilename = stem + "_" + System.currentTimeMillis() + fileExtension;
        // 替换 Windows 非法文件名字符（音频名常含中文，这里只挡非法字符）
        uniqueFilename = uniqueFilename.replaceAll("[\\\\/:*?\"<>|]", "_");

        Path filePath = audiosDir.resolve(uniqueFilename);
        Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);
        logger.info("音频文件已保存: {} ({} bytes)", filePath.toAbsolutePath(), file.getSize());

        return uniqueFilename;
    }

    /** 允许上传的音频扩展名（不含点号，小写） */
    private static final List<String> SUPPORTED_AUDIO_FORMATS = Arrays.asList(
            "mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "wma", "opus", "aiff", "aif");

    /**
     * 校验音频文件：非空、未超过 storage.max.file.size、扩展名在白名单内。
     *
     * <p>音频远大于图片，这里沿用 {@code storage.max.file.size}（默认 10MB）作为上限；
     * 该值与 Spring 的 {@code spring.servlet.multipart.max-file-size}（50MB）共同生效，
     * 需要放宽时改 {@code storage.max.file.size}。
     */
    private void validateAudioFile(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("音频文件为空");
        }

        long fileSizeMB = file.getSize() / (1024 * 1024);
        int maxFileSize = storageConfig.getMaxFileSize();
        if (maxFileSize > 0 && fileSizeMB > maxFileSize) {
            throw new IllegalArgumentException(
                    "音频文件大小超过限制: " + fileSizeMB + "MB > " + maxFileSize + "MB");
        }

        String extension = getAudioFileExtension(file.getOriginalFilename());
        String bare = extension.startsWith(".") ? extension.substring(1) : extension;
        if (!SUPPORTED_AUDIO_FORMATS.contains(bare.toLowerCase())) {
            throw new IllegalArgumentException(
                    "不支持的音频格式: " + bare + "（支持: " + String.join(", ", SUPPORTED_AUDIO_FORMATS) + "）");
        }
    }

    /**
     * 取音频文件扩展名（含点号）。
     *
     * <p>不使用 {@link #getFileExtension}：那个方法的默认值是 {@code .png}，
     * 对音频来说会写出错误的扩展名。
     */
    private String getAudioFileExtension(String filename) {
        if (filename == null || filename.lastIndexOf('.') == -1) {
            throw new IllegalArgumentException("无法识别音频格式（文件名缺少扩展名）: " + filename);
        }
        String ext = filename.substring(filename.lastIndexOf('.'));
        if (ext.length() <= 1) {
            throw new IllegalArgumentException("无法识别音频格式（扩展名为空）: " + filename);
        }
        return ext;
    }

    /**
     * 上传角色立绘文件
     * 按 {portraitId}.{ext} 命名规则保存到角色目录（目录名=characterId）
     *
     * @param file        上传的图片文件
     * @param characterId 角色ID（直接用作目录名）
     * @param portraitId  立绘ID（直接用作文件名）
     * @param emotion     情绪（如 "happy"、"sad"），来自前端（仅记录用，不参与命名）
     * @return PortraitUploadResult 包含 imagePath（相对路径
     *         {characterId}/{portraitId}.{ext}）
     */
    public PortraitUploadResult uploadPortraitFile(
            MultipartFile file,
            String characterId,
            String portraitId,
            String emotion) throws IOException {

        // 1. 验证文件
        validateFile(file);

        // 2. 拿到/创建角色目录（目录名=characterId）
        String folderName = characterFolderService.resolveOrCreateFolder(characterId);
        File characterDir = characterFolderService.getCharacterDir(folderName);
        if (!characterDir.exists()) {
            characterDir.mkdirs();
        }

        // 3. WebP 在入库时统一转成 PNG 存盘，原图另存作备份。
        //    为什么不等渲染时再解：WebP 在 Java 21 上没有 ImageIO 解码器，只能靠 FFmpeg
        //    原生库兜底；一旦原生库不可用，旧流程会"上传成功、渲染时才失败"，用户看到的
        //    就是满屏红色"加载失败"方块，而且文件已经落库、无从判断是哪一张坏了。
        //    改成入库时转换之后，读取路径只剩 JDK 自带解码器（PNG），故障点也从"遍布全库、
        //    静默发生"收敛成"单次上传、当场报错"。
        //    FFmpeg 本来就是视频导出的硬依赖（见 VideoExporter 的 FFmpegFrameRecorder），
        //    所以这里用它做一次转换不引入任何新的运行时依赖。
        DecodedPortrait decoded = readAndNormalizePortrait(file, portraitId);

        // 4. 生成文件名：{portraitId}.{ext}；WebP 转换后扩展名是 .png
        String filename;
        if (decoded == null) {
            filename = portraitId + getFileExtension(file.getOriginalFilename());
            File dest = new File(characterDir, filename);
            Files.copy(file.getInputStream(), dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
            logger.info("立绘文件已保存: {}", dest.getAbsolutePath());
        } else {
            filename = portraitId + ".png";
            File dest = new File(characterDir, filename);
            writePngAtomically(decoded.image, dest);
            backupOriginalPortrait(characterDir, portraitId, decoded.originalBytes, decoded.originalExtension);
            logger.info("立绘已由 WebP 转为 PNG 保存: {}（原图已备份，渲染路径不再依赖 FFmpeg 解码）",
                    dest.getAbsolutePath());
        }

        // 5. 返回相对路径（供前端 URL 拼接和 DB 存储）
        String relativePath = folderName + "/" + filename;
        return new PortraitUploadResult(relativePath, null);
    }

    /**
     * 原图备份目录名（角色目录下的子目录）。
     *
     * <p>放在角色目录内部，这样删除角色目录时会连同备份一起清掉，不会留孤儿；
     * 删除单个立绘时由 {@code PortraitController.deleteOriginalBackup} 按 portraitId 清理。
     * 对外可见是为了让删除逻辑与写入逻辑共用同一个目录名，避免两处字面量漂移。
     */
    public static final String ORIGINAL_BACKUP_DIR = "originals";

    /**
     * 读取上传的立绘；如果是 WebP 就解码成 {@link BufferedImage} 交给调用方写 PNG。
     *
     * <p>返回 {@code null} 表示"不需要转换，按原字节存盘即可"（非 WebP，或样本太短不可能是图像）。
     * WebP 但解不出来时<b>抛异常</b>，绝不放行：宁可让用户当场看到"这张图读不出来"，
     * 也不要让它在渲染时变成红色占位图。
     */
    private DecodedPortrait readAndNormalizePortrait(MultipartFile file, String portraitId) throws IOException {
        byte[] bytes;
        try (InputStream in = file.getInputStream()) {
            bytes = in.readAllBytes();
        }
        if (!WebpImageDecoder.isWebpBytes(bytes)) {
            return null;
        }

        // FFmpeg 需要可寻址的输入，所以落到临时文件再解（同 ImageReader.readResourceImage 的做法）
        File temp = File.createTempFile("lbc-portrait-import-", ".webp");
        try {
            Files.write(temp.toPath(), bytes);
            BufferedImage image = WebpImageDecoder.decodeWithFfmpeg(temp);
            if (image == null) {
                String reason = WebpImageDecoder.getLastFailure();
                logger.warn("立绘 {} 是 WebP 但无法解码，已拒绝本次上传: {}", portraitId, reason);
                throw new IOException("这张 WebP 立绘无法解码，已取消上传（原文件未被改动）。"
                        + "原因: " + (reason == null ? "FFmpeg 未返回图像" : reason)
                        + "。若原因是 FFmpeg 原生库不可用，请查看启动日志里的“FFmpeg 原生库”记录，"
                        + "或用 java -jar <jar> --self-check=webp 自检。");
            }
            String originalExtension = getFileExtension(file.getOriginalFilename());
            return new DecodedPortrait(image, bytes, originalExtension);
        } finally {
            if (!temp.delete()) {
                temp.deleteOnExit();
            }
        }
    }

    /** WebP 转换结果：解码后的图像 + 原图字节（用于备份） */
    private static final class DecodedPortrait {
        private final BufferedImage image;
        private final byte[] originalBytes;
        private final String originalExtension;

        private DecodedPortrait(BufferedImage image, byte[] originalBytes, String originalExtension) {
            this.image = image;
            this.originalBytes = originalBytes;
            this.originalExtension = originalExtension;
        }
    }

    /**
     * 把转换后的 PNG 写进目标文件。
     *
     * <p>先写临时文件再原子替换：避免写到一半失败时，磁盘上留下一个"看起来存在、其实损坏"的
     * 立绘文件 —— 那种文件的症状又回到了红方块，且更难查。
     */
    private void writePngAtomically(BufferedImage image, File dest) throws IOException {
        File temp = new File(dest.getParentFile(), dest.getName() + ".importing");
        try {
            if (!ImageIO.write(image, "png", temp)) {
                throw new IOException("当前运行环境没有 PNG 编码器，无法保存立绘");
            }
            try {
                Files.move(temp.toPath(), dest.toPath(),
                        StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException e) {
                Files.move(temp.toPath(), dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(temp.toPath());
        }
    }

    /**
     * 把用户上传的原始 WebP 另存一份到角色目录下的 {@code originals/}。
     *
     * <p>刻意保留原图：转换是一条有损链路（WebP 解码 → PNG 重编码），万一以后发现转换有问题、
     * 或需要换解码器重转，原图是唯一能回退的依据；而它只有一百多 KB，相对转换后约 11 倍的
     * PNG 体积可以忽略。备份失败<b>不影响本次上传</b>（PNG 已经写好了），只记日志。
     */
    private void backupOriginalPortrait(File characterDir, String portraitId, byte[] bytes, String extension) {
        try {
            File backupDir = new File(characterDir, ORIGINAL_BACKUP_DIR);
            if (!backupDir.exists() && !backupDir.mkdirs() && !backupDir.isDirectory()) {
                logger.warn("原图备份目录创建失败，跳过备份: {}", backupDir.getAbsolutePath());
                return;
            }
            File backup = new File(backupDir, portraitId + extension);
            Files.write(backup.toPath(), bytes);
            logger.info("立绘原图已备份: {}", backup.getAbsolutePath());
        } catch (IOException e) {
            logger.warn("立绘原图备份失败（不影响本次上传）: {}", e.toString());
        }
    }

    /**
     * 上传立绘缩略图文件
     * 保存到角色拼音目录下的 thumbnails 子目录：
     * {characters}/{拼音}/{characterThumbnailsSubdir}/thumbnail_{portraitId}.png
     * 这样删除角色目录时会一并清理。
     *
     * @param file        前端裁剪后的缩略图文件
     * @param characterId 角色ID
     * @param portraitId  立绘ID
     * @return 缩略图访问 URL 路径（形如
     *         "/assets/characters/{characterId}/thumbnails/thumbnail_{portraitId}.png"）
     */
    public String uploadPortraitThumbnail(MultipartFile file, String characterId, String portraitId)
            throws IOException {
        // 1. 验证文件
        validateFile(file);

        // 2. 拿到/创建角色目录（目录名=characterId）
        String folderName = characterFolderService.resolveOrCreateFolder(characterId);

        // 3. 构造 thumbnails 子目录
        String subdir = appConfig.getAssets().getCharacterThumbnailsSubdir();
        File thumbnailDir = new File(
                new File(appConfig.getAssets().getCharacters(), folderName),
                subdir);
        if (!thumbnailDir.exists()) {
            thumbnailDir.mkdirs();
            logger.info("创建缩略图目录: {}", thumbnailDir.getAbsolutePath());
        }

        // 5. 生成文件名（与前端原命名规则一致：thumbnail_{portraitId}.png）
        String filename = "thumbnail_" + portraitId + ".png";
        File dest = new File(thumbnailDir, filename);

        // 6. 保存文件
        Files.copy(file.getInputStream(), dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
        logger.info("立绘缩略图已保存: {}", dest.getAbsolutePath());

        // 7. 返回 URL 路径（前端通过 /assets/** 静态映射访问）
        String urlPath = "/assets/characters/" + folderName + "/" + subdir + "/" + filename;
        logger.info("缩略图访问 URL: {}", urlPath);
        return urlPath;
    }

    /**
     * 立绘上传结果
     */
    public static class PortraitUploadResult {
        private final String imagePath;
        private final String thumbnailPath;

        public PortraitUploadResult(String imagePath, String thumbnailPath) {
            this.imagePath = imagePath;
            this.thumbnailPath = thumbnailPath;
        }

        public String getImagePath() {
            return imagePath;
        }

        public String getThumbnailPath() {
            return thumbnailPath;
        }
    }

    /**
     * 验证缩略图文件
     *
     * @param file 上传的文件
     */
    private void validateThumbnailFile(MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("缩略图文件为空");
        }

        // 检查文件大小 (缩略图应该更小)
        long fileSizeKB = file.getSize() / 1024;
        if (fileSizeKB > 1024) { // 1MB
            throw new IllegalArgumentException("缩略图文件大小超过限制: " + fileSizeKB + "KB > 1024KB");
        }

        // 检查文件格式 (只允许图片格式)
        String originalFilename = file.getOriginalFilename();
        String fileExtension = getFileExtension(originalFilename).toLowerCase();
        // 移除点号进行比较
        if (fileExtension.startsWith(".")) {
            fileExtension = fileExtension.substring(1);
        }
        List<String> supportedFormats = Arrays.asList("jpg", "jpeg", "png", "gif", "webp");

        if (!supportedFormats.contains(fileExtension)) {
            throw new IllegalArgumentException("不支持的缩略图格式: " + fileExtension);
        }
    }

    /**
     * 获取文件扩展名
     * 
     * @param filename 文件名
     * @return 文件扩展名（包含点号）
     */
    private String getFileExtension(String filename) {
        if (filename == null || filename.lastIndexOf(".") == -1) {
            return ".png"; // 默认扩展名
        }
        return filename.substring(filename.lastIndexOf("."));
    }

    /**
     * 为背景原图生成缩略图，保存到 backgrounds/thumbnails/thumb_{filename}
     */
    private void generateBackgroundThumbnail(MultipartFile file, String filename) throws IOException {
        Path backgroundsDir = Paths.get(appConfig.getAssets().getBackgrounds());
        Path thumbnailsDir = backgroundsDir.resolve("thumbnails");
        if (!Files.exists(thumbnailsDir)) {
            Files.createDirectories(thumbnailsDir);
        }

        BufferedImage originalImage = ImageIO.read(file.getInputStream());
        if (originalImage == null) {
            logger.warn("无法读取图片以生成缩略图: {}", filename);
            return;
        }

        int originalWidth = originalImage.getWidth();
        int originalHeight = originalImage.getHeight();
        int thumbnailWidth = storageConfig.getThumbnailWidth();
        int thumbnailHeight = storageConfig.getThumbnailHeight();

        double ratio = Math.min((double) thumbnailWidth / originalWidth,
                (double) thumbnailHeight / originalHeight);
        int newWidth = (int) (originalWidth * ratio);
        int newHeight = (int) (originalHeight * ratio);

        BufferedImage thumbnailImage = new BufferedImage(thumbnailWidth, thumbnailHeight,
                BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2d = thumbnailImage.createGraphics();
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.setColor(Color.WHITE);
        g2d.fillRect(0, 0, thumbnailWidth, thumbnailHeight);
        int x = (thumbnailWidth - newWidth) / 2;
        int y = (thumbnailHeight - newHeight) / 2;
        g2d.drawImage(originalImage, x, y, newWidth, newHeight, null);
        g2d.dispose();

        String ext = getFileExtension(filename);
        String formatName = ext.startsWith(".") ? ext.substring(1) : ext;
        // jpg 不支持透明
        if ("jpg".equalsIgnoreCase(formatName) || "jpeg".equalsIgnoreCase(formatName)) {
            BufferedImage rgbThumb = new BufferedImage(thumbnailWidth, thumbnailHeight,
                    BufferedImage.TYPE_INT_RGB);
            Graphics2D rg = rgbThumb.createGraphics();
            rg.setColor(Color.WHITE);
            rg.fillRect(0, 0, thumbnailWidth, thumbnailHeight);
            rg.drawImage(thumbnailImage, 0, 0, null);
            rg.dispose();
            thumbnailImage = rgbThumb;
        }
        String thumbFilename = "thumb_" + filename;
        Path thumbnailPath = thumbnailsDir.resolve(thumbFilename);
        ImageIO.write(thumbnailImage, formatName, thumbnailPath.toFile());
        logger.info("背景缩略图已生成: {}", thumbnailPath.toAbsolutePath());
    }

    /**
     * 验证上传的文件
     * 
     * @param file 上传的文件
     */
    private void validateFile(MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("文件为空");
        }

        // 检查文件大小
        long fileSizeMB = file.getSize() / (1024 * 1024);
        if (fileSizeMB > storageConfig.getMaxFileSize()) {
            throw new IllegalArgumentException(
                    "文件大小超过限制: " + fileSizeMB + "MB > " + storageConfig.getMaxFileSize() + "MB");
        }

        // 检查文件格式
        String originalFilename = file.getOriginalFilename();
        String fileExtension = originalFilename.substring(originalFilename.lastIndexOf(".") + 1).toLowerCase();
        List<String> supportedFormats = Arrays.asList(storageConfig.getSupportedFormats().split(","));

        if (!supportedFormats.contains(fileExtension)) {
            throw new IllegalArgumentException("不支持的文件格式: " + fileExtension);
        }
    }

    /**
     * 计算文件内容的哈希值
     * 
     * @param inputStream 文件输入流
     * @return 文件哈希值
     */
    private String calculateFileHash(InputStream inputStream) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(DigestUtils.md5Digest(inputStream));

            // 转换为十六进制字符串
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }

            return sb.toString();
        } catch (NoSuchAlgorithmException | IOException e) {
            logger.error("计算文件哈希值失败: " + e.getMessage(), e);
            return UUID.randomUUID().toString();
        }
    }

    /**
     * 检查资源是否存在
     * 
     * @param resourcePath 资源路径
     * @return 资源是否存在
     */
    public boolean resourceExists(String resourcePath) {
        try {
            Resource resource = resourceLoader.getResource(resourcePath);
            return resource.exists();
        } catch (Exception e) {
            logger.warn("检查资源时出错: " + e.getMessage());
            return false;
        }
    }

    /**
     * 获取资源
     * 
     * @param resourcePath 资源路径
     * @return 资源对象
     */
    public Resource getResource(String resourcePath) {
        return resourceLoader.getResource(resourcePath);
    }

    // --- ResourceService impl ---
    @Override
    public org.springframework.core.io.Resource getById(String id) {
        return getResource(id);
    }

    @Override
    public java.util.List<org.springframework.core.io.Resource> listAll() {
        try {
            Path dir = Paths.get(storageConfig.getBackgroundsDir());
            if (!Files.exists(dir) || !Files.isDirectory(dir))
                return java.util.Collections.emptyList();
            java.util.List<org.springframework.core.io.Resource> res = new java.util.ArrayList<>();
            try (java.util.stream.Stream<Path> s = Files.list(dir)) {
                s.filter(p -> Files.isRegularFile(p))
                        .forEach(p -> res.add(resourceLoader.getResource("file:" + p.toAbsolutePath().toString())));
            }
            return res;
        } catch (Exception e) {
            logger.warn("列出资源失败: {}", e.getMessage());
            return java.util.Collections.emptyList();
        }
    }

    @Override
    public org.springframework.core.io.Resource save(org.springframework.core.io.Resource entity) {
        // 简单实现：若传入 Resource 可读取则将其内容复制到背景目录并返回新 Resource
        try (InputStream in = entity.getInputStream()) {
            Path backgroundsDir = Paths.get(storageConfig.getBackgroundsDir());
            if (!Files.exists(backgroundsDir))
                Files.createDirectories(backgroundsDir);
            String filename = UUID.randomUUID().toString();
            // 尝试从 URL/path 推断扩展名
            String src = entity.getFilename();
            String ext = "";
            if (src != null && src.contains("."))
                ext = src.substring(src.lastIndexOf('.'));
            Path dest = backgroundsDir.resolve(filename + ext);
            Files.copy(in, dest, StandardCopyOption.REPLACE_EXISTING);
            return resourceLoader.getResource("file:" + dest.toAbsolutePath().toString());
        } catch (Exception e) {
            logger.warn("保存资源失败: {}", e.getMessage());
            return entity;
        }
    }

    @Override
    public void delete(String id) {
        try {
            org.springframework.core.io.Resource r = getResource(id);
            if (r.exists()) {
                try {
                    Path p = r.getFile().toPath();
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    logger.warn("删除资源文件失败: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            logger.warn("删除资源失败: {}", e.getMessage());
        }
    }
}
