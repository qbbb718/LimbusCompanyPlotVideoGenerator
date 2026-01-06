package com.lbc_plot.common.util.json;

import com.fasterxml.jackson.core.type.TypeReference;
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
     */
    public static List<Record> importRecords(Path filePath) throws IOException {
        List<Record> records = mapper.readValue(
                filePath.toFile(),
                new TypeReference<List<Record>>() {
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