package com.lbc_plot.render.engine;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.List;
import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.lbc_plot.render.engine.manager.FontLoader;
import com.lbc_plot.common.util.ImageCropper;
import com.lbc_plot.common.util.ImageDarkener;
import com.lbc_plot.common.util.RenderQualityUtils;
import com.lbc_plot.common.util.RuntimePaths;
import com.lbc_plot.common.util.TextureColorizer;
import com.lbc_plot.common.util.io.ImageReader;
import com.lbc_plot.config.ProjectConfig;
import net.coobird.thumbnailator.Thumbnails;

import com.lbc_plot.render.service.impl.CharacterServiceImpl;
import com.lbc_plot.render.video.BackgroundVisual;
import com.lbc_plot.render.video.Camera;
import com.lbc_plot.render.video.CharacterRef;
import com.lbc_plot.render.video.CharacterVisual;
import com.lbc_plot.render.video.TempImageVisual;
import com.lbc_plot.plot.model.Dialogue;
import com.lbc_plot.plot.model.Record;
import com.lbc_plot.resource.dao.CharacterDAO;
import com.lbc_plot.resource.model.MyCharacter;
import com.lbc_plot.resource.service.CharacterService;

/**
 * 渲染图片
 */

public class RenderOfImage {
    private static final Logger logger = LoggerFactory.getLogger(RenderOfImage.class);

    /**
     * 剧情画面（背景 + 立绘 + 临时图片 + 边框）在画布中的占比。
     * 合成后在四周留出 10% 黑边，即居中缩放到 80%。
     */
    private static final float PLOT_SCENE_SCALE = 0.8f;

    /**
     * 四周黑色渐变遮罩的<b>半衰距离</b>（不透明度降到 0.5 处，单位：1080p 设计画布像素）。
     *
     * <p>这两个数不是拍脑袋定的，是从<b>原作画面反解</b>出来的（做法与实测对照见
     * docs/项目文档.md 的「四周的黑色渐变遮罩」一节）：拿"原作帧 + 同款背景"逐像素求
     * {@code alpha = 1 - 原作亮度 / 背景亮度}，再对每个方向拟合
     * {@code alpha(d) = 1/(1+(d/半衰距离)^q)}。
     *
     * <p>之所以不再直接用 {@code border_1080p.png}：那张素材只有约 45px 的线性渐变
     * （剧情模式缩到 0.8 后成片里只剩 36px），而原作那道遮罩是一条宽得多的柔和暗角 ——
     * 反解出来 1080p 空间里左右要到 81px、上下要到 64px 才降到一半，
     * 一直延伸到约 190px 才完全消失。用 45px 的素材无论怎么加深都做不出这个"柔边"，
     * 成片看起来就是"画面被一条硬黑边切进去"。
     *
     * <p>换算到成片（0.8 缩放）像素：左右 65px、上下 51px 处降到一半。
     */
    private static final float BORDER_MASK_HALF_X = 81.25f; // = 65 / PLOT_SCENE_SCALE

    /** 上下方向遮罩的半衰距离，见 {@link #BORDER_MASK_HALF_X}。 */
    private static final float BORDER_MASK_HALF_Y = 63.75f; // = 51 / PLOT_SCENE_SCALE

    /**
     * 遮罩曲线陡度 q：{@code alpha(d) = 1 / (1 + (d / 半衰距离)^q)}。
     *
     * <p>反解出的三条边共用 q≈3.0（左右单独拟合 3.36、上下 2.74，取共用值后
     * 重建误差只差 0.1 个亮度级）。数值越大越接近"黑边 + 硬过渡"，越小越糊。
     */
    private static final float BORDER_MASK_FALLOFF = 3.0f;

    static BufferedImage border, dialogBox, speaker_camp, speaker_name, location;

    /** 临时名片缓存：key = "name|faction" */
    private static final java.util.concurrent.ConcurrentHashMap<String, BufferedImage> tempCardCache = new java.util.concurrent.ConcurrentHashMap<>();

    /** 临时名片缓存目录（锚定到数据根目录，不随 JVM 工作目录变化） */
    private static final String TEMP_CARD_DIR = RuntimePaths.toPortableString(
            RuntimePaths.getTempDir().resolve("cards")) + "/";
    // 静态代码块 - 类加载时自动执行
    // 读入图片文件
    static {
        try {
            border = buildBorderMask(designWidth(), designHeight());
            dialogBox = ImageReader.readUI("dialogBox.png");
            speaker_camp = ImageReader.readUI("speaker-camp.png");
            speaker_name = ImageReader.readUI("speaker-name.png");
            location = ImageReader.readUI("location.png");

            logger.info("静态资源加载完成");
        } catch (IOException e) {
            logger.error("加载静态资源失败", e);
            // 可以设置默认图像或抛出异常
        }
    }

