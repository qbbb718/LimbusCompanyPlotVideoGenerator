package com.lbc_plot.resource.controller;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
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
import com.lbc_plot.render.engine.PortraitPreviewRenderer.ComparePortrait;
import com.lbc_plot.resource.dao.BackgroundDAO;
import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.dao.PortraitDAO;
import com.lbc_plot.resource.model.Background;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.model.Portrait;

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
 *
 * <p>可选参数 {@code compare} 可以再塞几个<b>对比角色</b>（重复出现，值形如
 * {@code 立绘ID:水平偏移}）。它们只按 ID 从素材库里读，走与当前立绘同一套身高 + 裁剪规则，
 * 用来核对头框大小与站位是否与别的角色一致。对比角色画在当前立绘下层，不会盖住它。
 */
@RestController
@RequestMapping("/api")
public class PortraitPreviewController {

    private static final Logger logger = LoggerFactory.getLogger(PortraitPreviewController.class);

    /** 立绘预览的默认输出尺寸（与设计画布一致；前端按容器宽度等比缩放显示）。 */
    private static final int PREVIEW_WIDTH = ProjectConfig.VIDEO_WIDTH;
    private static final int PREVIEW_HEIGHT = ProjectConfig.VIDEO_HEIGHT;

    /**
     * 对比角色上限（与前端"左 / 右各一个"的布局一致，留一点余量）。
     *
     * <p>直接引用渲染器的常量：解析层和绘制层必须是同一个数，否则会出现
     * "解析通过、渲染时被默默丢掉一个"的怪现象。
     */
    private static final int MAX_COMPARE_PORTRAITS = PortraitPreviewRenderer.MAX_COMPARE_PORTRAITS;

    /** 对比角色的水平偏移上限：超过一个画面宽度就没有意义了。 */
    private static final int MAX_COMPARE_OFFSET = ProjectConfig.VIDEO_WIDTH;

    @Autowired
    private Jdbi jdbi;

    /**
     * 渲染立绘在画面中的效果预览图。
     *
     * @param file              新立绘文件（可选；与 imagePath 二选一）
     * @param imagePath         已有立绘的相对路径（可选；file 为空时使用）
     * @param faceX             裁剪框左上角 X（原图像素）
     * @param faceY             裁剪框左上角 Y（原图像素）
     * @param length            裁剪框边长（原图像素）
     * @param adjX              立绘手动偏移 X
     * @param adjY              立绘手动偏移 Y
     * @param height            角色身高（cm）
     * @param backgroundId      预览用背景 ID；为空时取背景库第一张
     * @param compares          对比角色，重复参数，每个值形如 {@code 立绘ID:水平偏移}；
     *                          水平偏移为 1080p 设计画布像素（负数在左，正数在右）
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
            @RequestParam(value = "backgroundId", required = false) String backgroundId,
            @RequestParam(value = "compare", required = false) List<String> compares) {

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

            List<ComparePortrait> comparePortraits = resolveComparePortraits(compares);

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
                    PREVIEW_HEIGHT,
                    comparePortraits);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(preview, "PNG", baos);
            byte[] imageBytes = baos.toByteArray();

            long elapsed = System.currentTimeMillis() - startTime;
            logger.info("立绘预览渲染完成: 背景={}, 对比角色={} 个, 尺寸={}x{}, 大小={} bytes, 耗时={} ms",
                    background.getName(), comparePortraits.size(),
                    PREVIEW_WIDTH, PREVIEW_HEIGHT, imageBytes.length, elapsed);

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
     * 解析 {@code compare} 参数。
     *
     * <p>格式 {@code 立绘ID:水平偏移}（立绘 ID 是 UUID，不含冒号，所以从最后一个冒号切开）。
     * 格式不对时直接报错而不是静默忽略：前端拿不到任何反馈的话，用户只会看到"加了对比角色
     * 但画面上没有"，反而更难排查。
     *
     * <p>包级可见，方便单测直接验证解析规则。
     *
     * @param specs 原始参数（可为 null）
     * @return 解析结果；空参数返回空列表
     */
    static List<CompareSpec> parseCompareSpecs(List<String> specs) {
        if (specs == null || specs.isEmpty()) {
            return List.of();
        }

        List<CompareSpec> parsed = new ArrayList<>();
        for (String spec : specs) {
            if (parsed.size() >= MAX_COMPARE_PORTRAITS) {
                logger.warn("对比角色超过上限 {} 个，多余的已忽略", MAX_COMPARE_PORTRAITS);
                break;
            }
            if (spec == null || spec.isBlank()) {
                continue;
            }

            int separator = spec.lastIndexOf(':');
            if (separator <= 0 || separator == spec.length() - 1) {
                throw new IllegalArgumentException(
                        "对比角色参数格式不正确：" + spec + "（应为 立绘ID:水平偏移）");
            }

            String portraitId = spec.substring(0, separator).trim();
            if (portraitId.isEmpty()) {
                throw new IllegalArgumentException(
                        "对比角色参数格式不正确：" + spec + "（立绘ID不能为空）");
            }

            int offsetX;
            try {
                offsetX = Integer.parseInt(spec.substring(separator + 1).trim());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException(
                        "对比角色参数格式不正确：" + spec + "（水平偏移必须是整数）");
            }
            offsetX = Math.max(-MAX_COMPARE_OFFSET, Math.min(MAX_COMPARE_OFFSET, offsetX));
            parsed.add(new CompareSpec(portraitId, offsetX));
        }
        return parsed;
    }

