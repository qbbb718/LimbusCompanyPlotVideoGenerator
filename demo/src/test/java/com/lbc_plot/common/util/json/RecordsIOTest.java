package com.lbc_plot.common.util.json;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;

/**
 * 工程文件导入：顶层的两种形状都要认。
 *
 * <p>新版工程文件是 {@code {version, settings, records:[...]}}（前端 S2c-2 起，
 * 为了把工程级的 {@code stayFrames} 一起存下来）。这条链路的失败是**静默的**：
 * 前端"导入工程 → 同步到后端"失败只打一条 warn 日志，用户下次启动才发现工程没进来。
 */
@DisplayName("工程文件导入 - 顶层形状兼容")
class RecordsIOTest {

    @Test
    @DisplayName("裸记录数组（旧格式 / exportRecords 自己写的）照常导入")
    void importsLegacyArray(@TempDir Path temp) throws Exception {
        Path file = temp.resolve("records.json");
        RecordsIO.exportRecords(List.of(record("a", "旧记录")), file);

        List<Record> loaded = RecordsIO.importRecords(file);

        assertEquals(1, loaded.size());
        assertEquals("a", loaded.get(0).getUuid());
        assertEquals("旧记录", loaded.get(0).getDialogue().getText());
    }

    @Test
    @DisplayName("{version, settings, records} 取 records 段，settings 不参与记录解析")
    void importsObjectWithSettings(@TempDir Path temp) throws Exception {
        Path file = temp.resolve("project.json");
        Files.writeString(file, """
                {
                  "version": 1,
                  "settings": { "stayFrames": 120 },
                  "records": [ { "uuid": "b", "dialogue": { "text": "新记录" } } ]
                }
                """, StandardCharsets.UTF_8);

        List<Record> loaded = RecordsIO.importRecords(file);

        assertEquals(1, loaded.size());
        assertEquals("b", loaded.get(0).getUuid());
        assertEquals("新记录", loaded.get(0).getDialogue().getText());
    }

    @Test
    @DisplayName("既不是数组也没有 records 字段：明确报错，不返回空列表")
    void rejectsShapeWithoutRecords(@TempDir Path temp) throws Exception {
        Path file = temp.resolve("bad.json");
        Files.writeString(file, "{ \"version\": 1, \"settings\": { } }", StandardCharsets.UTF_8);

        assertThrows(IOException.class, () -> RecordsIO.importRecords(file));
    }

    private static Record record(String uuid, String text) {
        return new Record.Builder()
                .uuid(uuid)
                .dialogue(Dialogue.builder().text(text).speakerName(Dialogue.DEFAULT_NARRATOR).build())
                .build();
    }
}