    /**
     * 生成四周黑色渐变遮罩（{@link #BORDER_MASK_HALF_X} 那组参数的低层实现）。
     *
     * <p>纯黑 + 四边向内的柔和暗角，只在类加载时算一次，渲染时仍是一次 {@code drawImage}，
     * 逐帧没有额外开销。每个像素的不透明度取"水平/垂直两条渐变按 SRC_OVER 叠加"：
     * <pre>
     *   dx = min(x, w-1-x)          dy = min(y, h-1-y)
     *   ax = 1 / (1 + (dx / 半衰X)^q)   ay = 1 / (1 + (dy / 半衰Y)^q)
     *   alpha = 1 - (1-ax)(1-ay)
     * </pre>
     * 用"叠加"而不是"取较大者"：角上两条边会一起压暗，过渡沿对角线更柔和
     * （用原作帧的右上角取样对照过，叠加比取较大者更接近实测）。
     *
     * @param width  遮罩宽度（设计画布像素）
     * @param height 遮罩高度（设计画布像素）
     * @return 纯黑、带 alpha 渐变的遮罩；尺寸不足 3px 时返回 {@code null}
     */
    private static BufferedImage buildBorderMask(int width, int height) {
        if (width < 3 || height < 3) {
            logger.error("遮罩尺寸非法: {}x{}", width, height);
            return null;
        }
        BufferedImage mask = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        java.awt.image.DataBuffer buffer = mask.getRaster().getDataBuffer();
        if (!(buffer instanceof java.awt.image.DataBufferInt)) {
            logger.error("遮罩像素格式异常，跳过遮罩");
            return null;
        }

        // 一维曲线先算好：整幅只要 O(w+h) 次 pow，而不是 O(w*h) 次
        int[] alphaX = new int[width];
        int bandX = 0;
        for (int x = 0; x < width; x++) {
            alphaX[x] = maskAlpha(Math.min(x, width - 1 - x), BORDER_MASK_HALF_X);
        }
        while (bandX < width / 2 && alphaX[bandX] > 0) {
            bandX++; // 左右渐变带的宽度
        }
        int[] alphaY = new int[height];
        for (int y = 0; y < height; y++) {
            alphaY[y] = maskAlpha(Math.min(y, height - 1 - y), BORDER_MASK_HALF_Y);
        }

        int[] pixels = ((java.awt.image.DataBufferInt) buffer).getData();
        int midEnd = Math.max(bandX, width - bandX);
        for (int y = 0; y < height; y++) {
            int ay = alphaY[y];
            int rowOffset = y * width;
            if (ay == 0) {
                // 不在上下渐变带里：只有左右两侧要写，中间整段都是透明的（新图本来就是 0）
                for (int x = 0; x < bandX; x++) {
                    pixels[rowOffset + x] = alphaX[x] << 24; // 纯黑
                }
                for (int x = width - bandX; x < width; x++) {
                    pixels[rowOffset + x] = alphaX[x] << 24;
                }
                continue;
            }
            // 在上下渐变带里：两侧取值叠加，中间那一段只剩上下分量（= ay）
            for (int x = 0; x < bandX; x++) {
                pixels[rowOffset + x] = combineAlpha(alphaX[x], ay) << 24;
            }
            for (int x = bandX; x < midEnd; x++) {
                pixels[rowOffset + x] = ay << 24;
            }
            for (int x = midEnd; x < width; x++) {
                pixels[rowOffset + x] = combineAlpha(alphaX[x], ay) << 24;
            }
        }
        logger.debug("黑色渐变遮罩生成: {}x{}, 半衰 X={}px Y={}px, q={}, 渐变带宽 X={}px",
                width, height, BORDER_MASK_HALF_X, BORDER_MASK_HALF_Y, BORDER_MASK_FALLOFF, bandX);
        return mask;
    }

    /**
     * 两条渐变在同一个像素上的合成：{@code 1-(1-ax)(1-ay)}（等价于把垂直那条按 SRC_OVER 叠在水平那条上）。
     *
     * @param ax 水平分量 0~255
     * @param ay 垂直分量 0~255
     * @return 合成后的不透明度 0~255
     */
    private static int combineAlpha(int ax, int ay) {
        return 255 - ((255 - ax) * (255 - ay) + 127) / 255;
    }

    /** 离边缘 {@code d} 像素处的不透明度（0~255）：{@code 1/(1+(d/半衰)^q)} */
    private static int maskAlpha(int d, float halfDistance) {
        if (d <= 0) {
            return 255;
        }
        double alpha = 1.0 / (1.0 + Math.pow(d / (double) halfDistance, BORDER_MASK_FALLOFF));
        int value = (int) Math.round(alpha * 255);
        return Math.max(0, Math.min(255, value));
    }

    /**
     * 设计画布宽度。
     *
     * <p>
     * <b>为什么渲染必须先画在 1080p 设计画布上：</b>所有素材的坐标与比例都是按 1080p 标定的 ——
     * {@link ProjectConfig} 里的字号/锚点、{@link CharacterVisual#getPosX()} 的立绘位置、
     * 立绘缩放比（{@code DEFAULT_CHARACTER_HEAD_LENGTH / portrait.length}）、
     * {@code dialogBox.png} / {@code location.png} 等 UI 素材的原始像素尺寸，全都是 1080p 空间里的数值。
     * 因此画布尺寸与输出分辨率必须解耦：{@code renderXxx(record, plot, width, height)} 的
     * {@code width/height} 只是<strong>最终输出尺寸</strong>，内部一律在 1080p 设计画布上合成，
     * 最后<strong>只缩放一次</strong>到输出尺寸（见 {@link #composeFinalImage}）。
     *
     * <p>
     * 反面教材（本类修复前的写法）：把背景/UI 提前缩放成输出尺寸，再把它们塞进 1080p 画布，
     * 于是低分辨率下背景被缩了两次、变得只有左上角一小块，而立绘/边框仍是 1080p 的比例，
     * 看起来就是"立绘没有跟着缩小"。
     */
    private static int designWidth() {
        return ProjectConfig.VIDEO_WIDTH;
    }

    /** 设计画布高度，见 {@link #designWidth()}。 */
    private static int designHeight() {
        return ProjectConfig.VIDEO_HEIGHT;
    }

    /**
     * 创建"设计画布"合成器：显式把画布固定为 1080p 设计尺寸。
     *
     * <p>
     * 不能依赖 {@link FrameComposerService} 的默认尺寸——图层管理器会在
     * {@code addImageLayer} 时把自己的 width/height 撑大，画布尺寸必须由调用方显式设定。
     */
    private static FrameComposerService newDesignComposer() {
        FrameComposerService composer = new FrameComposerService();
        composer.setOutputSize(designWidth(), designHeight());
        return composer;
    }

    /**
     * 渲染record预览图-完整
     *
     * <p>渲染分两趟，而不是像早期那样三趟：
     * <ol>
     *   <li>第一趟把「背景 + 立绘 + 临时图片 + 边框」合成成场景图（{@code coImage}）；</li>
     *   <li>第二趟在<b>黑色底</b>上把场景图缩到 80% 居中，再叠 UI 与台词，直接得到最终画面。</li>
     * </ol>
     * 旧写法在第二趟里没有清空第一趟的图层，于是同一批场景图层会被再画一遍（虽然随后被黑底盖住），
     * UI 也额外单独合成了一张 1080p 的图——每次都白多分配/写入两三张 8MB 的画布。
     */
    public static BufferedImage renderPre(Record record, boolean plot, int width, int height) throws IOException {
        // 预览图看的是这一条的**第一帧**，用起点镜头（带 to 的镜头此刻就等于起点）
        return renderPre(record, plot, width, height, record.getCamera());
    }

