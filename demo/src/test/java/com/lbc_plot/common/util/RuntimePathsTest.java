package com.lbc_plot.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

/**
 * {@link RuntimePaths} 的回归测试。
 *
 * <p>这里的重点是锁住"路径解析结果与 JVM 工作目录无关"这个性质：
 * 早期实现把素材写成 {@code ./assets}、数据库写成 {@code ./data/project.db}，
 * 同一个应用在不同 cwd 下会读写不同目录，甚至把 URL {@code /assets/...} 当成
 * 盘符根目录 {@code C:\assets\...}。任何让解析结果重新依赖 cwd 的改动都应该让本测试失败。
 */
class RuntimePathsTest {

    @Test
    void dataRootIsAbsolute() {
        Path root = RuntimePaths.getDataRoot();
        assertNotNull(root);
        assertTrue(root.isAbsolute(), "数据根目录必须是绝对路径，否则会再次依赖 cwd: " + root);
    }

    @Test
    void assetsAndDataDirsAreAbsoluteAndUnderDataRoot() {
        Path root = RuntimePaths.getDataRoot();

        assertEquals(root.resolve("assets"), RuntimePaths.getAssetsDir());
        assertEquals(root.resolve("assets").resolve("audios"), RuntimePaths.getAudiosDir());
        assertEquals(root.resolve("assets").resolve("backgrounds"), RuntimePaths.getBackgroundsDir());
        assertEquals(root.resolve("assets").resolve("characters"), RuntimePaths.getCharactersDir());
        assertEquals(root.resolve("assets").resolve("thumbnails"), RuntimePaths.getThumbnailsDir());
        assertEquals(root.resolve("data"), RuntimePaths.getDataDir());
        assertEquals(root.resolve("projects").resolve("temp"), RuntimePaths.getTempDir());
    }

    @Test
    void databaseUrlPointsAtAbsoluteFileUnderDataRoot() {
        String url = RuntimePaths.getDatabaseUrl();

        assertTrue(url.startsWith("jdbc:sqlite:"), "应使用 sqlite JDBC URL: " + url);

        String filePart = url.substring("jdbc:sqlite:".length());
        File dbFile = new File(filePart);
        assertTrue(dbFile.isAbsolute(),
                "数据库必须是绝对路径，否则不同 cwd 会打开不同的库: " + filePart);
        assertEquals(RuntimePaths.getDataDir().resolve("project.db").toAbsolutePath().normalize(),
                dbFile.toPath().toAbsolutePath().normalize());
    }

    @Test
    void urlPathPrefixIsNotTreatedAsFilesystemRoot() {
        // 复现原始 bug 的关键断言："/assets" 绝不能被解析成盘符根目录。
        // Windows 上 new File("/assets/audios/x.wav") 会得到 C:\assets\audios\x.wav。
        File fromUrlStylePath = new File("/assets/audios/卧槽_1791379183273.wav");

        assertFalse(fromUrlStylePath.getPath().startsWith("C:" + File.separator + "assets"),
                "URL 形式的路径不应被当作文件系统绝对路径解析: " + fromUrlStylePath.getPath());

        // 正确做法是相对素材目录解析
        File resolved = RuntimePaths.getAssetsDir()
                .resolve("audios")
                .resolve("卧槽_1791379183273.wav")
                .toFile();
        assertTrue(resolved.getPath().startsWith(RuntimePaths.getAssetsDir().toString()),
                "音频文件应落在运行时素材目录下: " + resolved.getPath());
    }

    @Test
    void testsRunWithModuleDirAsDataRoot() {
        // surefire 通过 -Dlbc.data.dir=${project.basedir} 固定测试的数据根目录，
        // 这样测试用的是仓库内已有的 demo/assets，也不会污染已安装版本的用户数据目录。
        String override = System.getProperty(RuntimePaths.DATA_DIR_PROPERTY);
        if (override != null && !override.isBlank()) {
            assertEquals(new File(override).getAbsoluteFile().toPath().normalize(),
                    RuntimePaths.getDataRoot());
        }
    }

    @Test
    void describeExposesResolvedPaths() {
        var info = RuntimePaths.describe();

        assertEquals(RuntimePaths.toPortableString(RuntimePaths.getDataRoot()), info.get("dataRoot"));
        assertEquals(RuntimePaths.toPortableString(RuntimePaths.getAssetsDir()), info.get("assetsDir"));
        assertTrue(info.get("assetsDir").contains("/assets"), "素材目录应以 /assets 结尾: " + info.get("assetsDir"));
    }
}
