package com.lbc_plot.common.util.io;

import com.lbc_plot.config.ProjectConfig;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

/**
 * 图片读取工具类
 * 提供从文件系统读取图片的功能
 * 
 * 示例
 * BufferedImage image1 =
 * ImageReader.readResourceImage("assets/ui/name_tag.png");
 * BufferedImage image3 =
 * ImageReader.readFileImage("demo/src/main/resources/assets/ui/image.png");
 *
 * <h2>路径约定</h2>
 * 同一个素材在系统里有三种写法，本类都必须能读：
 * <ol>
 *   <li><b>URL 形式</b>：{@code /assets/backgrounds/x.png} —— 数据库/前端保存的就是这个；</li>
 *   <li><b>绝对路径</b>：{@code C:/Users/.../assets/backgrounds/x.png}；</li>
 *   <li><b>裸文件名</b>：{@code x.png}（历史数据）。</li>
 * </ol>
 * {@link #readBackGround(String)} / {@link #readCharacters(String)} 内部用
 * {@link #collectCandidates} 生成候选列表，避免出现
 * {@code .../assets/backgrounds//assets/backgrounds/x.png} 这类重复拼接。
 */
public class ImageReader {

    /**
     * 统一的文件读图入口：优先 ImageIO，读不出来（如 WebP）时用 FFmpeg 兜底。
     *
     * @param file 图片文件
     * @return BufferedImage，ImageIO 与 FFmpeg 都失败时返回 null
     */
    public static BufferedImage readImageFile(File file) throws IOException {
        if (file == null || !file.exists() || !file.isFile()) {
            throw new IOException("文件不存在: " + (file == null ? "null" : file.getAbsolutePath()));
        }
        // WebP 先做魔数判断并直接交给 FFmpeg：Java 21 的 ImageIO 对它会返回 null，
        // 走一遍 ImageIO 只是白读一次文件。
        if (WebpImageDecoder.isWebp(file)) {
            BufferedImage viaFfmpeg = WebpImageDecoder.decodeWithFfmpeg(file);
            if (viaFfmpeg != null) {
                return viaFfmpeg;
            }
        }
        // 1) JDK 自带解码（png/jpg/gif/bmp/tif）
        try {
            BufferedImage image = ImageIO.read(file);
            if (image != null) {
                return image;
            }
        } catch (IOException e) {
            // 某些格式可能让 ImageIO 直接抛错，转到 FFmpeg 兜底
        }
        // 2) FFmpeg 兜底（WebP，保留 alpha）
        return WebpImageDecoder.decodeWithFfmpeg(file);
    }

    /**
     * 从resources目录读取图片（推荐方式）
     * 
     * @param resourcePath 相对于resources目录的路径
     * @return BufferedImage对象
     * @throws IOException 当读取失败时抛出
     */
    public static BufferedImage readResourceImage(String resourcePath) throws IOException {
        return readResourceImage(resourcePath, new File(resourcePath));
    }

    /**
     * 从 resources 目录读取图片，允许调用方指定「文件系统回退路径」。
     *
     * <p>回退路径存在的意义：{@code border_1080p.png} 等资源位于 {@code demo/assets/ui/}
     * 而未打进 classpath，此时需要按相对 JVM 工作目录的路径去磁盘找。
     *
     * @param resourcePath classpath 资源路径
     * @param fallbackFile 文件系统回退文件
     */
    private static BufferedImage readResourceImage(String resourcePath, File fallbackFile) throws IOException {
        if (resourcePath == null || resourcePath.isBlank()) {
            throw new IOException("资源路径为空");
        }
        File maybeFile = new File(resourcePath);

        // 1) 真正的文件系统绝对路径（Windows 盘符 / UNC）直接读盘。
        //    注意 /assets/... 这种「URL 形式」不算：它在 Linux 下虽然也 isAbsolute()，
        //    但指的是 URL 根，当文件读只会得到盘符根目录下的不存在路径。
        if (isRealFileSystemPath(resourcePath)) {
            if (!maybeFile.exists() || !maybeFile.isFile()) {
                throw new IOException("文件不存在: " + resourcePath);
            }
            return readImageFile(maybeFile);
        }

        // 2) classpath 资源
        ClassLoader classLoader = ImageReader.class.getClassLoader();
        URL resource = classLoader.getResource(resourcePath);
        if (resource != null) {
            try (InputStream inputStream = resource.openStream()) {
                BufferedImage image = ImageIO.read(inputStream);
                if (image != null) {
                    return image;
                }
            }
            // ImageIO 读不出来（如 WebP）：再整体读一次字节交给 FFmpeg 兜底
            BufferedImage viaFfmpeg = decodeResourceAsWebp(resource, resourcePath);
            if (viaFfmpeg != null) {
                return viaFfmpeg;
            }
        }

        // 3) classpath 找不到时，回退到文件系统相对路径（相对于 JVM 工作目录，
        //    即 mvn spring-boot:run 启动时的 demo 目录）。
        if (fallbackFile.exists() && fallbackFile.isFile()) {
            return readImageFile(fallbackFile);
        }

        throw new IOException("资源文件不存在: " + resourcePath
                + "（已尝试 classpath 与文件系统相对路径 " + fallbackFile.getAbsolutePath() + "）");
    }