    /** 带镜头的完整预览渲染（动态镜头逐帧出片时，每帧传入当时的镜头） */
    public static BufferedImage renderPre(Record record, boolean plot, int width, int height, Camera camera)
            throws IOException {
        if (logger.isDebugEnabled()) {
            logger.debug("开始渲染预览图: plot={}, 请求尺寸={}x{}, 记录 uuid={}", plot, width, height,
                    record.getUuid());
        }

        final int designW = designWidth();
        final int designH = designHeight();
        FrameComposerService composer = newDesignComposer();

        try {
            // 第一趟：场景层（全部在 1080p 设计画布上，与请求的输出分辨率无关）
            renderBackground(composer, record, camera);
            if (plot) {
                renderCharacters(composer, record, camera);
            }
            renderTempImages(composer, record, camera);
            composer.addImageLayer(border, 0, 0);
            BufferedImage coImage = composer.compose();
            // 必须清空：否则场景图层会在第二趟里被重复绘制一遍
            composer.clearLayers();

            // 第二趟：黑底 + 0.8 缩放的场景 + UI + 台词
            composer.addImageLayerScaled(coImage, designW / 10, designH / 10, PLOT_SCENE_SCALE);
            renderUIAndDialogue(composer, record, plot);

            // 合成最终图像：设计画布 → 请求的输出尺寸，只在此处缩放一次
            return composeFinalImage(composer, width, height, 0x000000);

        } catch (Exception e) {
            logger.error("渲染预览图严重失败", e);
            throw new IOException("渲染预览图失败", e);
        }
    }

    /**
     * 渲染record预览图-除了对话
     */
    public static BufferedImage renderPreExceptDialogue(Record record, boolean plot, int width, int height)
            throws IOException {
        return renderPreExceptDialogue(record, plot, width, height, record.getCamera());
    }

    /** 带镜头的"除对话"渲染：动态镜头出片时，静态层每帧都要走它 */
    public static BufferedImage renderPreExceptDialogue(Record record, boolean plot, int width, int height,
            Camera camera) throws IOException {
        final int designW = designWidth();
        final int designH = designHeight();
        FrameComposerService composer = newDesignComposer();

        try {
            // 第一趟：场景层
            renderBackground(composer, record, camera);
            if (plot) {
                renderCharacters(composer, record, camera);
            }
            renderTempImages(composer, record, camera);
            composer.addImageLayer(border, 0, 0);
            BufferedImage coImage = composer.compose();
            composer.clearLayers();

            // 第二趟：黑底 + 0.8 缩放的场景 + UI（不含台词）
            composer.addImageLayerScaled(coImage, designW / 10, designH / 10, PLOT_SCENE_SCALE);

            if (shouldRenderUI(record.getDialogue())) {
                renderUIBackground(composer, plot, record.getDialogue());
            } else {
                logger.debug("自由文本 + 隐藏UI：视频静态背景跳过UI层");
            }

            // 合成最终图像：设计画布 → 请求的输出尺寸，只在此处缩放一次
            return composeFinalImage(composer, width, height, 0x000000);

        } catch (Exception e) {
            logger.error("渲染预处理严重失败", e);
            throw new IOException("渲染预处理失败", e);
        }
    }

    /**
     * 仅渲染背景
     */
    public static BufferedImage renderBackgroundOnly(Record record, boolean plot, int width, int height)
            throws IOException {
        return renderBackgroundOnly(record, plot, width, height, record.getCamera());
    }

    /** 仅渲染背景（指定镜头） */
    public static BufferedImage renderBackgroundOnly(Record record, boolean plot, int width, int height,
            Camera camera) throws IOException {
        FrameComposerService composer = newDesignComposer();
        renderBackground(composer, record, camera);
        return composeFinalImage(composer, width, height, -1);
    }

    /**
     * 仅渲染角色立绘
     */
    public static BufferedImage renderCharactersOnly(Record record, int width, int height) throws IOException {
        return renderCharactersOnly(record, width, height, record.getCamera());
    }

    /** 仅渲染角色立绘（指定镜头） */
    public static BufferedImage renderCharactersOnly(Record record, int width, int height, Camera camera)
            throws IOException {
        FrameComposerService composer = newDesignComposer();
        renderCharacters(composer, record, camera);
        return composeFinalImage(composer, width, height, -1);
    }

    /**
     * 仅渲染UI和对话
     */
    public static BufferedImage renderUIOnly(Record record, boolean plot, int width, int height) throws IOException {
        FrameComposerService composer = newDesignComposer();
        renderUIAndDialogue(composer, record, plot);
        return composeFinalImage(composer, width, height, -1);
    }

    /**
     * 渲染背景层（铺满 1080p 设计画布；缩放/位置与输出分辨率无关，统一在设计画布内换算）
     */
    private static void renderBackground(FrameComposerService composer, Record record, Camera camera) {
        final int designW = designWidth();
        final int designH = designHeight();

        List<BackgroundVisual> bgList = record.getBackgroundVisuals();
        if (bgList == null || bgList.isEmpty()) {
            logger.warn("记录中没有背景信息，使用默认黑色背景");
            composer.addFullScreenMask(255);
            return;
        }

        // 打印每个背景的原图尺寸与手动变换参数，排查构图问题时能直接对照编辑器里的数值
        if (logger.isDebugEnabled()) {
            for (int i = 0; i < bgList.size(); i++) {
                BackgroundVisual bg = bgList.get(i);
                if (bg != null && bg.getBgImage() != null) {
                    logger.debug("  背景[{}]: name={}, 原图尺寸={}x{}, scale={}, pos=({},{})",
                            i, bg.getBackground().getName(),
                            bg.getBgImage().getWidth(), bg.getBgImage().getHeight(),
                            bg.getScale(), bg.getPosX(), bg.getPosY());
                }
            }
        }

        renderFullScreenBackground(composer, bgList, designW, designH, camera);
    }

