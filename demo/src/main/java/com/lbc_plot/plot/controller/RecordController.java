package com.lbc_plot.plot.controller;

import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

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

import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.common.util.io.ExportNoticeWriter;
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
import com.lbc_plot.render.engine.VideoProgressTracker;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.config.AppSettingsService;
import com.lbc_plot.resource.service.BackgroundService;
import com.lbc_plot.resource.service.CharacterService;

/**
 * 记录API控制器
 */
@RestController
@RequestMapping("/api")
public class RecordController {

    private static final Logger logger = LoggerFactory.getLogger(RecordController.class);

    /**
     * 输出路径里出现这些扩展名时，说明用户给的是视频文件名而不是导出目录。
     * 导出目录本身叫 "xxx.mp4" 这种极端情况按文件处理即可，不影响正常使用。
     */
    private static final java.util.regex.Pattern VIDEO_FILE_PATTERN =
            java.util.regex.Pattern.compile("(?i).*\\.(mp4|mov)$");

    @Autowired
    private CharacterService characterService;

    @Autowired
    private BackgroundService backgroundService;

    @Autowired
    private AppSettingsService appSettingsService;

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
     * 获取应用设置（从数据库加载持久化配置）
     */
    @GetMapping("/settings")
    public Map<String, String> getSettings() {
        return appSettingsService.getAll();
    }

    /**
     * 保存应用设置到数据库
     */
    @PutMapping("/settings")
    public Map<String, String> updateSettings(@RequestBody Map<String, String> settings) {
        appSettingsService.setAll(settings);
        logger.info("应用设置已保存: {} 项", settings.size());
        return appSettingsService.getAll();
    }

