package com.lbc_plot.common.util.io;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lbc_plot.config.ProjectConfig;

/**
 * 背景路径解析：**存成绝对 URL 的路径也必须能读盘**。
 *
 * <h2>为什么要有这一条</h2>
 * 资源管理页会把 {@code /assets/backgrounds/x.png} 补成
 * {@code http://localhost:8081/assets/backgrounds/x.png} 以便放进 {@code <img src>}。
 * 这份"展示值"一旦被当成素材路径传给渲染端（历史上真的发生过：背景编辑后保存、
 * 以及前端把展示用的对象直接塞进合成预览的请求体），旧实现会拼出
 * {@code ...\assets\backgrounds\http:\localhost:8081\assets\backgrounds\x.png}，
 * 背景**静默变成黑底**。
 *
 * <p>运行日志里的原始症状（修复前）：
 * <pre>
 * WARN c.lbc_plot.resource.model.Background - 加载背景图像时发生错误:
 *   http://localhost:8081/assets/backgrounds/办公室_123.png
 *   (背景图片未找到: ... (尝试路径: C:/.../assets/backgrounds/http://localhost:8081/assets/backgrounds/办公室_123.png, ...))
 * </pre>
 * 所以这条测试锁的是"读盘侧自愈"：即使数据被写坏了，画面也得对。
 */
class BackgroundPathResolutionTest {

    private static String expectedSuffix(String fileName) {
        String dir = ProjectConfig.BACKGROUNDS_PATH;
        if (!dir.endsWith("/") && !dir.endsWith("\\")) {
            dir = dir + "/";
        }
        return (dir + fileName).replace('\\', '/');
    }

    @Test
    @DisplayName("站内路径 / 绝对 URL / 裸文件名 都解析到同一个磁盘文件")
    void resolvesAllPathShapes() {
        String expected = expectedSuffix("办公室_123.png");

        for (String raw : new String[] {
                "/assets/backgrounds/办公室_123.png",
                "assets/backgrounds/办公室_123.png",
                "./assets/backgrounds/办公室_123.png",
                "http://localhost:8081/assets/backgrounds/办公室_123.png",
                "https://example.com/assets/backgrounds/办公室_123.png",
                "http://127.0.0.1:8081/assets/backgrounds/办公室_123.png",
        }) {
            File resolved = ImageReader.resolveBackgroundFile(raw);
            assertEquals(expected, resolved.getPath().replace('\\', '/'),
                    "解析结果不对: " + raw);
        }
    }

    @Test
    @DisplayName("裸文件名仍按素材目录解析（旧数据兼容）")
    void resolvesBareFileName() {
        File resolved = ImageReader.resolveBackgroundFile("办公室_123.png");
        assertTrue(resolved.getPath().replace('\\', '/').endsWith("/backgrounds/办公室_123.png"),
                "实际: " + resolved.getPath());
    }

    @Test
    @DisplayName("不认识的形态不产生 'http:' 这种非法目录段（那正是静默黑底的来源）")
    void neverProducesIllegalPathSegments() {
        for (String raw : new String[] {
                "http://localhost:8081/assets/backgrounds/x.png",
                "http://localhost:8081/other/x.png",
        }) {
            String path = ImageReader.resolveBackgroundFile(raw).getPath().replace('\\', '/');
            assertFalse(path.contains("http:"), "路径里不该出现 'http:' 段: " + path);
        }
    }
}
