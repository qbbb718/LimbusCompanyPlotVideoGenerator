package com.lbc_plot.common.util;

import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 运行时数据目录的唯一解析入口。
 *
 * <h2>为什么需要它</h2>
 * 早期实现把素材、数据库、临时文件都写成相对路径（{@code ./assets}、{@code ./data/project.db}、
 * {@code ./projects}），于是"素材到底在哪"完全取决于 JVM 的工作目录：
 * <ul>
 *   <li>安装版由 Electron 以用户数据目录为 cwd 启动后端，相对路径恰好指向
 *       {@code %APPDATA%\limbus-company-plot-video-generator}，看起来是对的；</li>
 *   <li>但 {@code mvn spring-boot:run}（cwd = {@code demo/}）或任何其它 cwd 下，同一份配置就会
 *       指向 {@code demo/assets}，甚至把 {@code /assets/audios/xxx.wav} 这种 <em>URL</em> 当成
 *       <em>文件路径</em>解析成盘符根目录 {@code C:\assets\audios\xxx.wav}。</li>
 * </ul>
 * 结果是同一个资源在不同启动方式下落到了不同位置。本类把"数据根目录"固定成单一来源，
 * 所有其它路径（素材、数据库、临时素材）都由它推导，不再隐式依赖 cwd。
 *
 * <h2>解析优先级</h2>
 * <ol>
 *   <li>系统属性 {@code -Dlbc.data.dir=...}（优先级最高，便于测试与临时切换）</li>
 *   <li>环境变量 {@code LBC_DATA_DIR}</li>
 *   <li>默认值：Windows 用 {@code %APPDATA%\limbus-company-plot-video-generator}，
 *       其它平台用 {@code ~/.limbus-company-plot-video-generator}</li>
 * </ol>
 *
 * <p>注意：{@code %APPDATA%} 是 Windows 专有概念，因此默认值按平台分支；覆盖项则与平台无关。
 *
 * <h2>与安装版的关系</h2>
 * Electron 以用户数据目录（{@code app.getPath("userData")}，即
 * {@code %APPDATA%\limbus-company-plot-video-generator}）为 cwd 启动后端，因此第 3 条默认值
 * 与该目录天然一致，安装版无需额外配置。
 */
public final class RuntimePaths {

    /** 覆盖数据根目录的系统属性名 */
    public static final String DATA_DIR_PROPERTY = "lbc.data.dir";

    /** 覆盖数据根目录的环境变量名 */
    public static final String DATA_DIR_ENV = "LBC_DATA_DIR";

    /** 用户数据目录名（与 Electron 的 app.getPath("userData") 保持一致） */
    private static final String APP_DIR_NAME = "limbus-company-plot-video-generator";

    private static final Path DATA_ROOT = resolveDataRoot();

    private RuntimePaths() {
    }

    /**
     * 数据根目录（绝对路径，已规范化，结尾无分隔符）。
     *
     * <p>安装版即 {@code %APPDATA%\limbus-company-plot-video-generator}。
     */
    public static Path getDataRoot() {
        return DATA_ROOT;
    }

    /** 素材根目录，即 {@code {dataRoot}/assets}。对应 URL 前缀 {@code /assets/**}。 */
    public static Path getAssetsDir() {
        return DATA_ROOT.resolve("assets");
    }

    /** 音频素材目录，即 {@code {dataRoot}/assets/audios}。 */
    public static Path getAudiosDir() {
        return getAssetsDir().resolve("audios");
    }

    /** 背景素材目录，即 {@code {dataRoot}/assets/backgrounds}。 */
    public static Path getBackgroundsDir() {
        return getAssetsDir().resolve("backgrounds");
    }

    /** 角色素材目录，即 {@code {dataRoot}/assets/characters}。 */
    public static Path getCharactersDir() {
        return getAssetsDir().resolve("characters");
    }

    /** 缩略图目录，即 {@code {dataRoot}/assets/thumbnails}。 */
    public static Path getThumbnailsDir() {
        return getAssetsDir().resolve("thumbnails");
    }