    /**
     * 渲染全屏背景：逐张按各自的 scale / posX / posY 画进设计画布。
     *
     * <p>缩放交给合成阶段完成（{@link FrameComposerService#addImageLayerIntoRect}），
     * 不再"先把背景缩进一张画布大小的透明图层"：
     * <ul>
     *   <li>画布尺寸由 {@code setOutputSize} 锁定，放大后的背景不会再把画布撑大，
     *       超出部分在合成时被裁掉；</li>
     *   <li>省掉每张背景一张 8MB 中间图 + 一次整幅写入，放大 2 倍的 4K 背景更省掉 74MB。</li>
     * </ul>
     */
    private static void renderFullScreenBackground(FrameComposerService composer, List<BackgroundVisual> bgList,
            int width, int height, Camera camera) {
        // 摄像机只影响「场景层」：把背景的世界矩形换算到取景画布上。
        // 恒等（缺省）时走原路径，不加任何取整，旧工程逐像素不变。
        final boolean hasCamera = camera != null && !camera.isIdentity();
        final float zoom = hasCamera ? camera.getZoomFactor() : 1f;

        for (BackgroundVisual bg : bgList) {
            if (!validateBackgroundVisual(bg))
                continue;

            try {
                Rectangle bounds = bg.getDrawBounds(width, height);
                if (bounds == null) {
                    logger.warn("背景绘制区域为空，跳过: {}", bg);
                    continue;
                }
                if (hasCamera) {
                    composer.addImageLayerIntoRect(bg.getBgImage(),
                            camera.screenX(bounds.x), camera.screenY(bounds.y),
                            Math.max(1, Math.round(bounds.width * zoom)),
                            Math.max(1, Math.round(bounds.height * zoom)));
                } else {
                    composer.addImageLayerIntoRect(bg.getBgImage(), bounds.x, bounds.y, bounds.width, bounds.height);
                }
                if (logger.isDebugEnabled()) {
                    logger.debug("添加背景图层: name={}, scale={}, pos=({},{}), 绘制区域={}",
                            bg.getBackground().getName(), bg.getScale(), bg.getPosX(), bg.getPosY(), bounds);
                }
            } catch (Exception e) {
                logger.error("添加背景图层失败: {}", bg, e);
            }
        }
    }

    /**
     * 验证背景可视化对象
     */
    private static boolean validateBackgroundVisual(BackgroundVisual bg) {
        if (bg == null) {
            logger.warn("遇到空的BackgroundVisual，跳过");
            return false;
        }

        if (bg.getBgImage() == null) {
            logger.error("背景图像为空: {}", bg);
            return false;
        }

        return true;
    }

    /**
     * 渲染角色立绘层
     */
    private static void renderCharacters(FrameComposerService composer, Record record, Camera camera) {
        List<CharacterVisual> chars = record.getCharacters();
        if (chars == null || chars.isEmpty()) {
            logger.debug("记录中没有角色立绘信息");
            return;
        }

        logger.debug("开始渲染{}个角色立绘", chars.size());

        // 逆序渲染：数组末尾先绘制（底层），数组开头后绘制（顶层），与前端列表顺序一致
        for (int i = chars.size() - 1; i >= 0; i--) {
            CharacterVisual chara = chars.get(i);
            if (!validateCharacterVisual(chara, i))
                continue;

            try {
                renderSingleCharacter(composer, chara, camera);
            } catch (Exception e) {
                logger.error("添加角色图层失败: {}", chara.getChara().getCharacterName(), e);
            }
        }
    }

    /**
     * 验证角色可视化对象
     */
    private static boolean validateCharacterVisual(CharacterVisual chara, int index) {
        if (chara == null) {
            logger.warn("第{}个角色立绘为空，跳过", index + 1);
            return false;
        }

        if (chara.getImage() == null) {
            logger.error("角色图像为空: {}", chara.getChara().getCharacterName());
            return false;
        }

        return true;
    }

    /**
     * 渲染单个角色
     *
     * <p>摄像机只改「画在哪、画多大」：把世界坐标里的左上角换算成取景画布坐标，
     * 缩放再乘上 zoom。恒等时完全不经过换算，旧工程逐像素不变。
     */
    private static void renderSingleCharacter(FrameComposerService composer, CharacterVisual chara, Camera camera) {
        BufferedImage charImage = chara.getImage();
        // 实际缩放 = 裁剪推导的缩放 × 用户手动缩放（剧情编辑 → 立绘 → 缩放），
        // 与 CharacterVisual.updatePos() 里计算 posX/posY 用的是同一个值。
        float scaled = chara.getRenderScale();
        int x = chara.getPosX();
        int y = chara.getPosY();
        if (camera != null && !camera.isIdentity()) {
            scaled = camera.screenScale(scaled);
            x = camera.screenX(x);
            y = camera.screenY(y);
        }
        logger.debug("{}立绘渲染比例为{}", chara.getChara().getCharacterName(), scaled);

        if (chara.isDim()) {
            // 不是说话人要压暗
            BufferedImage darkenedImage = ImageDarkener.darkenImage(charImage, 0.5f);
            if (darkenedImage == null) {
                logger.error("图像压暗失败，使用原图: {}", chara.getChara().getCharacterName());
                composer.addImageLayerScaled(charImage, x, y, scaled);
            } else {
                composer.addImageLayerScaled(darkenedImage, x, y, scaled);
                logger.debug("添加压暗角色图层: {} at ({},{})",
                        chara.getChara().getCharacterName(), x, y);
            }
        } else {
            composer.addImageLayerScaled(charImage, x, y, scaled);
            logger.debug("添加角色图层: {} at ({},{})",
                    chara.getChara().getCharacterName(), x, y);
        }
    }