    /**
     * 查询视频生成进度
     */
    @GetMapping("/generate-video/progress/{taskId}")
    public VideoProgressTracker.ProgressState getVideoProgress(@PathVariable String taskId) {
        VideoProgressTracker.ProgressState state = VideoProgressTracker.getProgress(taskId);
        if (state == null) {
            throw new RuntimeException("任务不存在或已过期: " + taskId);
        }
        return state;
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
     * 生成视频（异步）
     * 接收 Record 列表及输出参数，在后台调用 BatchVideoProcessor 合成最终视频文件。
     * 立即返回 taskId，前端通过 GET /api/generate-video/progress/{taskId} 轮询进度。
     *
     * @param request 包含 records、outputPath、width、height、frameRate 的请求体
     * @return 包含 taskId 的响应
     */
    @PostMapping("/generate-video")
    public GenerateVideoResponse generateVideo(@RequestBody GenerateVideoRequest request) {
        logger.info("收到视频生成请求: record数={}, outputPath={}, {}x{} @ {}fps, layerTypes={}",
                request.getRecords() != null ? request.getRecords().size() : 0,
                request.getOutputPath(), request.getWidth(), request.getHeight(), request.getFrameRate(),
                request.getLayerTypes());

        if (request.getRecords() == null || request.getRecords().isEmpty()) {
            throw new IllegalArgumentException("Record 列表为空，无法生成视频");
        }

        // 解析导出目录与基础输出路径（目录不存在时会被创建）
        OutputTarget target = resolveOutputTarget(request.getOutputPath());
        final File outDir = target.outDir();
        String outputPath = target.baseOutputPath();

        final int width = request.getWidth() > 0 ? request.getWidth() : ProjectConfig.VIDEO_WIDTH;
        final int height = request.getHeight() > 0 ? request.getHeight() : ProjectConfig.VIDEO_HEIGHT;
        final int frameRate = request.getFrameRate() > 0 ? request.getFrameRate() : ProjectConfig.FRAME_RATE;
        final List<Record> records = request.getRecords();

        // 获取导出分层类型，默认为完整视频
        final List<String> layerTypes;
        List<String> reqLayerTypes = request.getLayerTypes();
        if (reqLayerTypes == null || reqLayerTypes.isEmpty()) {
            layerTypes = java.util.Collections.singletonList("FULL");
        } else {
            layerTypes = reqLayerTypes;
        }

        // 分层后缀映射 (suffix, extension)
        // 透明层使用 .mov (QTRLE编码含alpha通道)，不透明层使用 .mp4
        final java.util.Map<String, String> layerSuffixes = java.util.Map.of(
                "FULL", "_full",
                "UI_ONLY", "_ui",
                "BG_CHARACTERS", "_bg_characters",
                "BACKGROUND_ONLY", "_bg",
                "CHARACTERS_ONLY", "_characters");
        // 需要透明通道的分层 → .mov 格式
        final java.util.Set<String> transparentLayers = java.util.Set.of("UI_ONLY", "CHARACTERS_ONLY");

        // 基础输出路径（去掉 .mp4 后缀，稍后按分层追加）
        final String baseOutputPath = outputPath.replaceAll("(?i)\\.mp4$", "");
        final List<String> outputPaths = new java.util.ArrayList<>();

        // 创建进度跟踪任务（总 record 数 * 分层数）
        String taskId = VideoProgressTracker.createTask(records.size() * layerTypes.size());

        CompletableFuture.runAsync(() -> {
            long startTime = System.currentTimeMillis();
            try {
                for (String layerType : layerTypes) {
                    String suffix = layerSuffixes.getOrDefault(layerType, "");
                    String ext = transparentLayers.contains(layerType) ? ".mov" : ".mp4";
                    String layerOutputPath = baseOutputPath + suffix + ext;
                    outputPaths.add(layerOutputPath);

                    // 每个分层使用独立的临时目录，避免缓存冲突
                    File layerTempDir = new File(outDir, "temp" + suffix);
                    layerTempDir.mkdirs();

                    logger.info("开始生成分层视频: layerType={}, outputPath={}", layerType, layerOutputPath);

                    BatchVideoProcessor.processRecordList(
                            records,
                            layerOutputPath,
                            layerTempDir.getAbsolutePath(),
                            true,  // plot = true
                            width,
                            height,
                            frameRate,
                            (stage, current, total, message) -> {
                                VideoProgressTracker.updateProgress(taskId, stage, current, total,
                                        "[" + layerType + "] " + message);
                            },
                            layerType,
                            request.isKeepTempFiles());
                }

                long elapsed = System.currentTimeMillis() - startTime;
                logger.info("视频生成成功: outputPaths={}, 耗时={} ms", outputPaths, elapsed);

                // 导出目录里追加"美术素材来源"提示文件，供用户发布视频时注明出处
                ExportNoticeWriter.writeNoticeFile(outDir);

                VideoProgressTracker.markComplete(taskId,
                        outputPaths.size() == 1 ? outputPaths.get(0) : String.join(", ", outputPaths),
                        elapsed);

                // 标记所有 Record 为 clean 并持久化
                for (Record r : records) {
                    r.markClean();
                }
                RecordsIO.saveRecords(records);
                logger.info("所有 {} 条记录已标记为 clean 并保存", records.size());
            } catch (Exception e) {
                long elapsed = System.currentTimeMillis() - startTime;
                logger.error("生成视频失败: 耗时={} ms, 错误={}", elapsed, e.getMessage(), e);
                VideoProgressTracker.markError(taskId, "生成视频失败: " + e.getMessage());
            }
        });

        return new GenerateVideoResponse(taskId, "视频生成已启动 (" + layerTypes.size() + " 个分层)", 0);
    }

    /**
     * 渲染单条记录的预览图（支持磁盘缓存）
     * 接收 Record JSON，调用 RenderOfImage.renderPre() 渲染为 PNG 图片返回。
     * 缓存文件: projects/temp/previews/preview_{uuid}_{width}x{height}.png
     *
     * @param record       要渲染的 Record 对象（JSON body）
     * @param width        预览图宽度，默认 1920
     * @param height       预览图高度，默认 1080
     * @param forceRefresh 强制重新渲染（跳过缓存）
     * @return PNG 图片字节流
     */
    @PostMapping("/records/preview")
    public ResponseEntity<byte[]> renderPreview(
            @RequestBody Record record,
            @RequestParam(defaultValue = "1920") int width,
            @RequestParam(defaultValue = "1080") int height,
            @RequestParam(defaultValue = "false") boolean forceRefresh) {
        long startTime = System.currentTimeMillis();
        logger.info("预览图请求: uuid={}, width={}, height={}, forceRefresh={}",
                record.getUuid(), width, height, forceRefresh);

        try {
            // 构建缓存路径（锚定到数据根目录，不随 JVM 工作目录变化）
            Path cacheDir = RuntimePaths.getTempDir().resolve("previews");
            if (!Files.exists(cacheDir)) {
                Files.createDirectories(cacheDir);
            }
            String cacheFileName = String.format("preview_%s_%dx%d.png",
                    record.getUuid(), width, height);
            Path cacheFile = cacheDir.resolve(cacheFileName);

            // 非强制刷新且缓存存在 → 直接返回
            if (!forceRefresh && Files.exists(cacheFile)) {
                byte[] cachedBytes = Files.readAllBytes(cacheFile);
                long elapsed = System.currentTimeMillis() - startTime;
                logger.info("预览图缓存命中: uuid={}, 大小={} bytes, 耗时={} ms",
                        record.getUuid(), cachedBytes.length, elapsed);

                HttpHeaders headers = new HttpHeaders();
                headers.setContentType(MediaType.IMAGE_PNG);
                headers.setContentLength(cachedBytes.length);
                return ResponseEntity.ok().headers(headers).body(cachedBytes);
            }

            // 渲染 + 写缓存
            BufferedImage previewImage = RenderOfImage.renderPre(record, true, width, height);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(previewImage, "PNG", baos);
            byte[] imageBytes = baos.toByteArray();

            // 保存到磁盘缓存
            Files.write(cacheFile, imageBytes);
            logger.info("预览图已缓存: {}", cacheFile.toAbsolutePath());

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

            // 导入后标记所有记录为 clean，使预览图缓存可用
            for (Record r : records) {
                r.markClean();
            }

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
     * @function 解析视频导出目标（导出目录 + 基础输出路径）
     *
     * 前端"设置 → 输出路径"里填的是导出目录（由文件夹选择框选出来的），所以默认按目录处理：
     * 目录不存在就创建，视频文件名由后端生成（video_&lt;时间戳&gt;.mp4，之后按分层追加后缀）。
     * 只有明确给了视频文件名（.mp4/.mov 结尾）或路径指向一个已存在的文件时，才当成文件路径。
     *
     * 旧实现用 outFile.isDirectory() 判断，目录还不存在时会被误判成文件名，
     * 于是 "…\输出测试" 变成了 "…\输出测试_full.mp4"，落在上一级目录里。
     *
     * @param requestedPath 请求里的输出路径，为空时使用默认目录 ./output
     * @return 导出目录与基础输出路径
     * @throws IllegalStateException 输出目录创建失败（尽早报错，避免渲染到一半才失败）
     */
    static OutputTarget resolveOutputTarget(String requestedPath) {
        String path = requestedPath == null ? "" : requestedPath.trim();
        if (path.isEmpty()) {
            path = "./output";
        }

        File outFile = new File(path);
        boolean treatAsFile = VIDEO_FILE_PATTERN.matcher(outFile.getName()).matches() || outFile.isFile();

        File outDir;
        String baseOutputPath;
        if (treatAsFile) {
            // 文件路径：视频写到它所在的目录，文件名沿用用户给的（后面再追加分层后缀）
            outDir = outFile.getAbsoluteFile().getParentFile();
            baseOutputPath = outFile.getAbsolutePath();
        } else {
            // 目录路径：当作导出目录，文件名由后端生成
            outDir = outFile.getAbsoluteFile();
            baseOutputPath = new File(outDir, "video_" + System.currentTimeMillis() + ".mp4").getAbsolutePath();
        }

        if (outDir != null && !outDir.isDirectory() && !outDir.mkdirs() && !outDir.isDirectory()) {
            throw new IllegalStateException("无法创建输出目录: " + outDir.getAbsolutePath());
        }
        return new OutputTarget(outDir, baseOutputPath);
    }

    /** 导出目标：视频所在的导出目录 + 尚未追加分层后缀的基础输出路径 */
    record OutputTarget(File outDir, String baseOutputPath) {
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
        private List<String> layerTypes;
        private boolean keepTempFiles;

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

        public List<String> getLayerTypes() {
            return layerTypes;
        }

        public void setLayerTypes(List<String> layerTypes) {
            this.layerTypes = layerTypes;
        }

        public boolean isKeepTempFiles() {
            return keepTempFiles;
        }

        public void setKeepTempFiles(boolean keepTempFiles) {
            this.keepTempFiles = keepTempFiles;
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
