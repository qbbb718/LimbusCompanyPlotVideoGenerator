package com.lbc_plot.common.util.json;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.lbc_plot.plot.model.Record;

import java.io.IOException;
import java.nio.file.*;
import java.util.List;

public class RecordsIO {
    private static final ObjectMapper mapper = new ObjectMapper();

    /**
     * 导出Records到文件
     */
    public static void exportRecords(List<Record> records, Path filePath) throws IOException {
        // 美化输出（缩进格式化）
        mapper.enable(SerializationFeature.INDENT_OUTPUT);
        mapper.writeValue(filePath.toFile(), records);
        System.out.println("导出成功: " + filePath);
    }

    /**
     * 从文件导入Records
     *
     * <p>兼容两种顶层形状：
     * <ol>
     *   <li>裸记录数组（本类的 {@link #exportRecords} 与旧版工程文件）；</li>
     *   <li>{@code {version, settings, records:[...]}} —— 新版工程文件（S2c-2 起，
     *       前端把工程级的 {@code stayFrames} 也写进文件）。若不兼容这一种，
     *       前端"导入工程 → 同步到后端"会静默失败，下次启动就看不到刚导入的工程。</li>
     * </ol>
     */
    public static List<Record> importRecords(Path filePath) throws IOException {
        JsonNode root = mapper.readTree(filePath.toFile());
        JsonNode listNode = root != null && root.isObject() ? root.get("records") : root;
        if (listNode == null || !listNode.isArray()) {
            throw new IOException("工程文件里没有记录数组（顶层既不是数组，也没有 records 字段）");
        }
        List<Record> records = mapper.convertValue(listNode, new TypeReference<List<Record>>() {
        });
        System.out.println("导入成功: " + records.size() + "条记录");
        return records;
    }

    /**
     * 加载所有记录
     */
    public static List<Record> loadRecords() {
        try {
            Path recordsPath = Paths.get("data/records.json");
            if (Files.exists(recordsPath)) {
                return importRecords(recordsPath);
            } else {
                System.out.println("记录文件不存在，返回空列表");
                return new java.util.ArrayList<>();
            }
        } catch (IOException e) {
            System.err.println("加载记录失败: " + e.getMessage());
            return new java.util.ArrayList<>();
        }
    }

    /**
     * 保存所有记录
     */
    public static void saveRecords(List<Record> records) {
        try {
            // 确保目录存在
            Path recordsPath = Paths.get("data/records.json");
            Path dir = recordsPath.getParent();
            if (dir != null && !Files.exists(dir)) {
                Files.createDirectories(dir);
            }

            exportRecords(records, recordsPath);
        } catch (IOException e) {
            System.err.println("保存记录失败: " + e.getMessage());
        }
    }
}