    /**
     * 按 {@code compare} 参数从素材库里读出对比立绘。
     *
     * <p>一条 {@link Jdbi#useHandle} 里把立绘和角色都查出来：对比角色虽然最多 4 个，
     * 但每个都单独 {@code withExtension} 会多借还几次连接，也可能读到不同的数据库快照。
     * 原图解码放到连接归还之后 —— WebP 解码可能要几十毫秒，不该占着连接。
     *
     * <p>数据有问题时给出带角色名 / 立绘名的原因，而不是静默少画一个人：
     * 用户明明加了对比角色、画面上却没有，比直接报错更难排查。
     */
    private List<ComparePortrait> resolveComparePortraits(List<String> specs) {
        List<CompareSpec> parsed = parseCompareSpecs(specs);
        if (parsed.isEmpty()) {
            return List.of();
        }

        List<Portrait> portraits = new ArrayList<>(parsed.size());
        List<MyCharacter> characters = new ArrayList<>(parsed.size());

        jdbi.useHandle(handle -> {
            PortraitDAO portraitDAO = handle.attach(PortraitDAO.class);
            CharacterDAO characterDAO = handle.attach(CharacterDAO.class);

            for (CompareSpec spec : parsed) {
                Portrait portrait = portraitDAO.findById(spec.portraitId()).orElse(null);
                if (portrait == null) {
                    throw new IllegalArgumentException(
                            "对比立绘不存在：" + spec.portraitId() + "（可能已被删除，请重新选择）");
                }

                MyCharacter character = characterDAO.findById(portrait.getCharacterID()).orElse(null);
                if (character == null) {
                    throw new IllegalArgumentException(
                            "对比立绘所属角色不存在：" + portrait.getCharacterID() + "（角色可能已被删除）");
                }

                portraits.add(portrait);
                characters.add(character);
            }
        });

        List<ComparePortrait> result = new ArrayList<>(parsed.size());
        for (int i = 0; i < parsed.size(); i++) {
            CompareSpec spec = parsed.get(i);
            Portrait portrait = portraits.get(i);
            MyCharacter character = characters.get(i);

            try {
                portrait.setImage(ImageReader.readCharacters(portrait.getImagePath()));
            } catch (IOException e) {
                throw new IllegalArgumentException("对比立绘图片读取失败："
                        + character.getCharacterName() + " / " + portrait.getPortName()
                        + "（" + e.getMessage() + "）", e);
            }

            logger.info("立绘预览对比角色: {} / {}, 水平偏移={}",
                    character.getCharacterName(), portrait.getPortName(), spec.offsetX());
            result.add(new ComparePortrait(character, portrait, spec.offsetX()));
        }
        return result;
    }

    /**
     * 解析后的对比角色参数（立绘 ID + 水平偏移）。
     *
     * <p>包级可见：单测直接断言解析结果，不必启动渲染。
     */
    record CompareSpec(String portraitId, int offsetX) {
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