    /**
     * 渲染临时图片层（NPC、道具等）
     */
    private static void renderTempImages(FrameComposerService composer, Record record, Camera camera) {
        List<TempImageVisual> tempImages = record.getTempImages();
        if (tempImages == null || tempImages.isEmpty()) {
            return;
        }
        logger.debug("开始渲染临时图片层，共 {} 张", tempImages.size());
        final boolean hasCamera = camera != null && !camera.isIdentity();
        // 逆序渲染：数组末尾先绘制（底层），数组开头后绘制（顶层），与前端列表顺序一致
        for (int i = tempImages.size() - 1; i >= 0; i--) {
            TempImageVisual temp = tempImages.get(i);
            try {
                BufferedImage img = temp.getImage();
                if (img == null) {
                    logger.warn("临时图片为空，跳过: uuid={}, path={}", temp.getUuid(), temp.getImagePath());
                    continue;
                }
                if (temp.isDim()) {
                    img = ImageDarkener.darkenImage(img, 0.5f);
                    if (img == null) {
                        logger.warn("临时图片压暗失败，使用原图: uuid={}", temp.getUuid());
                        img = temp.getImage();
                    }
                }
                int x = temp.getPosX();
                int y = temp.getPosY();
                float scale = temp.getScale();
                if (hasCamera) {
                    x = camera.screenX(x);
                    y = camera.screenY(y);
                    scale = camera.screenScale(scale);
                }
                composer.addImageLayerScaled(img, x, y, scale);
                logger.debug("添加临时图片图层: uuid={} at ({},{}), scale={}, dim={}",
                        temp.getUuid(), x, y, scale, temp.isDim());
            } catch (Exception e) {
                logger.error("渲染临时图片失败: uuid={}", temp.getUuid(), e);
            }
        }
    }

    /**
     * 角色名片（名字 + 阵营）内存缓存：key = 角色名/阵营/两个颜色。
     *
     * <p>名片只取决于这四个字段，与记录内容无关；而它每次生成要做「纹理着色 + 1920×1080 画布 +
     * 整幅透明边界扫描」，实测 ~50ms。前端每改一个字就重渲染一次预览，说话人却没变，
     * 没有这层缓存就是白算一遍。旧实现只靠 {@link CharacterRef} 的实例字段缓存，
     * 而每次 HTTP 请求都会把 Record 反序列化成全新对象，实例缓存永远命中不了。
     *
     * <p>上限按字节数控制（约 {@value #NAME_PLATE_CACHE_MAX_BYTES} 字节，一张名片约 2.9MB），
     * 超出后淘汰最久未使用的条目。
     */
    private static final long NAME_PLATE_CACHE_MAX_BYTES = 48L * 1024 * 1024;
    private static final java.util.Map<String, BufferedImage> namePlateCache =
            new java.util.LinkedHashMap<>(16, 0.75f, true);
    private static long namePlateCacheBytes = 0;

    /**
     * 角色用, 渲染名字+阵营UI（带内存缓存）
     *
     * <p>返回的图像可能被多处共享，调用方只能读不能改。
     *
     * @param myCharacter 说话人引用
     * @return 名片图（透明底，尺寸按内容裁剪）；生成失败返回 {@code null}
     */
    public static BufferedImage renderCharaNameUI(CharacterRef myCharacter) {
        String key = namePlateCacheKey(myCharacter);
        if (key != null) {
            synchronized (namePlateCache) {
                BufferedImage cached = namePlateCache.get(key);
                if (cached != null) {
                    return cached;
                }
            }
        }

        BufferedImage rendered = renderCharaNameUIUncached(myCharacter);
        if (rendered != null && key != null) {
            synchronized (namePlateCache) {
                namePlateCache.put(key, rendered);
                namePlateCacheBytes += estimateImageBytes(rendered);
                java.util.Iterator<java.util.Map.Entry<String, BufferedImage>> it = namePlateCache.entrySet()
                        .iterator();
                while (it.hasNext() && namePlateCacheBytes > NAME_PLATE_CACHE_MAX_BYTES) {
                    java.util.Map.Entry<String, BufferedImage> eldest = it.next();
                    namePlateCacheBytes -= estimateImageBytes(eldest.getValue());
                    it.remove();
                }
            }
        }
        return rendered;
    }

    /** 名片缓存 key：只包含真正影响画面的字段。 */
    private static String namePlateCacheKey(CharacterRef character) {
        if (character == null) {
            return null;
        }
        String name = character.getCharacterName() == null ? "" : character.getCharacterName();
        String faction = character.getFaction() == null ? "" : character.getFaction();
        int bg = character.getColorBg() == null ? 0 : character.getColorBg().getRGB();
        int text = character.getColorText() == null ? 0 : character.getColorText().getRGB();
        return name + '|' + faction + '|' + bg + '|' + text;
    }

    /** 估算一张图占用的字节数（用于缓存淘汰）。 */
    private static long estimateImageBytes(BufferedImage image) {
        long pixels = (long) image.getWidth() * image.getHeight();
        int bytesPerPixel = Math.max(1, (image.getColorModel().getPixelSize() + 7) / 8);
        return pixels * bytesPerPixel;
    }

    /** 当前名片缓存条目数（诊断用）。 */
    public static int namePlateCacheSize() {
        synchronized (namePlateCache) {
            return namePlateCache.size();
        }
    }