    /** 数据目录（存放 SQLite 库），即 {@code {dataRoot}/data}。 */
    public static Path getDataDir() {
        return DATA_ROOT.resolve("data");
    }

    /**
     * SQLite 数据库 JDBC URL，形如 {@code jdbc:sqlite:C:/Users/.../data/project.db}。
     *
     * <p>使用绝对路径，避免不同 cwd 下打开不同的库。
     */
    public static String getDatabaseUrl() {
        return "jdbc:sqlite:" + toPortableString(getDataDir().resolve("project.db"));
    }

    /** 临时素材根目录，即 {@code {dataRoot}/projects}。对应 URL 前缀 {@code /projects/**}。 */
    public static Path getProjectsDir() {
        return DATA_ROOT.resolve("projects");
    }

    /** 临时素材目录，即 {@code {dataRoot}/projects/temp}。 */
    public static Path getTempDir() {
        return getProjectsDir().resolve("temp");
    }

    /** 日志目录，即 {@code {dataRoot}/logs}（与 Electron 主进程的日志目录一致）。 */
    public static Path getLogsDir() {
        return DATA_ROOT.resolve("logs");
    }

    /** 以正斜杠表示的路径字符串，便于拼接 URL 与写入配置/日志。 */
    public static String toPortableString(Path path) {
        return path.toString().replace('\\', '/');
    }

    /**
     * 返回各目录的解析结果，供诊断接口 / 启动日志排障使用。
     */
    public static Map<String, String> describe() {
        Map<String, String> info = new LinkedHashMap<>();
        info.put("dataRoot", toPortableString(getDataRoot()));
        info.put("assetsDir", toPortableString(getAssetsDir()));
        info.put("dataDir", toPortableString(getDataDir()));
        info.put("projectsDir", toPortableString(getProjectsDir()));
        info.put("workingDir", toPortableString(Paths.get(".").toAbsolutePath().normalize()));
        String override = overrideSource();
        info.put("override", override == null ? "" : override);
        return info;
    }

    // ==================== 内部实现 ====================

    private static Path resolveDataRoot() {
        String fromProperty = trimToNull(System.getProperty(DATA_DIR_PROPERTY));
        if (fromProperty != null) {
            return normalize(fromProperty);
        }

        String fromEnv = trimToNull(System.getenv(DATA_DIR_ENV));
        if (fromEnv != null) {
            return normalize(fromEnv);
        }

        return normalize(defaultDataRoot());
    }

    /** 平台默认数据根目录。 */
    private static String defaultDataRoot() {
        String osName = System.getProperty("os.name", "");
        boolean windows = osName.toLowerCase().contains("win");

        if (windows) {
            // 优先 APPDATA；极少数环境下未设置时退回 user.home
            String appData = trimToNull(System.getenv("APPDATA"));
            if (appData != null) {
                return new File(appData, APP_DIR_NAME).getPath();
            }
            return new File(System.getProperty("user.home", "."), "AppData/Roaming/" + APP_DIR_NAME).getPath();
        }

        // 非 Windows：沿用隐藏目录约定
        return new File(System.getProperty("user.home", "."), "." + APP_DIR_NAME).getPath();
    }

    /** 描述当前生效的覆盖来源，未覆盖时返回 null。 */
    private static String overrideSource() {
        String fromProperty = trimToNull(System.getProperty(DATA_DIR_PROPERTY));
        if (fromProperty != null) {
            return DATA_DIR_PROPERTY + "=" + fromProperty;
        }
        String fromEnv = trimToNull(System.getenv(DATA_DIR_ENV));
        if (fromEnv != null) {
            return DATA_DIR_ENV + "=" + fromEnv;
        }
        return null;
    }

    /** 转成绝对路径并规范化，去掉结尾分隔符。 */
    private static Path normalize(String raw) {
        Path path = Paths.get(raw).toAbsolutePath().normalize();
        return path;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
