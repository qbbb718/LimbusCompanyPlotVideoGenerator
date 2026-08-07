package com.lbc_plot.plot.controller;

import java.util.List;
import java.util.ArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.Files;
import java.io.IOException;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.util.UUID;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;

import com.lbc_plot.common.util.json.RecordsIO;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.plot.parser.PlainTextRecordsParser;
import com.lbc_plot.render.audio.model.AudioCommand;
import com.lbc_plot.render.video.BackgroundVisual;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.EffectVisual;
import com.lbc_plot.render.engine.RenderOfImage;
import com.lbc_plot.render.engine.BatchVideoProcessor;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.resource.service.BackgroundService;
import com.lbc_plot.resource.service.CharacterService;

/**
 * 记录API控制器
 */
@RestController
@RequestMapping("/api")
public class RecordController {

    private static final Logger logger = LoggerFactory.getLogger(RecordController.class);

    @Autowired
    private CharacterService characterService;

    @Autowired
    private BackgroundService backgroundService;

    /**
     * 获取所有记录
     */
    @GetMapping("/records")
    public List<Record> getRecords() {
        try {
            // 尝试从文件中读取记录
            return RecordsIO.loadRecords();
        } catch (Exception e) {
            // 如果读取失败，返回空列表
            System.err.println("读取记录失败: " + e.getMessage());
            return new ArrayList<>();
        }
    }

    /**
     * 创建新记录
     */
    @PostMapping("/records")
    public Record createRecord(@RequestBody Record record) {
        try {
            // 获取现有记录
            List<Record> records = RecordsIO.loadRecords();

            // 添加新记录
            records.add(record);

            // 保存记录
            RecordsIO.saveRecords(records);

            return record;
        } catch (Exception e) {
            System.err.println("创建记录失败: " + e.getMessage());
            throw new RuntimeException("创建记录失败: " + e.getMessage());
        }
    }

    /**
     * 更新记录
     */
    @PutMapping("/records/{id}")
    public Record updateRecord(@PathVariable String id, @RequestBody Record record) {
        try {
            // 获取现有记录
            List<Record> records = RecordsIO.loadRecords();

            // 查找并更新记录
            for (int i = 0; i < records.size(); i++) {
                if (records.get(i).getUuid().equals(id)) {
                    records.set(i, record);
                    break;
                }
            }

            // 保存记录
            RecordsIO.saveRecords(records);

            return record;
        } catch (Exception e) {
            System.err.println("更新记录失败: " + e.getMessage());
            throw new RuntimeException("更新记录失败: " + e.getMessage());
        }
    }

    /**
     * 删除记录
     */
    @DeleteMapping("/records/{id}")
    public void deleteRecord(@PathVariable String id) {
        try {
            // 获取现有记录
            List<Record> records = RecordsIO.loadRecords();

            // 查找并删除记录
            records.removeIf(record -> record.getUuid().equals(id));

            // 保存记录
            RecordsIO.saveRecords(records);
        } catch (Exception e) {
            System.err.println("删除记录失败: " + e.getMessage());
            throw new RuntimeException("删除记录失败: " + e.getMessage());
        }
    }

    /**
     * 文本转记录
     */
    @PostMapping("/text-to-records")
    public List<Record> textToRecords(@RequestBody TextToRecordsRequest request) {
        try {
            // 使用文本解析器将文本转换为记录，传入数据库查找服务
            return PlainTextRecordsParser.parseText(request.getText(), characterService, backgroundService);
        } catch (Exception e) {
            System.err.println("文本转记录失败: " + e.getMessage());
            throw new RuntimeException("文本转记录失败: " + e.getMessage());
        }
    }

