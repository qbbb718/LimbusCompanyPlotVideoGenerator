package com.lbc_plot.util.json;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import java.io.IOException;
import java.nio.file.*;
import java.util.List;
import com.lbc_plot.model.Record;

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
            new TypeReference<List<Record>>() {}
        );
        System.out.println("导入成功: " + records.size() + "条记录");
        return records;
    }
}