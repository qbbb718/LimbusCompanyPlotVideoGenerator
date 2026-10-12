package com.lbc_plot.plot.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.lbc_plot.plot.controller.RecordController.OutputTarget;

/**
 * {@link RecordController#resolveOutputTarget(String, String)} 的回归测试。
 *
 * <p>锁住两件事：
 * 1. "输出路径"填的是目录时，视频文件名由后端生成，且带"项目名称_"前缀
 *    （导出目录里往往躺着多个项目的视频，没有前缀就分不清）；
 * 2. 项目名称里的非法文件名字符会被过滤掉，不能因为用户随手起的项目名
 *    让 {@code new File(...)} 指到别的目录或直接创建失败。
 */
class RecordControllerOutputTargetTest {

    @Test
    void directoryPathGetsGeneratedNameWithProjectPrefix(@TempDir Path tempDir) {
        String outDir = tempDir.resolve("导出").toString();

        OutputTarget target = RecordController.resolveOutputTarget(outDir, "我的项目");

        assertEquals(new File(outDir).getAbsoluteFile(), target.outDir());
        String fileName = new File(target.baseOutputPath()).getName();
        assertTrue(fileName.startsWith("我的项目_video_"),
                "目录模式下文件名应是 项目名称_video_<时间戳>.mp4，实际: " + fileName);
        assertTrue(fileName.endsWith(".mp4"), "基础输出路径应是 .mp4，实际: " + fileName);
        assertEquals(target.outDir(), new File(target.baseOutputPath()).getParentFile(),
                "视频应生成在导出目录里");
    }

    @Test
    void blankProjectNameKeepsOriginalNaming(@TempDir Path tempDir) {
        String outDir = tempDir.resolve("导出").toString();

        for (String projectName : new String[] { null, "", "   " }) {
            OutputTarget target = RecordController.resolveOutputTarget(outDir, projectName);
            String fileName = new File(target.baseOutputPath()).getName();
            assertTrue(fileName.startsWith("video_"),
                    "项目名称为空时不应加前缀，实际: " + fileName);
        }
    }

    @Test
    void illegalFileNameCharsAreStrippedFromPrefix(@TempDir Path tempDir) {
        String outDir = tempDir.resolve("导出").toString();

        // 项目名里的路径分隔符/冒号/问号等若原样拼进路径，会指到别的目录或直接创建失败
        OutputTarget target = RecordController.resolveOutputTarget(outDir, "a/b:c*d?e\"f<g>h|i");

        String fileName = new File(target.baseOutputPath()).getName();
        assertEquals("abcdefghi_" + timestampPart(fileName), fileName,
                "非法文件名字符应被过滤掉，实际: " + fileName);
        assertEquals(target.outDir(), new File(target.baseOutputPath()).getParentFile(),
                "过滤后视频仍必须落在导出目录里");
    }

    @Test
    void prefixIsAppliedToExplicitVideoFileName(@TempDir Path tempDir) {
        // 老式用法：输出路径直接给了一个视频文件名（.mp4 结尾）→ 按文件处理
        String filePath = tempDir.resolve("成片.mp4").toString();

        OutputTarget target = RecordController.resolveOutputTarget(filePath, "我的项目");

        assertEquals(new File(tempDir.toString()).getAbsoluteFile(), target.outDir());
        assertEquals("我的项目_成片.mp4", new File(target.baseOutputPath()).getName());
    }

    @Test
    void dotOnlyProjectNameDegradesToNoPrefix(@TempDir Path tempDir) {
        String outDir = tempDir.resolve("导出").toString();

        // "." / ".." 这类名字会让 ".._video_x.mp4" 变得莫名其妙，过滤后为空就不加前缀
        OutputTarget target = RecordController.resolveOutputTarget(outDir, "..");

        String fileName = new File(target.baseOutputPath()).getName();
        assertFalse(fileName.contains(".."), "项目名过滤后不应残留点号，实际: " + fileName);
        assertTrue(fileName.startsWith("video_"), "过滤后为空时按无前缀处理，实际: " + fileName);
    }

    /** 从 "…_video_1234567890.mp4" 里取出 "video_1234567890.mp4" 部分，用于比对时间戳 */
    private static String timestampPart(String fileName) {
        int index = fileName.indexOf("video_");
        return index >= 0 ? fileName.substring(index) : fileName;
    }
}