    /**
     * 生成视频
     * 接收 Record 列表及输出参数，调用 BatchVideoProcessor 合成最终视频文件。
     *
     * @param request 包含 records、outputPath、width、height、frameRate 的请求体
     * @return 包含输出路径和状态信息的响应
     */
    @PostMapping("/generate-video")
    public GenerateVideoResponse generateVideo(@RequestBody GenerateVideoRequest request) {
        long startTime = System.currentTimeMillis();
        logger.info("开始生成视频: record数={}, outputPath={}, {}x{} @ {}fps",
                request.getRecords() != null ? request.getRecords().size() : 0,
                request.getOutputPath(), request.getWidth(), request.getHeight(), request.getFrameRate());

        try {
            if (request.getRecords() == null || request.getRecords().isEmpty()) {
                throw new IllegalArgumentException("Record 列表为空，无法生成视频");
            }

            // 使用请求中的参数，未提供则使用默认值
            String outputPath = request.getOutputPath();
            if (outputPath == null || outputPath.trim().isEmpty()) {
                outputPath = "./output/video_" + System.currentTimeMillis() + ".mp4";
            }
            // 确保输出目录存在
            File outFile = new File(outputPath);
            File outDir = outFile.getParentFile();
            if (outDir != null && !outDir.exists()) {
                outDir.mkdirs();
            }

            int width = request.getWidth() > 0 ? request.getWidth() : ProjectConfig.VIDEO_WIDTH;
            int height = request.getHeight() > 0 ? request.getHeight() : ProjectConfig.VIDEO_HEIGHT;
            int frameRate = request.getFrameRate() > 0 ? request.getFrameRate() : ProjectConfig.FRAME_RATE;

            // 临时目录
            String tempDir = outDir != null ? outDir.getAbsolutePath() : "./output";
            File tempDirFile = new File(tempDir, "temp_" + System.currentTimeMillis());
            tempDirFile.mkdirs();

            // 调用批量视频处理器
            BatchVideoProcessor.processRecordList(
                    request.getRecords(),
                    outputPath,
                    tempDirFile.getAbsolutePath(),
                    true,  // plot = true
                    width,
                    height,
                    frameRate);

            long elapsed = System.currentTimeMillis() - startTime;
            logger.info("视频生成成功: outputPath={}, 耗时={} ms", outputPath, elapsed);

            return new GenerateVideoResponse(outputPath, "视频生成成功", elapsed);
        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - startTime;
            logger.error("生成视频失败: 耗时={} ms, 错误={}", elapsed, e.getMessage(), e);
            throw new RuntimeException("生成视频失败: " + e.getMessage(), e);
        }
    }

