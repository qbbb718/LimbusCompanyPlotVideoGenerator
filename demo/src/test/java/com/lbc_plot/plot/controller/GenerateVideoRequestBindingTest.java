package com.lbc_plot.plot.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lbc_plot.plot.controller.RecordController.GenerateVideoRequest;

/**
 * 生成视频请求体（前端 → 后端）的字段契约测试。
 *
 * <p>锁住"全局设置"里两项设置的传递方式：
 * <ul>
 *   <li>{@code projectName}：导出视频文件名前缀，前端传的是项目名称；</li>
 *   <li>{@code plot}：剧情类型，选「剧情」传 true、选「人格故事」传 false；
 *       字段缺失时必须保持旧行为（true），否则老版本前端/其它调用方会被悄悄改成非剧情模式。</li>
 * </ul>
 */
class GenerateVideoRequestBindingTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void storyTypeAndProjectNameAreBoundFromJson() throws Exception {
        String json = """
                {
                  "records": [],
                  "outputPath": "E:\\\\导出",
                  "projectName": "我的项目",
                  "plot": false
                }
                """;

        GenerateVideoRequest request = objectMapper.readValue(json, GenerateVideoRequest.class);

        assertEquals("我的项目", request.getProjectName());
        assertFalse(request.isPlot(), "选「人格故事」时 plot 必须是 false");
    }

    @Test
    void plotDefaultsToTrueWhenFieldIsAbsent() throws Exception {
        GenerateVideoRequest request = objectMapper.readValue("{\"outputPath\":\"E:\\\\导出\"}",
                GenerateVideoRequest.class);

        assertTrue(request.isPlot(),
                "未传 plot 的调用方（字段出现前的旧前端）必须仍按剧情模式导出");
        assertEquals(null, request.getProjectName(), "项目名称缺失时不应加文件名前缀");
    }

    @Test
    void plotTrueIsBoundFromJson() throws Exception {
        GenerateVideoRequest request = objectMapper.readValue("{\"plot\":true}", GenerateVideoRequest.class);

        assertTrue(request.isPlot(), "选「剧情」时 plot 必须是 true");
    }
}
