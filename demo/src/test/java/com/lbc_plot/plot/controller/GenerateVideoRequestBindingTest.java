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

    /**
     * 导出请求里的记录必须带上 effects：前端"特效"页勾选的起始转场（交叉溶解/黑屏/白屏）
     * 就是靠这个字段传到渲染端的，字段一旦被忽略，UI 勾了也没用，而且不会有任何报错。
     */
    @Test
    void recordEffectsAreBoundFromExportRequest() throws Exception {
        String json = """
                {
                  "records": [
                    {
                      "uuid": "r2",
                      "durationFrames": 30,
                      "effects": [ { "type": "FADE_FROM_BLACK", "enabled": true } ]
                    }
                  ],
                  "outputPath": "E:\\\\导出"
                }
                """;

        GenerateVideoRequest request = objectMapper.readValue(json, GenerateVideoRequest.class);

        assertEquals(1, request.getRecords().size(), "记录应被绑定");
        assertEquals(1, request.getRecords().get(0).getEffects().size(),
                "记录的特效列表应随请求体一起绑定（effects 不能被忽略）");
        assertEquals(com.lbc_plot.render.video.StartTransition.Kind.BLACK,
                com.lbc_plot.render.video.StartTransition.kindOf(request.getRecords().get(0)),
                "解析出来的记录应被判定为启用黑屏转场");
    }
}