    /**
     * 渲染单条记录的预览图
     * 接收 Record JSON，调用 RenderOfImage.renderPre() 渲染为 PNG 图片返回。
     *
     * @param record 要渲染的 Record 对象（JSON body）
     * @param width  预览图宽度，默认 1280
     * @param height 预览图高度，默认 720
     * @return PNG 图片字节流
     */
    @PostMapping("/records/preview")
    public ResponseEntity<byte[]> renderPreview(
            @RequestBody Record record,
            @RequestParam(defaultValue = "1920") int width,
            @RequestParam(defaultValue = "1080") int height) {
        long startTime = System.currentTimeMillis();
        logger.info("开始渲染记录预览图: uuid={}, width={}, height={}", record.getUuid(), width, height);

        try {
            BufferedImage previewImage = RenderOfImage.renderPre(record, true, width, height);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(previewImage, "PNG", baos);
            byte[] imageBytes = baos.toByteArray();

            long elapsed = System.currentTimeMillis() - startTime;
            logger.info("预览图渲染完成: uuid={}, 大小={} bytes, 耗时={} ms",
                    record.getUuid(), imageBytes.length, elapsed);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.IMAGE_PNG);
            headers.setContentLength(imageBytes.length);
            headers.setCacheControl("no-cache");

            return ResponseEntity.ok().headers(headers).body(imageBytes);
        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - startTime;
            logger.error("预览图渲染失败: uuid={}, 耗时={} ms, 错误={}",
                    record.getUuid(), elapsed, e.getMessage(), e);
            throw new RuntimeException("渲染预览图失败: " + e.getMessage());
        }
    }

    /**
     * 导入记录
     */
    @PostMapping("/records/import")
    public List<Record> importRecords(@RequestParam("file") MultipartFile file) {
        try {
            // 创建临时文件
            String tempDir = System.getProperty("java.io.tmpdir");
            String fileName = UUID.randomUUID().toString() + ".json";
            Path tempFile = Paths.get(tempDir, fileName);

            // 保存上传的文件到临时位置
            Files.copy(file.getInputStream(), tempFile);

            // 使用RecordsIO导入记录
            List<Record> records = RecordsIO.importRecords(tempFile);

            // 保存导入的记录
            RecordsIO.saveRecords(records);

            // 删除临时文件
            Files.deleteIfExists(tempFile);

            return records;
        } catch (Exception e) {
            System.err.println("导入记录失败: " + e.getMessage());
            throw new RuntimeException("导入记录失败: " + e.getMessage());
        }
    }

    /**
     * 导出记录
     */
    @PostMapping("/records/export")
    public ResponseEntity<Resource> exportRecords(@RequestBody ExportRecordsRequest request) {
        try {
            // 创建临时文件
            String tempDir = System.getProperty("java.io.tmpdir");
            String fileName = "records_" + System.currentTimeMillis() + ".json";
            Path tempFile = Paths.get(tempDir, fileName);

            // 使用RecordsIO导出记录到临时文件
            RecordsIO.exportRecords(request.getRecords(), tempFile);

            // 创建资源对象
            Resource resource = new UrlResource(tempFile.toUri());

            // 设置响应头
            String contentType = "application/octet-stream";
            String headerValue = "attachment; filename=\"" + fileName + "\"";

            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(contentType))
                    .header(HttpHeaders.CONTENT_DISPOSITION, headerValue)
                    .body(resource);
        } catch (Exception e) {
            System.err.println("导出记录失败: " + e.getMessage());
            throw new RuntimeException("导出记录失败: " + e.getMessage());
        }
    }

    /**
     * 导出记录请求对象
     */
    public static class ExportRecordsRequest {
        private List<Record> records;

        public List<Record> getRecords() {
            return records;
        }

        public void setRecords(List<Record> records) {
            this.records = records;
        }
    }

    /**
     * 文本转记录请求对象
     */
    public static class TextToRecordsRequest {
        private String text;

        public String getText() {
            return text;
        }

        public void setText(String text) {
            this.text = text;
        }
    }

    /**
     * 生成视频请求对象
     */
    public static class GenerateVideoRequest {
        private List<Record> records;
        private String outputPath;
        private int width;
        private int height;
        private int frameRate;

        public List<Record> getRecords() {
            return records;
        }

        public void setRecords(List<Record> records) {
            this.records = records;
        }

        public String getOutputPath() {
            return outputPath;
        }

        public void setOutputPath(String outputPath) {
            this.outputPath = outputPath;
        }

        public int getWidth() {
            return width;
        }

        public void setWidth(int width) {
            this.width = width;
        }

        public int getHeight() {
            return height;
        }

        public void setHeight(int height) {
            this.height = height;
        }

        public int getFrameRate() {
            return frameRate;
        }

        public void setFrameRate(int frameRate) {
            this.frameRate = frameRate;
        }
    }

    /**
     * 生成视频响应对象
     */
    public static class GenerateVideoResponse {
        private String outputPath;
        private String message;
        private long elapsedMs;

        public GenerateVideoResponse() {
        }

        public GenerateVideoResponse(String outputPath, String message, long elapsedMs) {
            this.outputPath = outputPath;
            this.message = message;
            this.elapsedMs = elapsedMs;
        }

        public String getOutputPath() {
            return outputPath;
        }

        public void setOutputPath(String outputPath) {
            this.outputPath = outputPath;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public long getElapsedMs() {
            return elapsedMs;
        }

        public void setElapsedMs(long elapsedMs) {
            this.elapsedMs = elapsedMs;
        }
    }
}