    /**
     * 把 classpath 资源整体读出来，确认是 WebP 后交给 FFmpeg 解码。
     * 只在「ImageIO 已失败」的冷路径上才会被调用。
     */
    private static BufferedImage decodeResourceAsWebp(URL resource, String description) {
        try (InputStream in = resource.openStream()) {
            return WebpImageDecoder.decodeWebpBytes(readAllBytes(in), description);
        } catch (IOException e) {
            return null;
        }
    }

    private static byte[] readAllBytes(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.max(8192, in.available()));
        byte[] buffer = new byte[8192];
        int n;
        while ((n = in.read(buffer)) > 0) {
            out.write(buffer, 0, n);
        }
        return out.toByteArray();
    }

    /** 是否为「真正的」文件系统绝对路径（排除 {@code /assets/...} 这种 URL 形式） */
    private static boolean isRealFileSystemPath(String path) {
        if (!new File(path).isAbsolute()) {
            return false;
        }
        return !(path.startsWith("/") && !path.startsWith("//"));
    }

    /**
     * 生成读取某个素材时要依次尝试的候选路径。
     *
     * <p>这是「路径重复拼接」的修复点：数据库里存的是 URL
     * （{@code /assets/backgrounds/x.png}）或已经带目录的路径时，不能无脑再拼一次
     * {@code ProjectConfig.*_PATH}，否则会得到
     * {@code .../assets/backgrounds//assets/backgrounds/x.png}。
     *
     * @param raw           调用方传入的原始路径
     * @param configuredDir ProjectConfig 中该素材目录的绝对路径（以 '/' 结尾）
     * @param dirName       素材目录名，用于识别裸的 "backgrounds/"、"characters/" 前缀
     */
    private static List<String> collectCandidates(String raw, String configuredDir, String dirName) {
        List<String> candidates = new ArrayList<>(4);
        if (raw == null || raw.isBlank()) {
            return candidates;
        }
        String value = raw.trim().replace('\\', '/');
        String normalized = stripAssetPrefixes(value);

        if (isRealFileSystemPath(value)) {
            // 已经是绝对路径，直接用
            candidates.add(value);
        } else if (normalized.startsWith(dirName + "/")) {
            // 形如 backgrounds/x.png / characters/x.png：锚定到配置目录
            candidates.add(configuredDir + strippedPrefix(normalized, dirName + "/"));
        } else {
            candidates.add(configuredDir + normalized);
        }

        // 兜底 1：原样（相对 JVM 工作目录）
        // 兜底 2：去掉 /assets/ 等前缀（兼容 assets/ 直接位于工作目录的旧布局）
        addIfAbsent(candidates, value);
        addIfAbsent(candidates, normalized);
        return candidates;
    }

    /**
     * 反复剥掉 {@code ./}、{@code /assets/}、{@code assets/} 前缀，直到不再变化。
     *
     * <p>必须循环：{@code ./assets/backgrounds/x.png} 要先去掉 {@code ./} 才能看到
     * {@code assets/}，只按固定顺序各去一次会漏掉组合形式。
     */
    private static String stripAssetPrefixes(String value) {
        String current = value;
        while (true) {
            String next = strippedPrefix(current, "./");
            next = strippedPrefix(next, "/assets/");
            next = strippedPrefix(next, "assets/");
            if (next.equals(current)) {
                return current;
            }
            current = next;
        }
    }

    /** 去掉前缀（大小写敏感，调用方已统一分隔符） */
    private static String strippedPrefix(String value, String prefix) {
        return value.startsWith(prefix) ? value.substring(prefix.length()) : value;
    }

    private static void addIfAbsent(List<String> list, String value) {
        if (value != null && !value.isBlank() && !list.contains(value)) {
            list.add(value);
        }
    }

    /**
     * 把「素材路径 / URL」解析为磁盘文件。
     *
     * <p>与 {@link #collectCandidates} 使用同一套前缀规则，供需要判断
     * “这个素材到底在不在磁盘上”的调用方复用（例如 {@code Background.loadImage}）。
     *
     * @param raw          原始路径（{@code /assets/...} URL、绝对路径或裸文件名）
     * @param configuredDir ProjectConfig 中该素材目录的绝对路径（以 '/' 结尾）
     * @param dirName      素材目录名，如 {@code backgrounds}
     * @return 解析后的 File；{@code raw} 为空时返回 {@code new File(configuredDir)}
     */
    public static File resolveAssetFile(String raw, String configuredDir, String dirName) {
        List<String> candidates = collectCandidates(raw, configuredDir, dirName);
        return candidates.isEmpty() ? new File(configuredDir) : new File(candidates.get(0));
    }

    /** 背景素材路径 → 磁盘文件（等价于 {@code resolveAssetFile(raw, BACKGROUNDS_PATH, "backgrounds")}） */
    public static File resolveBackgroundFile(String raw) {
        return resolveAssetFile(raw, ProjectConfig.BACKGROUNDS_PATH, "backgrounds");
    }

    /** 角色素材路径 → 磁盘文件（等价于 {@code resolveAssetFile(raw, CHARACTERS_PATH, "characters")}） */
    public static File resolveCharacterFile(String raw) {
        return resolveAssetFile(raw, ProjectConfig.CHARACTERS_PATH, "characters");
    }

    /** 该素材路径在磁盘上是否存在（URL 形式 / 绝对路径 / 裸文件名都支持） */
    public static boolean assetExists(String raw, String configuredDir, String dirName) {
        return resolveAssetFile(raw, configuredDir, dirName).isFile();
    }

    public static BufferedImage readBackGround(String fileName) throws IOException {
        List<String> candidates = collectCandidates(fileName, ProjectConfig.BACKGROUNDS_PATH,
                "backgrounds");
        for (String candidate : candidates) {
            File file = new File(candidate);
            if (file.isFile()) {
                return readImageFile(file);
            }
        }
        // 磁盘上没有时，再按 classpath 资源试一遍（数据库里可能存的是 classpath 内路径）
        for (String candidate : candidates) {
            try {
                BufferedImage image = readResourceImage(candidate, new File(candidate));
                if (image != null) {
                    return image;
                }
            } catch (IOException ignored) {
                // 继续尝试下一个候选
            }
        }
        throw new IOException("背景图片未找到: " + fileName + " (尝试路径: " + String.join(", ", candidates) + ")");
    }

    /**
     * 在 backgrounds 目录中按用户输入的名称搜索背景文件。
     *
     * <p>搜索策略：
     * <ol>
     *   <li>若输入含扩展名，查找精确匹配文件</li>
     *   <li>若输入无扩展名，查找所有同名不同扩展名的文件</li>
     *   <li>多个匹配时，优选 PNG > JPG/JPEG > 其他，同格式则选文件更大者</li>
     * </ol>
     *
     * @param userInput 用户输入的背景名称（如 "sunset" 或 "sunset.png"）
     * @return 匹配文件的绝对路径（正斜杠形式），未找到返回 null
     */
    public static String findBackgroundFile(String userInput) {
        if (userInput == null || userInput.isBlank()) return null;

        // ProjectConfig 的路径已是绝对路径，无需再去掉 "./" 前缀或猜测备用目录
        File dir = new File(ProjectConfig.BACKGROUNDS_PATH);
        if (!dir.exists() || !dir.isDirectory()) return null;

        String input = userInput.trim();
        int dot = input.lastIndexOf('.');
        String baseName = (dot > 0) ? input.substring(0, dot) : input;
        String ext = (dot > 0) ? input.substring(dot + 1).toLowerCase() : null;

        File bestFile = null;
        long bestSize = -1;
        int bestFormatRank = Integer.MAX_VALUE; // 越小越好

        File[] files = dir.listFiles();
        if (files == null) return null;

        for (File f : files) {
            if (!f.isFile()) continue;
            String fName = f.getName();
            String fBase;
            String fExt;
            int fDot = fName.lastIndexOf('.');
            if (fDot > 0) {
                fBase = fName.substring(0, fDot);
                fExt = fName.substring(fDot + 1).toLowerCase();
            } else {
                fBase = fName;
                fExt = "";
            }

            // 名称不匹配则跳过
            if (!fBase.equalsIgnoreCase(baseName)) continue;

            // 如果用户指定了扩展名，则必须精确匹配
            if (ext != null && !fExt.equalsIgnoreCase(ext)) continue;

            // 跳过非图片文件
            if (!isImageExtension(fExt)) continue;

            int formatRank = getImageFormatRank(fExt);
            long size = f.length();

            // 优选：格式更好，或同格式下文件更大
            if (formatRank < bestFormatRank || (formatRank == bestFormatRank && size > bestSize)) {
                bestFile = f;
                bestSize = size;
                bestFormatRank = formatRank;
            }
        }

        if (bestFile != null) {
            // 统一返回正斜杠的绝对路径（调用方据此落库并与 ProjectConfig 前缀比对）
            return bestFile.getAbsolutePath().replace('\\', '/');
        }

        return null;
    }

    /** 图片扩展名判断 */
    private static boolean isImageExtension(String ext) {
        if (ext == null) return false;
        return ext.equals("png") || ext.equals("jpg") || ext.equals("jpeg")
                || ext.equals("webp") || ext.equals("bmp") || ext.equals("gif");
    }

    /** 图片格式优先级：PNG > JPG > WebP > BMP > GIF > 其他 */
    private static int getImageFormatRank(String ext) {
        if (ext == null) return 99;
        switch (ext.toLowerCase()) {
            case "png":  return 1;
            case "jpg":
            case "jpeg": return 2;
            case "webp": return 3;
            case "bmp":  return 4;
            case "gif":  return 5;
            default:     return 10;
        }
    }

    public static BufferedImage readCharacters(String fileName) throws IOException {
        List<String> candidates = collectCandidates(fileName, ProjectConfig.CHARACTERS_PATH,
                "characters");
        for (String candidate : candidates) {
            File file = new File(candidate);
            if (file.isFile()) {
                return readImageFile(file);
            }
        }
        // 磁盘上没有时，再按 classpath 资源试一遍
        for (String candidate : candidates) {
            try {
                BufferedImage image = readResourceImage(candidate, new File(candidate));
                if (image != null) {
                    return image;
                }
            } catch (IOException ignored) {
                // 继续尝试下一个候选
            }
        }
        throw new IOException("人物图片未找到: " + fileName + " (尝试路径: " + String.join(", ", candidates) + ")");
    }

    public static BufferedImage readEffects(String fileName) throws IOException {
        return readResourceImage(ProjectConfig.EFFECTS_PATH + fileName);
    }

    public static BufferedImage readUI(String fileName) throws IOException {
        return readResourceImage(ProjectConfig.UI_PATH + fileName);
    }

    /**
     * 读取图片文件到BufferedImage
     * 
     * @param filePath 图片文件路径
     * @return 读取到的BufferedImage对象
     * @throws IOException 当文件不存在或读取失败时抛出
     */
    public static BufferedImage readImage(String filePath) throws IOException {
        return readImageFile(new File(filePath));
    }

    /**
     * 读取图片文件到BufferedImage（带格式验证）
     * 
     * @param filePath       图片文件路径
     * @param allowedFormats 允许的图片格式（如 "png", "jpg", "jpeg"）
     * @return 读取到的BufferedImage对象
     * @throws IOException 当文件格式不支持或读取失败时抛出
     */
    public static BufferedImage readImage(String filePath, String[] allowedFormats) throws IOException {
        File file = new File(filePath);
        String fileName = file.getName().toLowerCase();

        // 检查文件格式
        boolean formatValid = false;
        for (String format : allowedFormats) {
            if (fileName.endsWith("." + format.toLowerCase())) {
                formatValid = true;
                break;
            }
        }

        if (!formatValid) {
            throw new IOException("不支持的图片格式: " + fileName + "，支持的格式: " +
                    String.join(", ", allowedFormats));
        }

        return readImage(filePath);
    }

    /**
     * 安全读取图片，如果文件不存在返回null
     * 
     * @param filePath 图片文件路径
     * @return BufferedImage对象，如果文件不存在返回null
     */
    public static BufferedImage readImageSafe(String filePath) {
        try {
            return readImage(filePath);
        } catch (IOException e) {
            return null;
        }
    }
}