    /** 真正生成名片图（不做缓存）。 */
    private static BufferedImage renderCharaNameUIUncached(CharacterRef myCharacter) {
        try {
            if (logger.isDebugEnabled()) {
                logger.debug("生成名片图片: 角色ID={}, 角色名={}",
                        myCharacter.getCharacterID(), myCharacter.getCharacterName());
            }

            // 使用Thumbnailator优化图片处理
            BufferedImage camp = Thumbnails.of(speaker_camp)
                    .size(1300, 550)
                    .keepAspectRatio(true)
                    .asBufferedImage();

            BufferedImage name = TextureColorizer.colorizeToRGB(speaker_name, myCharacter.getColorBg());
            name = Thumbnails.of(name)
                    .size(1300, 550)
                    .keepAspectRatio(true)
                    .asBufferedImage();

            // 先创建临时名片图片，使用原始尺寸
            BufferedImage temp = new BufferedImage(1920, 1080, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g2d = temp.createGraphics();
            RenderQualityUtils.setupUltraQualityRendering(g2d);

            // 绘制背景和文字
            g2d.drawImage(camp, 0, 0, null);
            g2d.drawImage(name, 0, 0, null);

            // 添加角色名
            Font nameFont = FontLoader.getChineseFont(ProjectConfig.CHARACTER_NAME_FONT_SIZE);
            g2d.setFont(nameFont);
            g2d.setColor(myCharacter.getColorText());

            // 计算文字位置以实现居中对齐
            FontMetrics nameMetrics = g2d.getFontMetrics(nameFont);
            int nameWidth = nameMetrics.stringWidth(myCharacter.getCharacterName());
            int nameHeight = nameMetrics.getHeight();
            int nameBaseline = nameMetrics.getAscent(); // 获取文字基线位置

            // 计算文字中心点，确保与旋转中心对齐：文字中心 = 锚点位置
            int centerX = ProjectConfig.CHARACTER_NAME_X;
            int centerY = ProjectConfig.CHARACTER_NAME_Y;

            // 计算文字左上角位置，使文字中心与锚点对齐
            int nameX = centerX - nameWidth / 2;
            int nameY = centerY - nameHeight / 2 + nameBaseline;

            // 保存当前变换状态
            AffineTransform originalTransform = g2d.getTransform();

            // 应用旋转（围绕锚点旋转）
            if (ProjectConfig.CHARACTER_NAME_ROTATION != 0) {
                AffineTransform transform = new AffineTransform();
                transform.rotate(Math.toRadians(ProjectConfig.CHARACTER_NAME_ROTATION),
                        centerX, centerY);
                g2d.setTransform(transform);
            }

            // 添加文字阴影
            g2d.setColor(Color.BLACK);
            int shadowX = nameX + ProjectConfig.SHADOW_OFFSET_NAME_X;
            int shadowY = nameY + ProjectConfig.SHADOW_OFFSET_NAME_Y;
            g2d.drawString(myCharacter.getCharacterName(), shadowX, shadowY);

            // 绘制主文字
            g2d.setColor(myCharacter.getColorText());
            g2d.drawString(myCharacter.getCharacterName(), nameX, nameY);

            // 恢复原始变换状态
            g2d.setTransform(originalTransform);

            // 添加阵营文字
            Font factionFont = FontLoader.getChineseFont(ProjectConfig.FACTION_FONT_SIZE);
            g2d.setFont(factionFont);
            g2d.setColor(ProjectConfig.FACTION_COLOR);

            // 计算文字位置以实现居中对齐
            FontMetrics factionMetrics = g2d.getFontMetrics(factionFont);
            int factionWidth = factionMetrics.stringWidth(myCharacter.getFaction());
            int factionHeight = factionMetrics.getHeight();
            int factionBaseline = factionMetrics.getAscent(); // 获取文字基线位置

            // 文字中心 = 锚点位置
            int factionCenterX = ProjectConfig.FACTION_X;
            int factionCenterY = ProjectConfig.FACTION_Y;

            // 计算文字左上角位置，使文字中心与锚点对齐
            int factionX = factionCenterX - factionWidth / 2;
            int factionY = factionCenterY - factionHeight / 2 + factionBaseline;

            // 保存当前变换状态
            originalTransform = g2d.getTransform();

            // 应用旋转（围绕锚点旋转）
            if (ProjectConfig.FACTION_ROTATION != 0) {
                AffineTransform transform = new AffineTransform();
                transform.rotate(Math.toRadians(ProjectConfig.FACTION_ROTATION),
                        factionCenterX, factionCenterY);
                g2d.setTransform(transform);
            }

            // 添加文字阴影
            g2d.setColor(Color.BLACK);
            int factionShadowX = factionX + (ProjectConfig.SHADOW_OFFSET_NAME_X - 1);
            int factionShadowY = factionY + ProjectConfig.SHADOW_OFFSET_NAME_Y;
            g2d.drawString(myCharacter.getFaction(), factionShadowX, factionShadowY);

            // 绘制主文字
            g2d.setColor(ProjectConfig.FACTION_COLOR);
            g2d.drawString(myCharacter.getFaction(), factionX, factionY);

            // 恢复原始变换状态
            g2d.setTransform(originalTransform);

            g2d.dispose();

            // 裁剪透明区域，去除多余的空白（返回的就是新图，不用再复制一遍）
            BufferedImage cropped = ImageCropper.cropTransparentAreas(temp);
            logger.debug("名片图片裁剪完成，最终尺寸: {}x{}", cropped.getWidth(), cropped.getHeight());
            return cropped;
        } catch (Exception e) {
            logger.error("生成名片图片失败: " + e.getMessage(), e);
            return null;
        }
    }

    /**
     * 渲染UI和对话层（设计画布坐标，与输出分辨率无关；缩放由 {@link #composeFinalImage} 统一完成）
     */
    private static void renderUIAndDialogue(FrameComposerService composer, Record record, boolean plot)
            throws IOException {
        Dialogue dialogue = record.getDialogue();
        if (dialogue == null) {
            logger.error("对话信息为空，无法渲染UI");
            throw new IOException("对话信息为空");
        }

        if (shouldRenderUI(dialogue)) {
            renderUIBackground(composer, plot, dialogue);
        } else {
            logger.debug("自由文本 + 隐藏UI：跳过UI背景层（对话框/说话人名片/地点牌均不渲染）");
        }
        renderDialogueText(composer, dialogue);
    }

    /**
     * 判断是否需要渲染UI背景层。
     *
     * <p>"自由文本"说话人 + 勾选"隐藏UI"时，整层UI（对话框 / 说话人名片 / 地点牌）都不渲染，
     * 画面只保留背景、立绘与居中的自由文本。预览、视频静态帧与 UI_ONLY 分层都走这一个判断。
     *
     * @param dialogue 对话信息；为 null 时按"需要渲染"处理（由调用方自行报错）
     */
    public static boolean shouldRenderUI(Dialogue dialogue) {
        return dialogue == null || !dialogue.isFreeText() || !dialogue.isHideUI();
    }

    /**
     * 渲染UI背景（设计画布坐标）
     *
     * <p>直接把 UI 图层加到调用方的合成器上，而不是先 {@code renderUI()} 合成一张独立的
     * 1080p UI 图再贴过来——少一张 8MB 的中间画布和一次整幅写入。
     */
    private static void renderUIBackground(FrameComposerService composer, boolean plot, Dialogue dialogue)
            throws IOException {
        try {
            addUILayers(composer, plot, dialogue);
        } catch (Exception e) {
            logger.error("渲染UI失败", e);
            throw new IOException("UI渲染失败", e);
        }
    }

    /**
     * 渲染对话文本
     */
    private static void renderDialogueText(FrameComposerService composer, Dialogue dialogue) throws IOException {
        try {
            if (dialogue.isFreeText()) {
                // 自由文本：字体与旁白一致，文字块中心可由 freeTextX/freeTextY 相对画面中心偏移，
                // 字号、颜色、加粗/斜体均可自定义
                Color freeTextColor = ProjectConfig.parseColor(
                        dialogue.getFreeTextColor(), ProjectConfig.DEFAULT_TEXT_COLOR);
                int centerX = ProjectConfig.FREE_TEXT_CENTER_X + dialogue.getFreeTextX();
                int centerY = ProjectConfig.FREE_TEXT_CENTER_Y + dialogue.getFreeTextY();
                int fontSize = dialogue.getEffectiveFreeTextFontSize();
                composer.addDialogueTextFreeText(dialogue.getText(), dialogue.isBold(), dialogue.isItalic(),
                        freeTextColor, fontSize, centerX, centerY);
                logger.debug("添加自由文本（中心=({},{}), 字号={}, 颜色={}, 加粗={}, 斜体={}）: {}",
                        centerX, centerY, fontSize, dialogue.getFreeTextColor(), dialogue.isBold(),
                        dialogue.isItalic(), abbreviateText(dialogue.getText()));
            } else if (dialogue.isNarrator()) {
                composer.addDialogueTextCenter(dialogue.getText());
                logger.debug("添加居中旁白文本: {}", abbreviateText(dialogue.getText()));
            } else {
                composer.addDialogueTextLeft(dialogue.getText());
                logger.debug("添加左对齐对话文本: {}", abbreviateText(dialogue.getText()));
            }
        } catch (Exception e) {
            logger.error("添加对话文本失败", e);
            throw new IOException("对话文本渲染失败", e);
        }
    }

    /**
     * 合成最终图像：在设计画布上合成，然后<strong>只在此处</strong>缩放到请求的输出尺寸。
     *
     * <p>
     * 1080p 输出时这里不做任何缩放（{@code actual == 期望}），低分辨率输出时整幅画面
     * （背景/立绘/边框/UI/文字）等比缩小一次，因此任何分辨率下的构图都与 1080p 完全一致。
     *
     * @param backgroundRgb 底色（24 位 RGB）。给 >= 0 的值时直接以该色打底合成，
     *                      比"再往图层里塞一块全屏纯色"少一张 1080p（8MB）中间图；
     *                      传 -1 表示透明底
     */
    private static BufferedImage composeFinalImage(FrameComposerService composer, int width, int height,
            int backgroundRgb) {
        BufferedImage result;
        if (backgroundRgb >= 0) {
            result = composer.composeOnBackground(backgroundRgb);
        } else {
            result = composer.compose();
        }

        if (result == null) {
            logger.error("图像合成失败，返回空图像 {}x{}", width, height);
            result = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        } else {
            int actualW = result.getWidth();
            int actualH = result.getHeight();
            if (actualW != width || actualH != height) {
                logger.debug("输出分辨率 {}x{} ≠ 设计画布 {}x{}，整幅画面等比缩放一次",
                        width, height, actualW, actualH);
                result = RenderQualityUtils.scaleImageHighQuality(result, width, height);
            }
        }

        composer.clearLayers();
        return result;
    }

    /**
     * 缩写长文本用于日志显示
     */
    private static String abbreviateText(String text) {
        if (text == null)
            return "null";
        if (text.length() <= 50)
            return text;
        return text.substring(0, 47) + "...";
    }

    /**
     * 从磁盘加载临时名片缓存
     *
     * @param cacheKey 缓存键 "name|faction"
     * @return 缓存的 BufferedImage，不存在则返回 null
     */
    private static BufferedImage loadTempCardFromDisk(String cacheKey) {
        try {
            java.io.File dir = new java.io.File(TEMP_CARD_DIR);
            if (!dir.exists())
                return null;
            java.io.File file = new java.io.File(dir, cacheKey.replace("|", "_") + ".png");
            if (file.exists()) {
                logger.info("从磁盘加载临时名片: {}", file.getAbsolutePath());
                return javax.imageio.ImageIO.read(file);
            }
        } catch (Exception e) {
            logger.warn("加载临时名片磁盘缓存失败: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 保存临时名片到磁盘
     *
     * @param cacheKey 缓存键 "name|faction"
     * @param image    要保存的 BufferedImage
     */
    private static void saveTempCardToDisk(String cacheKey, BufferedImage image) {
        try {
            java.io.File dir = new java.io.File(TEMP_CARD_DIR);
            if (!dir.exists()) {
                dir.mkdirs();
                logger.info("创建临时名片目录: {}", dir.getAbsolutePath());
            }
            java.io.File file = new java.io.File(dir, cacheKey.replace("|", "_") + ".png");
            javax.imageio.ImageIO.write(image, "PNG", file);
            logger.info("临时名片已保存到磁盘: {}", file.getAbsolutePath());
        } catch (Exception e) {
            logger.warn("保存临时名片到磁盘失败: {}", e.getMessage());
        }
    }

    /**
     * 渲染整个UI（<strong>返回设计画布尺寸的 UI 图层</strong>，不按输出分辨率缩放）。
     *
     * <p>
     * UI 素材（对话框/名片/地点牌）与 {@link ProjectConfig} 里的锚点都是 1080p 设计尺寸，
     * 因此这里固定画在设计画布上；调用方把整幅画面一次性缩放到输出分辨率
     * （见 {@link #composeFinalImage}）。若在这里提前缩放，UI 会被缩放两次而缩到左上角。
     *
     * @param plot     是否为剧情模式
     * @param dialogue 对话信息
     * @return 渲染后的UI图像，尺寸为 {@link #designWidth()} × {@link #designHeight()}
     * @throws IOException 当渲染失败时抛出
     */
    public static BufferedImage renderUI(boolean plot, Dialogue dialogue) throws IOException {
        int width = designWidth();
        int height = designHeight();

        if (dialogue == null) {
            logger.error("对话信息为空，无法渲染UI");
            throw new IOException("对话信息为空");
        }

        // 自由文本 + 隐藏UI：返回一张全透明图层，保证任何调用方（预览/视频/UI_ONLY）都拿不到UI元素
        if (!shouldRenderUI(dialogue)) {
            logger.debug("自由文本 + 隐藏UI：返回透明UI图层");
            return new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        }

        FrameComposerService composer = newDesignComposer();
        try {
            addUILayers(composer, plot, dialogue);
            BufferedImage ui = composer.compose();
            if (ui == null) {
                logger.error("UI图像合成失败，返回空图像");
                ui = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
            }
            return ui;
        } finally {
            composer.clearLayers();
        }
    }

    /**
     * 把 UI 图层（对话框 / 说话人名片 / 地点牌 / 地点文字）加到给定合成器上。
     *
     * <p>拆出这个方法是为了让预览图不必为了 UI 单独合成一张 1080p 的图再贴过来：
     * 直接把 UI 图层加到最后那张画布上，省一张 8MB 的图和一次整幅写入。
     *
     * @param composer 目标合成器（尺寸应为设计画布）
     * @param plot     是否为剧情模式
     * @param dialogue 对话信息
     */
    public static void addUILayers(FrameComposerService composer, boolean plot, Dialogue dialogue)
            throws IOException {
        if (dialogue == null) {
            return;
        }
        // 渲染对话框UI
        if (dialogBox != null) {
            composer.addImageLayerScaled(dialogBox, 264, 826, 1.46f);
            logger.debug("添加对话框UI: 位置(264,826), 缩放1.46x");
        } else {
            logger.error("对话框图像未加载，跳过渲染");
        }

        CharacterRef speaker = dialogue.getSpeakerCharacter();
        if (dialogue.isFreeText()) {
            // 自由文本模式：说话人不上屏，不生成角色名片（自由文本本身就是屏幕上的文字）
            logger.debug("自由文本模式：跳过说话人名片");
            speaker = null;
        } else if (dialogue.isNarrator()) {
            // 旁白模式：说话人不上屏。这里必须按 Dialogue.speakerName 判断，
            // 不能只看 speakerC 里的 CharacterRef——新建记录会继承上一条的 speakerC，
            // 旁白记录里可能残留某个角色引用，只看 speaker.isNarrator() 会把名牌画出来。
            logger.debug("旁白模式：跳过说话人名片（不渲染角色名/阵营 UI）");
            speaker = null;
        } else if (speaker == null) {
            // speakerC 为空，尝试从 Dialogue 的 speakerName/faction 构造临时 CharacterRef
            String name = dialogue.getSpeakerName();
            if (name != null && !name.trim().isEmpty() && !"旁白".equals(name.trim())) {
                String faction = dialogue.getFaction();
                if (faction == null || faction.trim().isEmpty()) {
                    faction = "未设定";
                }
                String cacheKey = name.trim() + "|" + faction.trim();
                logger.debug("speakerC 为空，使用 Dialogue 构造临时说话人: name={}, faction={}", name, faction);

                // 先查内存缓存，避免重复渲染
                BufferedImage cachedCard = tempCardCache.get(cacheKey);
                if (cachedCard != null) {
                    logger.debug("命中临时名片内存缓存: {}", cacheKey);
                    composer.addImageLayerScaled(cachedCard, -26, 789, 0.28f);
                    // 跳过后续 speaker 分支
                    speaker = null;
                } else {
                    // 尝试从磁盘缓存加载
                    BufferedImage diskCard = loadTempCardFromDisk(cacheKey);
                    if (diskCard != null) {
                        logger.debug("命中临时名片磁盘缓存: {}", cacheKey);
                        tempCardCache.put(cacheKey, diskCard);
                        composer.addImageLayerScaled(diskCard, -26, 789, 0.28f);
                        speaker = null;
                    } else {
                        // 构造临时 CharacterRef 用于渲染
                        speaker = new CharacterRef("temp_" + name.trim(), name.trim(), 0,
                                faction.trim(),
                                ProjectConfig.DEFAULT_BG_COLOR,
                                ProjectConfig.DEFAULT_TEXT_COLOR);
                        logger.debug("新建临时 CharacterRef: id=temp_{}, faction={}", name.trim(), faction);
                    }
                }
            } else {
                logger.debug("speakerName 为空或为旁白，使用默认旁白处理");
                speaker = CharacterRef.getDefaultNarrator();
            }
        }

        if (speaker != null && !speaker.isNarrator()) {
            logger.debug("渲染说话人UI元素: {}", speaker.getCharacterName());
            BufferedImage cardImage = speaker.getColorNameImage();
            if (cardImage != null) {
                composer.addImageLayerScaled(cardImage, -26, 789, 0.28f);
            }

            // 若是临时名片（id 以 "temp_" 开头），缓存并保存到磁盘
            if (cardImage != null && speaker.getCharacterID() != null
                    && speaker.getCharacterID().startsWith("temp_")) {
                String cacheKey = speaker.getCharacterName() + "|" + speaker.getFaction();
                tempCardCache.put(cacheKey, cardImage);
                saveTempCardToDisk(cacheKey, cardImage);
            }
        } else if (speaker != null) {
            logger.debug("旁白模式，跳过说话人UI元素");
        }

        if (plot) { // 如果是剧情，需要渲染地点UI
            if (location != null) {
                composer.addImageLayerScaled(location, -2, -117, 0.41f);
                logger.debug("添加地点UI: 位置(-2,-117), 缩放0.41x");
            } else {
                logger.error("地点UI图像未加载，跳过渲染");
            }

            String locationText = dialogue.getLocation();
            if (locationText != null && !locationText.trim().isEmpty()) {
                composer.addLocationText(locationText);
                logger.debug("添加地点文本: {}", locationText);
            } else {
                logger.debug("地点文本为空，跳过渲染");
            }
        } else {
            logger.debug("非剧情模式，跳过地点UI");
        }
    }

    /**
     * 高质量图像缩放
     */
    public static BufferedImage scaleImageHighQuality(BufferedImage original, int newWidth, int newHeight) {
        BufferedImage scaledImage = new BufferedImage(newWidth, newHeight, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g2d = scaledImage.createGraphics();

        RenderQualityUtils.setupUltraQualityRendering(g2d);

        // 使用双三次插值进行高质量缩放
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                RenderingHints.VALUE_INTERPOLATION_BICUBIC);

        g2d.drawImage(original, 0, 0, newWidth, newHeight, null);
        g2d.dispose();

        return scaledImage;
    }

}
