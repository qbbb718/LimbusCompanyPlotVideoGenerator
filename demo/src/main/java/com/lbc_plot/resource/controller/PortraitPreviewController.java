package com.lbc_plot.resource.controller;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

import javax.imageio.ImageIO;

import org.jdbi.v3.core.Jdbi;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.lbc_plot.common.util.io.ImageReader;
import com.lbc_plot.config.ProjectConfig;
import com.lbc_plot.render.engine.PortraitPreviewRenderer;
import com.lbc_plot.resource.dao.BackgroundDAO;
import com.lbc_plot.resource.model.Background;

/**
 * 立绘场景预览控制器。
 *
 * <p>「资源管理 → 角色 → 编辑立绘」里点「预览」时调用：把当前裁剪框（可能还没保存）
 * 连同角色身高、所选背景一起交给 {@link PortraitPreviewRenderer}，返回一张与视频构图一致的
 * PNG（背景 + 立绘 + 边框 + 界面 UI，不含台词与角色名片）。
 *
 * <p>为什么用 multipart：新添加的立绘在原图上传到后端之前只存在于浏览器内存里，
 * 无法用 imagePath 读取。这里允许直接上传文件，预览就不会在磁盘上留下任何临时立绘文件
 * （文件只落到系统临时目录，渲染完即删）。已有立绘则只传 imagePath，不重复上传。
 */
@RestController
@RequestMapping("/api")
public class PortraitPreviewController {

    private static final Logger logger = LoggerFactory.getLogger(PortraitPreviewController.class);

    /** 立绘预览的默认输出尺寸（与设计画布一致；前端按容器宽度等比缩放显示）。 */
    private static final int PREVIEW_WIDTH = ProjectConfig.VIDEO_WIDTH;
    private static final int PREVIEW_HEIGHT = ProjectConfig.VIDEO_HEIGHT;

    @Autowired
    private Jdbi jdbi;

    /**
     * 渲染立绘在画面中的效果预览图。
     *
     * @param file         新立绘文件（可选；与 imagePath 二选一）
     * @param imagePath    已有立绘的相对路径（可选；file 为空时使用）
     * @param faceX        裁剪框左上角 X（原图像素）
     * @param faceY        裁剪框左上角 Y（原图像素）
     * @param length       裁剪框边长（原图像素）
     * @param adjX         立绘手动偏移 X
     * @param adjY         立绘手动偏移 Y
     * @param height       角色身高（cm）
     * @param backgroundId 预览用背景 ID；为空时取背景库第一张
     * @return PNG 图片字节流
     */
    @PostMapping(value = "/portraits/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> previewPortrait(
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "imagePath", required = false) String imagePath,
            @RequestParam(value = "faceX", defaultValue = "0") int faceX,
            @RequestParam(value = "faceY", defaultValue = "0") int faceY,
            @RequestParam(value = "length", defaultValue = "0") int length,
            @RequestParam(value = "adjX", defaultValue = "0") int adjX,
            @RequestParam(value = "adjY", defaultValue = "0") int adjY,
            @RequestParam(value = "height", defaultValue = "0") int height,
            @RequestParam(value = "backgroundId", required = false) String backgroundId) {

        long startTime = System.currentTimeMillis();
        Path tempFile = null;

        try {
            BufferedImage portraitImage;
            if (file != null && !file.isEmpty()) {
                // 新立绘：写到系统临时目录后走统一读图入口（WebP 会自动用 FFmpeg 兜底），
                // 渲染结束在 finally 里删除，不会污染 assets/characters。
                tempFile = Files.createTempFile("portrait-preview-", tempSuffix(file.getOriginalFilename()));
                file.transferTo(tempFile.toFile());
                portraitImage = ImageReader.readImageFile(tempFile.toFile());
                logger.info("立绘预览使用上传文件: 原文件名={}, 大小={} bytes",
                        file.getOriginalFilename(), file.getSize());
            } else if (imagePath != null && !imagePath.isBlank()) {
                portraitImage = ImageReader.readCharacters(imagePath);
                logger.info("立绘预览使用已有立绘: imagePath={}", imagePath);
            } else {
                throw new IllegalArgumentException("缺少立绘图片：请先选择立绘文件后再预览");
            }

            Background background = resolveBackground(backgroundId);
            if (background.getImage() == null) {
                throw new IllegalArgumentException("背景图片加载失败，请检查背景文件: " + background.getPath());
            }

            BufferedImage preview = PortraitPreviewRenderer.render(
                    portraitImage,
                    faceX,
                    faceY,
                    length,
                    adjX,
                    adjY,
                    height,
                    background,
                    background.getName(),
                    PREVIEW_WIDTH,
                    PREVIEW_HEIGHT);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(preview, "PNG", baos);
            byte[] imageBytes = baos.toByteArray();

            long elapsed = System.currentTimeMillis() - startTime;
            logger.info("立绘预览渲染完成: 背景={}, 尺寸={}x{}, 大小={} bytes, 耗时={} ms",
                    background.getName(), PREVIEW_WIDTH, PREVIEW_HEIGHT, imageBytes.length, elapsed);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.IMAGE_PNG);
            headers.setContentLength(imageBytes.length);
            headers.setCacheControl("no-cache");
            return ResponseEntity.ok().headers(headers).body(imageBytes);

        } catch (IOException e) {
            long elapsed = System.currentTimeMillis() - startTime;
            logger.error("立绘预览渲染失败: 耗时={} ms, 错误={}", elapsed, e.getMessage(), e);
            throw new RuntimeException("渲染立绘预览失败: " + e.getMessage(), e);
        } finally {
            if (tempFile != null) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException e) {
                    logger.warn("清理立绘预览临时文件失败: {}", tempFile, e);
                }
            }
        }
    }

    /**
     * 解析预览背景：优先使用指定 ID，未指定时取背景库第一张。
     *
     * <p>没有背景时直接报错而不是退化成纯色：预览的用途就是确认立绘在背景中的效果，
     * 一张没有背景的图会让人误以为背景丢失了。
     */
    private Background resolveBackground(String backgroundId) {
        Background background;
        if (backgroundId != null && !backgroundId.isBlank()) {
            background = jdbi.withExtension(BackgroundDAO.class,
                    dao -> dao.findById(backgroundId).orElse(null));
            if (background == null) {
                throw new IllegalArgumentException("预览背景不存在: " + backgroundId);
            }
        } else {
            List<Background> all = jdbi.withExtension(BackgroundDAO.class, BackgroundDAO::findAll);
            background = all.isEmpty() ? null : all.get(0);
        }

        if (background == null) {
            throw new IllegalArgumentException("没有可用的背景图，请先在资源管理的「背景」页添加背景");
        }
        return background;
    }

    /**
     * 临时文件后缀：优先沿用原文件扩展名，保证日志/错误信息里能看出格式；
     * 没有扩展名时用 .png（实际解码由文件头决定，WebP 不依赖扩展名）。
     */
    private static String tempSuffix(String originalFilename) {
        if (originalFilename != null) {
            int dot = originalFilename.lastIndexOf('.');
            if (dot >= 0) {
                String suffix = originalFilename.substring(dot).toLowerCase(Locale.ROOT);
                if (suffix.matches("\\.[a-z0-9]{1,5}")) {
                    return suffix;
                }
            }
        }
        return ".png";
    }
}
